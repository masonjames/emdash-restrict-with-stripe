import { findOrCreateCustomerRecord, upsertCustomerRecord } from "../customers.js";
import { isBillingInterval, isPaidPlanSlug, PLAN_BY_SLUG } from "../plans.js";
import { StripeClient } from "../stripe.js";
import { isRecord, normalizeEmail, sanitizeRedirectPath } from "../utils.js";
import { isEmailReady, sendMagicLink } from "./auth.js";
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
	if (!(await isEmailReady(ctx))) {
		return { ok: false, error: "Email delivery is not configured for this site yet." };
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
	const successUrl = new URL(ctx.url("/account/complete/"));
	successUrl.searchParams.set("session_id", "{CHECKOUT_SESSION_ID}");
	successUrl.searchParams.set("redirect", redirectPath);

	const checkoutSession = await stripe.createCheckoutSession({
		priceId: price.id,
		customerId: customer.stripeCustomerId,
		successUrl: successUrl.toString(),
		cancelUrl: ctx.url(redirectPath),
	});

	return { ok: true, url: checkoutSession.url };
}

export async function checkoutCompleteHandler(ctx: any) {
	const requestUrl = new URL(ctx.request.url);
	const checkoutSessionId = requestUrl.searchParams.get("session_id")?.trim();
	const redirectPath = sanitizeRedirectPath(requestUrl.searchParams.get("redirect"), "/account/");

	if (!checkoutSessionId) {
		return { ok: false, error: "A checkout session is required." };
	}
	if (!(await isEmailReady(ctx))) {
		return { ok: false, error: "Email delivery is not configured for this site yet." };
	}

	const settings = await loadSettings(ctx);
	if (!settings.stripeSecretKey) {
		return { ok: false, error: "Stripe is not configured yet." };
	}

	const stripe = new StripeClient(settings.stripeSecretKey, ctx.http.fetch);
	const checkoutSession = await stripe.getCheckoutSession(checkoutSessionId);
	if (checkoutSession.status !== "complete") {
		return { ok: false, error: "Your Stripe checkout has not completed yet." };
	}
	if (
		checkoutSession.payment_status !== "paid" &&
		checkoutSession.payment_status !== "no_payment_required"
	) {
		return { ok: false, error: "Your Stripe payment has not completed yet." };
	}

	const email = normalizeEmail(
		checkoutSession.customer_details?.email ?? checkoutSession.customer_email ?? null,
	);
	if (!email) {
		return { ok: false, error: "Stripe did not return a customer email for this checkout." };
	}

	if (typeof checkoutSession.customer === "string" && checkoutSession.customer) {
		await upsertCustomerRecord(ctx, email, checkoutSession.customer);
	}

	await sendMagicLink(ctx, {
		email,
		intent: "signin",
		redirect: redirectPath,
	});

	return {
		ok: true,
		email,
		message: "Check your inbox for a sign-in link to finish unlocking your access.",
	};
}
