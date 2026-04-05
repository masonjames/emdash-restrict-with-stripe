import { definePlugin } from "emdash";

import { accessHandler } from "./handlers/access.js";
import { logoutHandler, sendLinkHandler, sessionHandler, verifyHandler } from "./handlers/auth.js";
import { checkoutCompleteHandler, checkoutHandler } from "./handlers/checkout.js";
import { portalHandler } from "./handlers/portal.js";
import { productsHandler } from "./handlers/products.js";
import { restrictionsHandler } from "./handlers/restrictions.js";
import { settingsHandler } from "./handlers/settings.js";

export function createPlugin(_options: Record<string, unknown> = {}) {
	return definePlugin({
		id: "restrict-with-stripe",
		version: "0.1.0",
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
		routes: {
			checkout: { public: true, handler: checkoutHandler },
			"checkout/complete": { public: true, handler: checkoutCompleteHandler },
			portal: { public: true, handler: portalHandler },
			access: { public: true, handler: accessHandler },
			"admin/products": { handler: productsHandler },
			"admin/restrictions": { handler: restrictionsHandler },
			"admin/settings": { handler: settingsHandler },
			"auth/send-link": { public: true, handler: sendLinkHandler },
			"auth/verify": { public: true, handler: verifyHandler },
			"auth/session": { public: true, handler: sessionHandler },
			"auth/logout": { public: true, handler: logoutHandler },
		},
		admin: {
			entry: "emdash-restrict-with-stripe/admin",
			pages: [
				{ path: "/settings", label: "RWStripe Settings" },
				{ path: "/restrictions", label: "RWStripe Restrictions" },
			],
			widgets: [{ id: "overview", title: "Restrict With Stripe" }],
		},
	});
}
