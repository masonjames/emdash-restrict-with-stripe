import { describe, expect, it } from "vitest";

import { loadSettings } from "../src/handlers/settings.js";

function createCtx(options?: { kvSeed?: Record<string, unknown>; email?: { isReady: () => Promise<boolean> } }) {
	const kvStore = new Map<string, unknown>(Object.entries(options?.kvSeed ?? {}));

	return {
		kv: {
			get: async <T>(key: string): Promise<T | null> => ((kvStore.get(key) as T | undefined) ?? null),
		},
		email: options?.email,
	};
}

describe("loadSettings", () => {
	it("only reports emailConfigured when the selected email provider is actually ready", async () => {
		const settings = await loadSettings(
			createCtx({
				kvSeed: {
					stripe_secret_key: "sk_test_123",
				},
				email: {
					isReady: async () => false,
				},
			}),
		);

		expect(settings.emailConfigured).toBe(false);
	});
});
