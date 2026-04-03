export function restrictWithStripe() {
	return {
		id: "restrict-with-stripe",
		version: "0.1.0",
		entrypoint: "emdash-restrict-with-stripe/plugin",
		adminEntry: "emdash-restrict-with-stripe/admin",
		options: {},
		capabilities: ["network:fetch", "email:send"],
		allowedHosts: ["api.stripe.com"],
		storage: {
			restrictions: {
				indexes: ["contentId", "collectionSlug", "slug"],
			},
			taxonomyRestrictions: {
				indexes: ["taxonomyName", "termId"],
			},
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
		adminWidgets: [{ id: "overview", title: "Restrict With Stripe" }],
	};
}

export default restrictWithStripe;
