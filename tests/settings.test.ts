import { describe, expect, it } from "vitest";

import { loadSettings } from "../src/handlers/settings.js";

function createCtx(options?: { kvSeed?: Record<string, unknown>; email?: { send: () => Promise<void> } }) {
	const kvStore = new Map<string, unknown>(Object.entries(options?.kvSeed ?? {}));

	return {
		kv: {
			get: async <T>(key: string): Promise<T | null> => ((kvStore.get(key) as T | undefined) ?? null),
		},
		email: options?.email,
	};
}

describe("loadSettings", () => {
	it("reports emailConfigured false when EmDash has no configured email provider", async () => {
		const settings = await loadSettings(
			createCtx({
				kvSeed: {
					stripe_secret_key: "sk_test_123",
				},
			}),
		);

		expect(settings.emailConfigured).toBe(false);
	});

	it("reports emailConfigured true when EmDash provides the email API", async () => {
		const settings = await loadSettings(
			createCtx({
				kvSeed: {
					stripe_secret_key: "sk_test_123",
				},
				email: {
					send: async () => undefined,
				},
			}),
		);

		expect(settings.emailConfigured).toBe(true);
	});
});
