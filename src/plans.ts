export type GhostPlanSlug = "free" | "default-product" | "content-personall-ai";
export type PaidPlanSlug = Exclude<GhostPlanSlug, "free">;
export type BillingInterval = "monthly" | "yearly";
export type GhostVisibility = "public" | "members" | "paid";

export interface CanonicalPlanDefinition {
	slug: GhostPlanSlug;
	name: string;
	description: string;
	tier: "free" | "paid";
	monthlyLabel: string | null;
	yearlyLabel: string | null;
	trialLabel: string | null;
	grantsVisibility: GhostVisibility[];
}

export const CANONICAL_PLANS: CanonicalPlanDefinition[] = [
	{
		slug: "free",
		name: "Free",
		description: "Get the latest posts in your inbox and sign in to free member areas.",
		tier: "free",
		monthlyLabel: null,
		yearlyLabel: null,
		trialLabel: null,
		grantsVisibility: ["public"],
	},
	{
		slug: "default-product",
		name: "Content & Chatbot Access",
		description: "Paid access to member-only writing plus chatbot access.",
		tier: "paid",
		monthlyLabel: "USD 5/mo",
		yearlyLabel: "USD 50/yr",
		trialLabel: null,
		grantsVisibility: ["members"],
	},
	{
		slug: "content-personall-ai",
		name: "All Access Pass",
		description: "Full access across content and premium AI experiences.",
		tier: "paid",
		monthlyLabel: "USD 15/mo",
		yearlyLabel: "USD 150/yr",
		trialLabel: "14-day trial",
		grantsVisibility: ["members", "paid"],
	},
];

export const PLAN_BY_SLUG = Object.fromEntries(
	CANONICAL_PLANS.map((plan) => [plan.slug, plan]),
) as Record<GhostPlanSlug, CanonicalPlanDefinition>;

export const PAID_PLAN_SLUGS = CANONICAL_PLANS.filter(
	(plan): plan is CanonicalPlanDefinition & { slug: PaidPlanSlug } => plan.tier === "paid",
).map((plan) => plan.slug);

export const VISIBILITY_TO_PLAN_SLUGS: Record<GhostVisibility, PaidPlanSlug[]> = {
	public: [],
	members: ["default-product", "content-personall-ai"],
	paid: ["content-personall-ai"],
};

export function isGhostPlanSlug(value: unknown): value is GhostPlanSlug {
	return typeof value === "string" && value in PLAN_BY_SLUG;
}

export function isPaidPlanSlug(value: unknown): value is PaidPlanSlug {
	return typeof value === "string" && PAID_PLAN_SLUGS.includes(value as PaidPlanSlug);
}

export function isBillingInterval(value: unknown): value is BillingInterval {
	return value === "monthly" || value === "yearly";
}

export function getRequiredPlanSlugsForVisibility(visibility: GhostVisibility | null | undefined): PaidPlanSlug[] {
	if (!visibility || !(visibility in VISIBILITY_TO_PLAN_SLUGS)) {
		return [];
	}

	return VISIBILITY_TO_PLAN_SLUGS[visibility as GhostVisibility];
}
