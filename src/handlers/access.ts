import type { AccessDecision, ContentRestrictionRecord } from "../types.js";
import { getCustomerRecordByEmail, upsertCustomerRecord } from "../customers.js";
import { isPaidPlanSlug, type PaidPlanSlug } from "../plans.js";
import { StripeClient } from "../stripe.js";
import { isRecord, normalizeStringArray, parsePaidPlanSlugs, uniqueStrings, unwrapStoredRecord } from "../utils.js";
import { getSessionEmail } from "./auth.js";
import { loadSettings, resolveRequiredProductIds } from "./settings.js";

function parseRequiredPlanSlugsFromUrl(url: URL): PaidPlanSlug[] {
	const allValues = url.searchParams.getAll("requiredPlanSlugs");
	if (allValues.length === 0) {
		const single = url.searchParams.get("requiredPlanSlugs");
		return single ? single.split(",").map((value) => value.trim()).filter(isPaidPlanSlug) : [];
	}
	return allValues.map((value) => value.trim()).filter(isPaidPlanSlug);
}

function readAccessInput(ctx: any) {
	const url = new URL(ctx.request.url);
	const body = isRecord(ctx.input) ? ctx.input : {};
	return {
		contentId:
			typeof body.contentId === "string" ? body.contentId : (url.searchParams.get("contentId") ?? "").trim(),
		collectionSlug:
			typeof body.collectionSlug === "string"
				? body.collectionSlug
				: (url.searchParams.get("collectionSlug") || url.searchParams.get("collection") || "").trim(),
		slug:
			typeof body.slug === "string"
				? body.slug
				: (url.searchParams.get("slug") || null),
		requiredPlanSlugs:
			Array.isArray(body.requiredPlanSlugs)
				? parsePaidPlanSlugs(body.requiredPlanSlugs)
				: parseRequiredPlanSlugsFromUrl(url),
	};
}

function normalizeRestrictionRecord(record: unknown): ContentRestrictionRecord | null {
	const data = unwrapStoredRecord<ContentRestrictionRecord>(record);
	if (!data || typeof data.contentId !== "string" || typeof data.collectionSlug !== "string") {
		return null;
	}

	return {
		contentId: data.contentId,
		collectionSlug: data.collectionSlug,
		slug: typeof data.slug === "string" ? data.slug : null,
		title: typeof data.title === "string" ? data.title : null,
		requiredPlanSlugs: parsePaidPlanSlugs(data.requiredPlanSlugs),
		productIds: normalizeStringArray(data.productIds),
		source: data.source === "manual" ? "manual" : "manual",
		createdAt: typeof data.createdAt === "string" ? data.createdAt : new Date().toISOString(),
		updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : data.createdAt,
	};
}

async function getRestrictionRecords(
	ctx: any,
	collectionSlug: string,
	contentId: string,
	slug: string | null,
): Promise<ContentRestrictionRecord[]> {
	const records: ContentRestrictionRecord[] = [];
	const primary = normalizeRestrictionRecord(await ctx.storage.restrictions.get(`${collectionSlug}:${contentId}`));
	if (primary) {
		records.push(primary);
	}
	if (slug && slug !== contentId) {
		const legacy = normalizeRestrictionRecord(await ctx.storage.restrictions.get(`${collectionSlug}:${slug}`));
		if (legacy) {
			records.push(legacy);
		}
	}
	return records;
}

export async function accessHandler(ctx: any): Promise<AccessDecision | { ok: false; error: string }> {
	const { contentId, collectionSlug, slug, requiredPlanSlugs: callerRequiredPlanSlugs } = readAccessInput(ctx);
	if (!contentId || !collectionSlug) {
		return { ok: false, error: "contentId and collectionSlug are required." };
	}

	const restrictionRecords = await getRestrictionRecords(ctx, collectionSlug, contentId, slug);
	const restrictionPlanSlugs = restrictionRecords.flatMap((record) => record.requiredPlanSlugs || []);
	const restrictionProductIds = restrictionRecords.flatMap((record) => record.productIds || []);
	const requiredPlanSlugs = uniqueStrings([...restrictionPlanSlugs, ...callerRequiredPlanSlugs]).filter(isPaidPlanSlug);
	const settings = await loadSettings(ctx);
	const requiredProductIds = uniqueStrings([
		...restrictionProductIds,
		...resolveRequiredProductIds(settings.planMappings, requiredPlanSlugs),
	]);
	const restricted = requiredPlanSlugs.length > 0 || requiredProductIds.length > 0;
	const email = await getSessionEmail(ctx);
	const authenticated = Boolean(email);

	if (!restricted) {
		return {
			restricted: false,
			authenticated,
			hasAccess: true,
			email,
			requiredPlanSlugs,
			requiredProductIds,
		};
	}

	if (!authenticated || !email) {
		return {
			restricted: true,
			authenticated: false,
			hasAccess: false,
			email: null,
			requiredPlanSlugs,
			requiredProductIds,
		};
	}

	if (!settings.stripeSecretKey) {
		return {
			restricted: true,
			authenticated: true,
			hasAccess: false,
			email,
			requiredPlanSlugs,
			requiredProductIds,
			error: "Stripe is not configured yet.",
		};
	}

	if (requiredPlanSlugs.length > 0 && requiredProductIds.length === 0) {
		return {
			restricted: true,
			authenticated: true,
			hasAccess: false,
			email,
			requiredPlanSlugs,
			requiredProductIds,
			error: "Required plans are not mapped to Stripe products yet.",
		};
	}

	const stripe = new StripeClient(settings.stripeSecretKey, ctx.http.fetch);
	const localCustomer = await getCustomerRecordByEmail(ctx, email);
	if (localCustomer) {
		try {
			if (await stripe.customerHasProduct(localCustomer.stripeCustomerId, requiredProductIds)) {
				return {
					restricted: true,
					authenticated: true,
					hasAccess: true,
					email,
					requiredPlanSlugs,
					requiredProductIds,
				};
			}
		} catch (error) {
			ctx.log.warn("Failed to verify cached Stripe customer access", error);
		}
	}

	try {
		const stripeCustomers = await stripe.getCustomersByEmail(email);
		for (const stripeCustomer of stripeCustomers.data) {
			if (await stripe.customerHasProduct(stripeCustomer.id, requiredProductIds)) {
				await upsertCustomerRecord(ctx, email, stripeCustomer.id);
				return {
					restricted: true,
					authenticated: true,
					hasAccess: true,
					email,
					requiredPlanSlugs,
					requiredProductIds,
				};
			}
		}
	} catch (error) {
		ctx.log.error("Failed to verify Stripe access", error);
		return {
			restricted: true,
			authenticated: true,
			hasAccess: false,
			email,
			requiredPlanSlugs,
			requiredProductIds,
			error: "Unable to verify Stripe access right now.",
		};
	}

	return {
		restricted: true,
		authenticated: true,
		hasAccess: false,
		email,
		requiredPlanSlugs,
		requiredProductIds,
	};
}
