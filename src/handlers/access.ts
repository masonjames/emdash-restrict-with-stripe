// GET access check — returns whether current user can view a content item
// Mirrors WP rwstripe_get_restricted_products_for_post() + customer_has_product()
import { StripeClient } from "../stripe.js";
import { getSessionEmail } from "./auth.js";

export async function accessHandler(ctx: any) {
  const url = new URL(ctx.request.url);
  const contentId = url.searchParams.get("contentId");
  const collectionSlug = url.searchParams.get("collection");

  if (!contentId || !collectionSlug) {
    return { error: "contentId and collection required" };
  }

  // Collect all product IDs restricting this content
  const productIds = await getRestrictedProductIds(ctx, collectionSlug, contentId);

  if (productIds.length === 0) {
    return { restricted: false, hasAccess: true };
  }

  // Determine the user's email from (in priority order):
  //   1. rwstripe_session cookie (magic link login)
  //   2. emdash logged-in user
  let email: string | null = null;

  // Check magic link session cookie
  email = await getSessionEmail(ctx);

  // Fall back to emdash user
  if (!email && ctx.user?.email) {
    email = ctx.user.email;
  }

  if (!email) {
    return { restricted: true, hasAccess: false, productIds };
  }

  // Look up Stripe customer by email directly from Stripe API
  // This is the authoritative check — no local state needed
  const secretKey = await ctx.kv.get("stripe_secret_key");
  if (!secretKey) {
    return { restricted: true, hasAccess: false, error: "Stripe not configured" };
  }

  const stripe = new StripeClient(secretKey, ctx.http.fetch);

  // Find customer(s) by email in Stripe
  let customerId: string | null = null;
  try {
    const customers = await stripe.getCustomersByEmail(email);
    if (customers.data && customers.data.length > 0) {
      // Check each customer (email isn't unique in Stripe)
      for (const cust of customers.data) {
        const hasAccess = await stripe.customerHasProduct(cust.id, productIds);
        if (hasAccess) {
          return { restricted: true, hasAccess: true, productIds, email };
        }
      }
      customerId = customers.data[0].id;
    }
  } catch (err: any) {
    console.error("[rwstripe] Stripe lookup failed:", err.message);
  }

  return { restricted: true, hasAccess: false, productIds, email };
}

// Collect product IDs from both content restrictions and taxonomy restrictions
// (mirrors WP: post meta + category meta + tag meta)
async function getRestrictedProductIds(ctx: any, collectionSlug: string, contentId: string): Promise<string[]> {
  const productIds: string[] = [];

  // Direct content restriction
  const restriction = await ctx.storage.restrictions.get(`${collectionSlug}:${contentId}`);
  if (restriction) {
    const ids = restriction.data?.productIds || restriction.productIds || [];
    productIds.push(...ids);
  }

  // Taxonomy restrictions — check all taxonomy terms assigned to this content
  // In emdash, content-taxonomy relationships are queried via content API
  // For now, we check all taxonomy restrictions and see if the content has matching terms
  // (This would be more efficient with a content→terms lookup, but works for POC)
  const taxResult = await ctx.storage.taxonomyRestrictions.query({});
  if (taxResult.items.length > 0) {
    // We'd need content API access to check which terms this content has
    // For POC, taxonomy restrictions are checked at the Astro template level
    // since we need to query the content's terms from the CMS
  }

  return [...new Set(productIds)];
}
