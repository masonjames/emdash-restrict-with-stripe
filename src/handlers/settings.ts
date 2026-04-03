import type { PaidPlanSlug } from "../plans.js";
import { PAID_PLAN_SLUGS, isPaidPlanSlug } from "../plans.js";
import { DEFAULT_PLAN_MAPPINGS, type PlanMappings, type RestrictWithStripeSettings, type StripeEnvironment } from "../types.js";
import { isRecord, uniqueStrings } from "../utils.js";

export function maskSecretKey(secretKey: string | null | undefined): string {
	if (!secretKey) {
		return "";
	}

	return `sk_••••${secretKey.slice(-4)}`;
}

export function normalizeStripeEnvironment(value: unknown): StripeEnvironment {
	if (value === "test" || value === "sandbox") {
		return "test";
	}

	return "live";
}

export function normalizePlanMappings(value: unknown): PlanMappings | null {
	if (value == null) {
		return { ...DEFAULT_PLAN_MAPPINGS };
	}

	if (!isRecord(value)) {
		return null;
	}

	const planMappings: PlanMappings = { ...DEFAULT_PLAN_MAPPINGS };
	for (const [key, rawValue] of Object.entries(value)) {
		if (!isPaidPlanSlug(key)) {
			return null;
		}
		if (rawValue != null && typeof rawValue !== "string") {
			return null;
		}
		planMappings[key] = typeof rawValue === "string" && rawValue.trim() ? rawValue.trim() : null;
	}

	return planMappings;
}

export function resolveRequiredProductIds(
	planMappings: PlanMappings,
	requiredPlanSlugs: PaidPlanSlug[],
): string[] {
	return uniqueStrings(requiredPlanSlugs.map((planSlug) => planMappings[planSlug]));
}

export async function loadSettings(ctx: any): Promise<RestrictWithStripeSettings> {
	const stripeSecretKey = await ctx.kv.get<string>("stripe_secret_key");
	const stripePublishableKey = (await ctx.kv.get<string>("stripe_publishable_key")) || "";
	const stripeAccountId = (await ctx.kv.get<string>("stripe_account_id")) || "";
	const stripeEnvironment = normalizeStripeEnvironment(await ctx.kv.get("stripe_environment"));
	const showExcerpts = (await ctx.kv.get("show_excerpts")) !== "false";
	const planMappings = normalizePlanMappings(await ctx.kv.get("plan_mappings")) || {
		...DEFAULT_PLAN_MAPPINGS,
	};

	return {
		stripeSecretKey,
		stripeSecretKeyMasked: maskSecretKey(stripeSecretKey),
		stripePublishableKey,
		stripeAccountId,
		stripeEnvironment,
		showExcerpts,
		planMappings,
		emailConfigured: Boolean(ctx.email),
		isConfigured: Boolean(stripeSecretKey),
	};
}

export async function settingsHandler(ctx: any) {
	const method = ctx.request.method;

	if (method === "GET") {
		const { stripeSecretKey: _secretKey, ...settings } = await loadSettings(ctx);
		return settings;
	}

	if (method === "POST") {
		const body = isRecord(ctx.input) ? ctx.input : {};

		if (body.disconnect === true) {
			await ctx.kv.delete("stripe_secret_key");
			await ctx.kv.delete("stripe_publishable_key");
			await ctx.kv.delete("stripe_account_id");
			await ctx.kv.delete("stripe_environment");
			return { ok: true, disconnected: true };
		}

		if (typeof body.stripeSecretKey === "string" && !body.stripeSecretKey.startsWith("sk_••••")) {
			await ctx.kv.set("stripe_secret_key", body.stripeSecretKey.trim());
		}
		if (
			typeof body.stripePublishableKey === "string" &&
			!body.stripePublishableKey.startsWith("pk_••••")
		) {
			await ctx.kv.set("stripe_publishable_key", body.stripePublishableKey.trim());
		}
		if (typeof body.stripeAccountId === "string") {
			await ctx.kv.set("stripe_account_id", body.stripeAccountId.trim());
		}

		if (body.stripeEnvironment !== undefined) {
			await ctx.kv.set("stripe_environment", normalizeStripeEnvironment(body.stripeEnvironment));
		} else if (typeof body.stripeSecretKey === "string" && !body.stripeSecretKey.startsWith("sk_••••")) {
			await ctx.kv.set(
				"stripe_environment",
				body.stripeSecretKey.startsWith("sk_test_") ? "test" : "live",
			);
		}

		if (typeof body.showExcerpts === "boolean") {
			await ctx.kv.set("show_excerpts", String(body.showExcerpts));
		}

		if (body.planMappings !== undefined) {
			const normalizedMappings = normalizePlanMappings(body.planMappings);
			if (!normalizedMappings) {
				return {
					ok: false,
					error: `planMappings must be an object keyed by ${PAID_PLAN_SLUGS.join(", ")}.`,
				};
			}
			await ctx.kv.set("plan_mappings", normalizedMappings);
		}

		return { ok: true };
	}

	return { ok: false, error: "Method not allowed." };
}
