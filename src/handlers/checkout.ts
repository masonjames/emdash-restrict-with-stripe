// POST checkout — public, creates Stripe Checkout session
// Creates a Stripe customer + access token. Token is passed through
// the Stripe redirect so the browser can prove payment on return.
import { StripeClient } from "../stripe.js";

function generateToken(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let token = "rwst_";
  for (let i = 0; i < 32; i++) token += chars[Math.floor(Math.random() * chars.length)];
  return token;
}

export async function checkoutHandler(ctx: any) {
  const body = ctx.input || {};
  const { price_id, redirect_url, email } = body;

  if (!price_id) return { error: "Please select a product." };
  if (!redirect_url) return { error: "redirect_url is required." };
  if (!email) return { error: "Email is required." };

  const secretKey = await ctx.kv.get("stripe_secret_key");
  if (!secretKey) return { error: "Stripe not configured" };

  const stripe = new StripeClient(secretKey, ctx.http.fetch);

  // Check if we already have a customer record for this email
  let customerId: string | null = null;
  let accessToken: string | null = null;

  // Look up by email in our customers storage
  const existingCustomers = await ctx.storage.customers.query({ where: {} });
  const existing = (existingCustomers.items || []).find(
    (c: any) => (c.data?.email || c.email) === email
  );

  if (existing) {
    customerId = existing.data?.stripeCustomerId || existing.stripeCustomerId;
    accessToken = existing.data?.accessToken || existing.accessToken;
  }

  // Create Stripe customer if needed
  if (!customerId) {
    const customer = await stripe.createCustomer(email);
    customerId = customer.id;
  }

  // Store/update customer record keyed by email
  await ctx.storage.customers.put(email, {
    email,
    stripeCustomerId: customerId,
    createdAt: new Date().toISOString(),
  });

  // Create a session immediately — Stripe redirect is proof of checkout.
  // This lets us log them in the moment they return from Stripe.
  const sessionToken = generateToken();
  const sessionExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await ctx.storage.sessions.put(sessionToken, {
    email,
    sessionToken,
    expiresAt: sessionExpires,
    createdAt: new Date().toISOString(),
  });

  // Build success URL with session token (JS will set cookie on return)
  const separator = redirect_url.includes("?") ? "&" : "?";
  const successUrl = `${redirect_url}${separator}rwstripe_session=${encodeURIComponent(sessionToken)}`;

  const session = await stripe.createCheckoutSession({
    priceId: price_id,
    customerId,
    successUrl,
    cancelUrl: redirect_url,
  });

  return { url: session.url };
}
