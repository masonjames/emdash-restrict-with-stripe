import { StripeClient } from "../stripe.js";
import { loadSettings } from "./settings.js";

export async function productsHandler(ctx: any) {
	const settings = await loadSettings(ctx);
	if (!settings.stripeSecretKey) {
		return { ok: false, error: "Stripe is not configured yet." };
	}

	const stripe = new StripeClient(settings.stripeSecretKey, ctx.http.fetch);
	const products = await stripe.getAllProducts();
	return { ok: true, products: products.data };
}
