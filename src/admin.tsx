import React, { useCallback, useEffect, useMemo, useState } from "react";

import { CANONICAL_PLANS, type PaidPlanSlug } from "./plans.js";

const API = "/_emdash/api/plugins/restrict-with-stripe";
const HEADERS: Record<string, string> = {
	"Content-Type": "application/json",
	"X-EmDash-Request": "1",
};
const PAID_PLANS = CANONICAL_PLANS.filter((plan): plan is (typeof CANONICAL_PLANS)[number] & { slug: PaidPlanSlug } =>
	plan.tier === "paid",
);

type Product = {
	id: string;
	name: string;
	description?: string | null;
};

type PlanMappings = Record<PaidPlanSlug, string | null>;

type SettingsState = {
	stripeSecretKeyMasked: string;
	stripePublishableKey: string;
	stripeAccountId: string;
	stripeEnvironment: "live" | "test";
	showExcerpts: boolean;
	planMappings: PlanMappings;
	emailConfigured: boolean;
	isConfigured: boolean;
};

type RestrictionRecord = {
	id: string;
	data: {
		contentId: string;
		collectionSlug: string;
		slug?: string | null;
		title?: string | null;
		requiredPlanSlugs?: PaidPlanSlug[];
		productIds?: string[];
	};
};

async function api<T>(path: string, options?: RequestInit): Promise<T> {
	const response = await fetch(`${API}${path}`, {
		...options,
		headers: {
			...HEADERS,
			...(options?.headers || {}),
		},
	});
	const payload = await response.json().catch(() => ({}));
	if (!response.ok) {
		throw new Error(payload?.error?.message || "Request failed.");
	}
	return (payload?.data ?? payload) as T;
}

function buildEmptyPlanMappings(): PlanMappings {
	return {
		"default-product": null,
		"content-personall-ai": null,
	};
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<section style={{ marginBottom: 28 }}>
			<h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>{title}</h3>
			{children}
		</section>
	);
}

function FieldLabel({ children }: { children: React.ReactNode }) {
	return <span style={{ display: "block", fontSize: 12, fontWeight: 600, marginBottom: 6 }}>{children}</span>;
}

