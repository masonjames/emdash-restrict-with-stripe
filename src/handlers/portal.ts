// GET customer_portal_url — authenticated, returns Stripe Customer Portal URL
import { StripeClient } from "../stripe.js";

export async function portalHandler(ctx: any) {
  const userId = ctx.user?.id;
  if (!userId) return { error: "Not authenticated" };

  const secretKey = await ctx.kv.get("stripe_secret_key");
  if (!secretKey) return { error: "Stripe not configured" };

  const customer = await ctx.storage.customers.get(userId);
  if (!customer) return { error: "No customer found for this user." };

  const customerId = customer.data?.stripeCustomerId || customer.stripeCustomerId;
  const url = new URL(ctx.request.url);
  const returnUrl = url.searchParams.get("return_url") || "/";

  const stripe = new StripeClient(secretKey, ctx.http.fetch);
  const session = await stripe.createPortalSession(customerId, returnUrl);

  return { url: session.url };
}
