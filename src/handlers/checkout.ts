import { findOrCreateCustomerRecord } from "../customers.js";
import { isBillingInterval, isPaidPlanSlug, PLAN_BY_SLUG } from "../plans.js";
import { StripeClient } from "../stripe.js";
import { isRecord, normalizeEmail, sanitizeRedirectPath } from "../utils.js";
import { createSession, getSessionRecord } from "./auth.js";
import { loadSettings } from "./settings.js";

export async function checkoutHandler(ctx: any) {
	const body = isRecord(ctx.input) ? ctx.input : {};
	const planSlug = body.planSlug;
	const billingInterval = body.billingInterval;
	const email = normalizeEmail(body.email);
	const redirectPath = sanitizeRedirectPath(body.redirectUrl, "/");

	if (!isPaidPlanSlug(planSlug)) {
		return { ok: false, error: "A paid subscription option is required." };
	}
	if (!isBillingInterval(billingInterval)) {
		return { ok: false, error: "A valid billing interval is required." };
	}
	if (!email) {
		return { ok: false, error: "A valid email address is required." };
	}

	const settings = await loadSettings(ctx);
	if (!settings.stripeSecretKey) {
		return { ok: false, error: "Stripe is not configured yet." };
	}

	const productId = settings.planMappings[planSlug];
	if (!productId) {
		return {
			ok: false,
			error: `${PLAN_BY_SLUG[planSlug].name} is not mapped to a Stripe product yet.`,
		};
	}

	const stripe = new StripeClient(settings.stripeSecretKey, ctx.http.fetch);
	const price = await stripe.findRecurringPriceForProduct(productId, billingInterval);
	if (!price) {
		return {
			ok: false,
			error: `No active ${billingInterval} price was found for ${PLAN_BY_SLUG[planSlug].name}.`,
		};
	}

	const customer = await findOrCreateCustomerRecord(ctx, stripe, email);
	const existingSession = await getSessionRecord(ctx);
	const session = existingSession?.email === email ? existingSession : await createSession(ctx, email);

	const successUrl = new URL(ctx.url("/account/complete/"));
	successUrl.searchParams.set("session", session.sessionToken);
	successUrl.searchParams.set("redirect", redirectPath);

	const checkoutSession = await stripe.createCheckoutSession({
		priceId: price.id,
		customerId: customer.stripeCustomerId,
		successUrl: successUrl.toString(),
		cancelUrl: ctx.url(redirectPath),
	});

	return { ok: true, url: checkoutSession.url };
}