function SettingsPage() {
	const [settings, setSettings] = useState<SettingsState | null>(null);
	const [products, setProducts] = useState<Product[]>([]);
	const [message, setMessage] = useState("");
	const [saving, setSaving] = useState(false);
	const [testMode, setTestMode] = useState(false);
	const CONNECT_URL = "https://connect.restrictwithstripe.com";

	const load = useCallback(async () => {
		const loadedSettings = await api<SettingsState>("/admin/settings");
		setSettings(loadedSettings);
		try {
			const productResult = await api<{ ok?: boolean; products?: Product[] }>("/admin/products");
			setProducts(productResult.products || []);
		} catch {
			setProducts([]);
		}
	}, []);

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		const cleanUrl = window.location.pathname;
		if (params.get("pmpro_stripe_connected") === "true") {
			const connectData = {
				stripeSecretKey: params.get("pmpro_stripe_access_token") || "",
				stripePublishableKey: params.get("pmpro_stripe_publishable_key") || "",
				stripeAccountId: params.get("pmpro_stripe_user_id") || "",
				stripeEnvironment: params.get("pmpro_stripe_connected_environment") || "live",
			};
			api("/admin/settings", { method: "POST", body: JSON.stringify(connectData) })
				.then(() => load())
				.then(() => setMessage("Connected to Stripe."))
				.catch((error: Error) => setMessage(error.message));
			window.history.replaceState({}, "", cleanUrl);
			return;
		}

		if (params.get("pmpro_stripe_connected") === "false") {
			setMessage(params.get("error_message") || "Failed to connect Stripe.");
			window.history.replaceState({}, "", cleanUrl);
		}

		if (params.get("pmpro_stripe_disconnected") === "true") {
			setMessage("Disconnected from Stripe.");
			window.history.replaceState({}, "", cleanUrl);
		}

		load().catch((error: Error) => setMessage(error.message));
	}, [load]);

	function buildConnectUrl() {
		const returnUrl = window.location.origin + window.location.pathname;
		const env = testMode ? "sandbox" : "live";
		return `${CONNECT_URL}?action=authorize&gateway_environment=${env}&return_url=${encodeURIComponent(returnUrl)}`;
	}

	async function disconnect() {
		if (!settings || !window.confirm("Disconnect from Stripe?")) {
			return;
		}
		setSaving(true);
		try {
			await api("/admin/settings", { method: "POST", body: JSON.stringify({ disconnect: true }) });
			const env = settings.stripeEnvironment === "test" ? "sandbox" : "live";
			const returnUrl = window.location.origin + window.location.pathname;
			window.location.href = `${CONNECT_URL}?action=disconnect&gateway_environment=${env}&stripe_user_id=${settings.stripeAccountId || ""}&return_url=${encodeURIComponent(returnUrl)}`;
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "Unable to disconnect Stripe.");
			setSaving(false);
		}
	}

	async function save() {
		if (!settings) {
			return;
		}
		setSaving(true);
		setMessage("");
		try {
			await api("/admin/settings", {
				method: "POST",
				body: JSON.stringify({
					showExcerpts: settings.showExcerpts,
					planMappings: settings.planMappings,
				}),
			});
			await load();
			setMessage("Settings saved.");
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "Unable to save settings.");
		} finally {
			setSaving(false);
		}
	}

	if (!settings) {
		return <p>Loading…</p>;
	}

	return (
		<div style={{ maxWidth: 760, padding: 16 }}>
			<h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>Restrict With Stripe</h2>

			<Section title="1. Connect to Stripe">
				{settings.isConfigured ? (
					<>
						<p style={helpText}>Connected to account <strong>{settings.stripeAccountId || "—"}</strong> ({settings.stripeEnvironment}).</p>
						<div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
							<a
								href={`https://dashboard.stripe.com/${settings.stripeEnvironment === "test" ? "test/" : ""}products`}
								target="_blank"
								rel="noopener"
								style={linkStyle}
							>
								Open Stripe dashboard
							</a>
							<button type="button" onClick={disconnect} disabled={saving} style={{ ...buttonStyle, background: "#4b5563" }}>
								Disconnect
							</button>
						</div>
					</>
				) : (
					<>
						<label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
							<input type="checkbox" checked={testMode} onChange={(event) => setTestMode(event.target.checked)} />
							Connect in test mode
						</label>
						<a href={buildConnectUrl()} style={buttonLinkStyle}>
							Connect to Stripe{testMode ? " (test)" : ""}
						</a>
					</>
				)}
			</Section>

			<Section title="2. Membership plan mapping">
				<p style={helpText}>Map the Ghost parity plans to active Stripe products. Checkout and access checks use these mappings.</p>
				<div style={{ display: "grid", gap: 14 }}>
					{PAID_PLANS.map((plan) => (
						<label key={plan.slug}>
							<FieldLabel>{plan.name}</FieldLabel>
							<select
								value={settings.planMappings[plan.slug] || ""}
								onChange={(event) =>
									setSettings({
										...settings,
										planMappings: {
											...settings.planMappings,
											[plan.slug]: event.target.value || null,
										},
									})
								}
								style={inputStyle}
							>
								<option value="">Choose a Stripe product</option>
								{products.map((product) => (
									<option key={product.id} value={product.id}>
										{product.name}
									</option>
								))}
							</select>
							<p style={captionText}>{plan.monthlyLabel} · {plan.yearlyLabel}</p>
						</label>
					))}
				</div>
			</Section>

			<Section title="3. Delivery & gating">
				<label style={{ display: "flex", alignItems: "center", gap: 8 }}>
					<input
						type="checkbox"
						checked={settings.showExcerpts}
						onChange={(event) => setSettings({ ...settings, showExcerpts: event.target.checked })}
					/>
					Show excerpts on locked content
				</label>
				<p style={{ ...helpText, marginTop: 12 }}>
					Email provider: <strong>{settings.emailConfigured ? "configured" : "missing"}</strong>
				</p>
			</Section>

			<button type="button" onClick={save} disabled={saving} style={buttonStyle}>
				{saving ? "Saving…" : "Save settings"}
			</button>
			{message && <p style={{ ...helpText, color: message.toLowerCase().includes("error") ? "#b91c1c" : "#166534", marginTop: 12 }}>{message}</p>}
		</div>
	);
}

