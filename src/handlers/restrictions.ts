import type { ContentRestrictionRecord, TaxonomyRestrictionRecord } from "../types.js";
import { parsePaidPlanSlugs, normalizeStringArray, nowIso, unwrapStoredRecord } from "../utils.js";

function normalizeContentRestriction(record: unknown): ContentRestrictionRecord | null {
	const data = unwrapStoredRecord<ContentRestrictionRecord>(record);
	if (!data || typeof data.contentId !== "string" || typeof data.collectionSlug !== "string") {
		return null;
	}

	const createdAt = typeof data.createdAt === "string" ? data.createdAt : nowIso();
	return {
		contentId: data.contentId,
		collectionSlug: data.collectionSlug,
		slug: typeof data.slug === "string" ? data.slug : null,
		title: typeof data.title === "string" ? data.title : null,
		requiredPlanSlugs: parsePaidPlanSlugs(data.requiredPlanSlugs),
		productIds: normalizeStringArray(data.productIds),
		source: "manual",
		createdAt,
		updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : createdAt,
	};
}

function normalizeTaxonomyRestriction(record: unknown): TaxonomyRestrictionRecord | null {
	const data = unwrapStoredRecord<TaxonomyRestrictionRecord>(record);
	if (!data || typeof data.taxonomyName !== "string" || typeof data.termId !== "string") {
		return null;
	}

	const createdAt = typeof data.createdAt === "string" ? data.createdAt : nowIso();
	return {
		taxonomyName: data.taxonomyName,
		termId: data.termId,
		requiredPlanSlugs: parsePaidPlanSlugs(data.requiredPlanSlugs),
		productIds: normalizeStringArray(data.productIds),
		createdAt,
		updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : createdAt,
	};
}

export async function restrictionsHandler(ctx: any) {
	const method = ctx.request.method;
	const url = new URL(ctx.request.url);

	if (method === "GET") {
		const type = url.searchParams.get("type") || "content";
		if (type === "taxonomy") {
			const taxonomyName = url.searchParams.get("taxonomy");
			const result = await ctx.storage.taxonomyRestrictions.query(
				taxonomyName ? { where: { taxonomyName }, limit: 200 } : { limit: 200 },
			);
			return {
				items: result.items
					.map((item: { id: string; data: unknown }) => {
						const data = normalizeTaxonomyRestriction(item.data);
						return data ? { id: item.id, data } : null;
					})
					.filter(Boolean),
			};
		}

		const collectionSlug = url.searchParams.get("collection");
		const contentId = url.searchParams.get("contentId");
		const slug = url.searchParams.get("slug");

		if (collectionSlug && contentId) {
			const items: Array<{ id: string; data: ContentRestrictionRecord }> = [];
			const direct = normalizeContentRestriction(
				await ctx.storage.restrictions.get(`${collectionSlug}:${contentId}`),
			);
			if (direct) {
				items.push({ id: `${collectionSlug}:${contentId}`, data: direct });
			}
			if (slug && slug !== contentId) {
				const legacy = normalizeContentRestriction(
					await ctx.storage.restrictions.get(`${collectionSlug}:${slug}`),
				);
				if (legacy) {
					items.push({ id: `${collectionSlug}:${slug}`, data: legacy });
				}
			}
			return { items };
		}

		const result = await ctx.storage.restrictions.query(
			collectionSlug ? { where: { collectionSlug }, limit: 200 } : { limit: 200 },
		);
		const items = result.items
			.map((item: { id: string; data: unknown }) => {
				const data = normalizeContentRestriction(item.data);
				return data ? { id: item.id, data } : null;
			})
			.filter((item): item is { id: string; data: ContentRestrictionRecord } => Boolean(item))
			.filter((item) => (contentId ? item.data.contentId === contentId : true))
			.filter((item) => (slug ? item.data.slug === slug || item.data.contentId === slug : true));
		return { items };
	}

	if (method === "POST") {
		const body = ctx.input && typeof ctx.input === "object" ? ctx.input : {};
		if ((body as Record<string, unknown>).type === "taxonomy") {
			const taxonomyName = typeof (body as Record<string, unknown>).taxonomyName === "string" ? (body as Record<string, unknown>).taxonomyName : "";
			const termId = typeof (body as Record<string, unknown>).termId === "string" ? (body as Record<string, unknown>).termId : "";
			if (!taxonomyName || !termId) {
				return { ok: false, error: "taxonomyName and termId are required." };
			}
			const key = `${taxonomyName}:${termId}`;
			const existing = normalizeTaxonomyRestriction(await ctx.storage.taxonomyRestrictions.get(key));
			await ctx.storage.taxonomyRestrictions.put(key, {
				taxonomyName,
				termId,
				requiredPlanSlugs: parsePaidPlanSlugs((body as Record<string, unknown>).requiredPlanSlugs),
				productIds: normalizeStringArray((body as Record<string, unknown>).productIds),
				createdAt: existing?.createdAt ?? nowIso(),
				updatedAt: nowIso(),
			});
			return { ok: true };
		}

		const contentId = typeof (body as Record<string, unknown>).contentId === "string" ? (body as Record<string, unknown>).contentId : "";
		const collectionSlug = typeof (body as Record<string, unknown>).collectionSlug === "string" ? (body as Record<string, unknown>).collectionSlug : "";
		if (!contentId || !collectionSlug) {
			return { ok: false, error: "contentId and collectionSlug are required." };
		}

		const key = `${collectionSlug}:${contentId}`;
		const existing = normalizeContentRestriction(await ctx.storage.restrictions.get(key));
		const record: ContentRestrictionRecord = {
			contentId,
			collectionSlug,
			slug: typeof (body as Record<string, unknown>).slug === "string" ? (body as Record<string, unknown>).slug : null,
			title: typeof (body as Record<string, unknown>).title === "string" ? (body as Record<string, unknown>).title : null,
			requiredPlanSlugs: parsePaidPlanSlugs((body as Record<string, unknown>).requiredPlanSlugs),
			productIds: normalizeStringArray((body as Record<string, unknown>).productIds),
			source: "manual",
			createdAt: existing?.createdAt ?? nowIso(),
			updatedAt: nowIso(),
		};
		await ctx.storage.restrictions.put(key, record);
		return { ok: true, item: { id: key, data: record } };
	}

	if (method === "DELETE") {
		const body = ctx.input && typeof ctx.input === "object" ? ctx.input : {};
		if ((body as Record<string, unknown>).type === "taxonomy") {
			const key = `${String((body as Record<string, unknown>).taxonomyName || "")}:${String((body as Record<string, unknown>).termId || "")}`;
			await ctx.storage.taxonomyRestrictions.delete(key);
			return { ok: true };
		}

		const collectionSlug = String((body as Record<string, unknown>).collectionSlug || "");
		const contentId = String((body as Record<string, unknown>).contentId || "");
		const slug = typeof (body as Record<string, unknown>).slug === "string" ? (body as Record<string, unknown>).slug : null;
		if (!collectionSlug || !contentId) {
			return { ok: false, error: "contentId and collectionSlug are required." };
		}

		await ctx.storage.restrictions.delete(`${collectionSlug}:${contentId}`);
		if (slug && slug !== contentId) {
			await ctx.storage.restrictions.delete(`${collectionSlug}:${slug}`);
		}
		return { ok: true };
	}

	return { ok: false, error: "Method not allowed." };
}
