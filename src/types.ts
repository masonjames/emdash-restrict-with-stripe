import type { GhostPlanSlug, PaidPlanSlug } from "./plans.js";

export type StripeEnvironment = "live" | "test";

export interface PlanMappings {
	"default-product": string | null;
	"content-personall-ai": string | null;
}

export const DEFAULT_PLAN_MAPPINGS: PlanMappings = {
	"default-product": null,
	"content-personall-ai": null,
};

export interface RestrictWithStripeSettings {
	stripeSecretKey: string | null;
	stripeSecretKeyMasked: string;
	stripePublishableKey: string;
	stripeAccountId: string;
	stripeEnvironment: StripeEnvironment;
	showExcerpts: boolean;
	planMappings: PlanMappings;
	emailConfigured: boolean;
	isConfigured: boolean;
}

export interface AuthTokenRecord {
	email: string;
	token: string;
	redirect: string;
	intent: "signin" | "subscribe-free";
	expiresAt: string;
	used: boolean;
	createdAt: string;
}

export interface SessionRecord {
	email: string;
	sessionToken: string;
	expiresAt: string;
	createdAt: string;
}

export interface CustomerRecord {
	email: string;
	stripeCustomerId: string;
	createdAt: string;
	updatedAt: string;
}

export interface ContentRestrictionRecord {
	contentId: string;
	collectionSlug: string;
	slug?: string | null;
	title?: string | null;
	requiredPlanSlugs?: GhostPlanSlug[];
	productIds?: string[];
	source?: "manual";
	createdAt: string;
	updatedAt?: string;
}

export interface TaxonomyRestrictionRecord {
	taxonomyName: string;
	termId: string;
	requiredPlanSlugs?: GhostPlanSlug[];
	productIds?: string[];
	createdAt: string;
	updatedAt?: string;
}

export interface MemberSessionState {
	authenticated: boolean;
	email: string | null;
}

export interface AccessDecision {
	restricted: boolean;
	authenticated: boolean;
	hasAccess: boolean;
	email: string | null;
	requiredPlanSlugs: PaidPlanSlug[];
	requiredProductIds: string[];
	error?: string;
}