function RestrictionsPage() {
	const [restrictions, setRestrictions] = useState<RestrictionRecord[]>([]);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [message, setMessage] = useState("");
	const [draft, setDraft] = useState({
		collectionSlug: "posts",
		contentId: "",
		slug: "",
		title: "",
		requiredPlanSlugs: [] as PaidPlanSlug[],
	});

	const load = useCallback(async () => {
		setLoading(true);
		try {
			const result = await api<{ items: RestrictionRecord[] }>("/admin/restrictions");
			setRestrictions(result.items || []);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		load().catch((error: Error) => setMessage(error.message));
	}, [load]);

	const planLabels = useMemo(
		() =>
			Object.fromEntries(PAID_PLANS.map((plan) => [plan.slug, plan.name])) as Record<PaidPlanSlug, string>,
		[],
	);

	async function saveRestriction() {
		if (!draft.collectionSlug || !draft.contentId) {
			setMessage("Collection slug and content ID are required.");
			return;
		}

		setSaving(true);
		setMessage("");
		try {
			await api("/admin/restrictions", {
				method: "POST",
				body: JSON.stringify(draft),
			});
			setDraft({ collectionSlug: "posts", contentId: "", slug: "", title: "", requiredPlanSlugs: [] });
			await load();
			setMessage("Restriction saved.");
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "Unable to save restriction.");
		} finally {
			setSaving(false);
		}
	}

	async function removeRestriction(item: RestrictionRecord) {
		setSaving(true);
		try {
			await api("/admin/restrictions", {
				method: "DELETE",
				body: JSON.stringify({
					collectionSlug: item.data.collectionSlug,
					contentId: item.data.contentId,
					slug: item.data.slug || undefined,
				}),
			});
			await load();
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "Unable to remove restriction.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<div style={{ maxWidth: 760, padding: 16 }}>
			<h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>Restrictions</h2>

			<Section title="Add or update a manual restriction">
				<div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
					<label>
						<FieldLabel>Collection slug</FieldLabel>
						<input value={draft.collectionSlug} onChange={(event) => setDraft({ ...draft, collectionSlug: event.target.value })} style={inputStyle} />
					</label>
					<label>
						<FieldLabel>Content ID</FieldLabel>
						<input value={draft.contentId} onChange={(event) => setDraft({ ...draft, contentId: event.target.value })} style={inputStyle} />
					</label>
					<label>
						<FieldLabel>Slug (optional)</FieldLabel>
						<input value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: event.target.value })} style={inputStyle} />
					</label>
					<label>
						<FieldLabel>Title (optional)</FieldLabel>
						<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} style={inputStyle} />
					</label>
				</div>
				<div style={{ marginTop: 14 }}>
					<FieldLabel>Required plans</FieldLabel>
					<div style={{ display: "grid", gap: 10 }}>
						{PAID_PLANS.map((plan) => (
							<label key={plan.slug} style={{ display: "flex", gap: 8, alignItems: "center" }}>
								<input
									type="checkbox"
									checked={draft.requiredPlanSlugs.includes(plan.slug)}
									onChange={(event) =>
										setDraft({
											...draft,
											requiredPlanSlugs: event.target.checked
												? [...draft.requiredPlanSlugs, plan.slug]
												: draft.requiredPlanSlugs.filter((value) => value !== plan.slug),
										})
									}
								/>
								<span>{plan.name}</span>
							</label>
						))}
					</div>
				</div>
				<div style={{ display: "flex", gap: 12, marginTop: 16 }}>
					<button type="button" onClick={saveRestriction} disabled={saving} style={buttonStyle}>
						{saving ? "Saving…" : "Save restriction"}
					</button>
				</div>
			</Section>

			<Section title="Current manual restrictions">
				{loading ? (
					<p>Loading…</p>
				) : restrictions.length === 0 ? (
					<p style={helpText}>No manual restrictions have been saved yet.</p>
				) : (
					<div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden" }}>
						{restrictions.map((item, index) => (
							<div key={item.id || index} style={{ padding: 14, borderBottom: index < restrictions.length - 1 ? "1px solid #e5e7eb" : "none", display: "flex", justifyContent: "space-between", gap: 16 }}>
								<div>
									<div style={{ fontWeight: 600 }}>{item.data.title || `${item.data.collectionSlug}/${item.data.slug || item.data.contentId}`}</div>
									<p style={helpText}>{item.data.collectionSlug} · {item.data.contentId}</p>
									<p style={captionText}>
										{(item.data.requiredPlanSlugs || []).map((planSlug) => planLabels[planSlug] || planSlug).join(", ") || "No plans selected"}
									</p>
								</div>
								<div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
									<button type="button" onClick={() => setDraft({
										collectionSlug: item.data.collectionSlug,
										contentId: item.data.contentId,
										slug: item.data.slug || "",
										title: item.data.title || "",
										requiredPlanSlugs: item.data.requiredPlanSlugs || [],
									})} style={ghostButtonStyle}>Edit</button>
									<button type="button" onClick={() => removeRestriction(item)} style={{ ...ghostButtonStyle, color: "#b91c1c" }}>Remove</button>
								</div>
							</div>
						))}
					</div>
				)}
			</Section>

			{message && <p style={{ ...helpText, color: message.toLowerCase().includes("unable") ? "#b91c1c" : "#166534" }}>{message}</p>}
		</div>
	);
}

