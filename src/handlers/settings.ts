// Admin settings — Stripe keys, display preferences
// Mirrors WP: rwstripe_stripe_access_token, rwstripe_show_excerpts, etc.
//
// Route context shape (from emdash PluginRouteHandler):
//   ctx.input   — parsed JSON body (for POST/PUT/PATCH)
//   ctx.request — original Request object (body already consumed)
//   ctx.kv      — plugin-scoped key-value store

export async function settingsHandler(ctx: any) {
  const method = ctx.request.method;

  if (method === "GET") {
    const secretKey = await ctx.kv.get("stripe_secret_key");
    return {
      stripeSecretKey: secretKey ? "sk_••••" + (secretKey as string).slice(-4) : "",
      stripePublishableKey: (await ctx.kv.get("stripe_publishable_key")) || "",
      stripeAccountId: (await ctx.kv.get("stripe_account_id")) || "",
      stripeEnvironment: (await ctx.kv.get("stripe_environment")) || "live",
      showExcerpts: (await ctx.kv.get("show_excerpts")) !== "false",
      collectPassword: (await ctx.kv.get("collect_password")) === "true",
      isConfigured: !!secretKey,
    };
  }

  if (method === "POST") {
    const body = ctx.input || {};

    // Handle disconnect — clear all Stripe keys
    if (body.disconnect) {
      await ctx.kv.delete("stripe_secret_key");
      await ctx.kv.delete("stripe_publishable_key");
      await ctx.kv.delete("stripe_account_id");
      await ctx.kv.delete("stripe_environment");
      return { ok: true, disconnected: true };
    }

    // Save Stripe keys (from Connect callback or manual entry)
    // Skip masked values (returned by GET) so "Save Settings" doesn't clobber real keys
    if (body.stripeSecretKey && !body.stripeSecretKey.startsWith("sk_••••")) {
      await ctx.kv.set("stripe_secret_key", body.stripeSecretKey);
    }
    if (body.stripePublishableKey && !body.stripePublishableKey.startsWith("pk_••••")) {
      await ctx.kv.set("stripe_publishable_key", body.stripePublishableKey);
    }
    if (body.stripeAccountId) {
      await ctx.kv.set("stripe_account_id", body.stripeAccountId);
    }
    // Normalize environment: connect server sends "sandbox", we store "test"
    if (body.stripeEnvironment !== undefined) {
      const env = body.stripeEnvironment === "sandbox" ? "test" : body.stripeEnvironment;
      await ctx.kv.set("stripe_environment", env);
    } else if (body.stripeSecretKey && !body.stripeSecretKey.startsWith("sk_••••")) {
      // Infer from key prefix when not explicitly provided
      const env = body.stripeSecretKey.startsWith("sk_test_") ? "test" : "live";
      await ctx.kv.set("stripe_environment", env);
    }

    // Display settings — only save when explicitly provided
    if (body.showExcerpts !== undefined) {
      await ctx.kv.set("show_excerpts", String(body.showExcerpts));
    }
    if (body.collectPassword !== undefined) {
      await ctx.kv.set("collect_password", String(body.collectPassword));
    }

    return { ok: true };
  }

  return { error: "Method not allowed" };
}
