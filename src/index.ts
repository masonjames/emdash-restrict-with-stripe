// ─── Plugin Descriptor (for astro.config.mjs) ──────────────────
// Metadata only. emdash imports the entrypoint separately for hooks/routes.

export function restrictWithStripe() {
  return {
    id: "restrict-with-stripe",
    version: "0.1.0",
    entrypoint: "emdash-restrict-with-stripe/plugin",
    adminEntry: "emdash-restrict-with-stripe/admin",
    options: {},
    capabilities: [
      "read:content",
      "read:users",
      "network:fetch",
      "page:inject",
    ],
    allowedHosts: ["api.stripe.com"],

    storage: {
      // Content restrictions: which Stripe product IDs restrict which content
      restrictions: {
        indexes: ["contentId", "collectionSlug"],
      },
      // Taxonomy restrictions: which product IDs restrict which taxonomy terms
      taxonomyRestrictions: {
        indexes: ["taxonomyName", "termId"],
      },
      // User → Stripe customer mapping
      customers: {
        indexes: ["email"],
      },
      authTokens: {
        indexes: ["email", "expiresAt"],
      },
      sessions: {
        indexes: ["email", "expiresAt"],
      },
    },

    adminPages: [
      { path: "/settings", label: "RWStripe Settings" },
      { path: "/restrictions", label: "RWStripe Restrictions" },
    ],
    adminWidgets: [
      { id: "overview", title: "Restrict With Stripe" },
    ],
  };
}

export default restrictWithStripe;