function OverviewWidget() {
	const [summary, setSummary] = useState<{
		connected: boolean;
		emailConfigured: boolean;
		mappedPlans: number;
		restrictionCount: number;
	} | null>(null);

	useEffect(() => {
		Promise.all([api<SettingsState>("/admin/settings"), api<{ items: RestrictionRecord[] }>("/admin/restrictions")])
			.then(([settings, restrictions]) =>
				setSummary({
					connected: settings.isConfigured,
					emailConfigured: settings.emailConfigured,
					mappedPlans: Object.values(settings.planMappings).filter(Boolean).length,
					restrictionCount: restrictions.items?.length || 0,
				}),
			)
			.catch(() =>
				setSummary({ connected: false, emailConfigured: false, mappedPlans: 0, restrictionCount: 0 }),
			);
	}, []);

	if (!summary) {
		return <p style={{ fontSize: 13 }}>Loading…</p>;
	}

	return (
		<div style={{ display: "grid", gap: 8, fontSize: 14 }}>
			<div style={summaryRowStyle}><span>Stripe</span><strong>{summary.connected ? "Connected" : "Not connected"}</strong></div>
			<div style={summaryRowStyle}><span>Email</span><strong>{summary.emailConfigured ? "Ready" : "Missing"}</strong></div>
			<div style={summaryRowStyle}><span>Mapped plans</span><strong>{summary.mappedPlans}</strong></div>
			<div style={summaryRowStyle}><span>Restricted items</span><strong>{summary.restrictionCount}</strong></div>
		</div>
	);
}

export const pages = {
	"/settings": SettingsPage,
	"/restrictions": RestrictionsPage,
};

export const widgets = {
	overview: OverviewWidget,
};

const buttonStyle: React.CSSProperties = {
	padding: "10px 16px",
	background: "#111827",
	color: "#ffffff",
	borderRadius: 999,
	border: "none",
	cursor: "pointer",
	fontWeight: 600,
};

const buttonLinkStyle: React.CSSProperties = {
	...buttonStyle,
	display: "inline-flex",
	textDecoration: "none",
};

const ghostButtonStyle: React.CSSProperties = {
	background: "transparent",
	border: "none",
	color: "#4b5563",
	cursor: "pointer",
	fontWeight: 600,
	padding: 0,
};

const linkStyle: React.CSSProperties = {
	color: "#111827",
	fontWeight: 600,
};

const inputStyle: React.CSSProperties = {
	width: "100%",
	padding: "10px 12px",
	borderRadius: 10,
	border: "1px solid #d1d5db",
	background: "#ffffff",
};

const helpText: React.CSSProperties = {
	margin: 0,
	fontSize: 13,
	color: "#6b7280",
};

const captionText: React.CSSProperties = {
	margin: "6px 0 0",
	fontSize: 12,
	color: "#6b7280",
};

const summaryRowStyle: React.CSSProperties = {
	display: "flex",
	justifyContent: "space-between",
	gap: 12,
};
