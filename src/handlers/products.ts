// GET products — admin only, returns all active Stripe products
import { StripeClient } from "../stripe.js";

export async function productsHandler(ctx: any) {
  const secretKey = await ctx.kv.get("stripe_secret_key");
  if (!secretKey) return { error: "Stripe not configured" };

  const stripe = new StripeClient(secretKey, ctx.http.fetch);
  const products = await stripe.getAllProducts();
  return { products: products.data };
}
