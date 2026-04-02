import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";

const API = "/_emdash/api/plugins/restrict-with-stripe";
const HEADERS: Record<string, string> = { "X-EmDash-Request": "1", "Content-Type": "application/json" };

async function api(path: string, opts?: RequestInit) {
  const res = await fetch(`${API}${path}`, { ...opts, headers: { ...HEADERS, ...opts?.headers } });
  const json = await res.json();
  return json.data || json;
}

// ═══════════════════════════════════════════════════════════════════
// Settings Page
// ═══════════════════════════════════════════════════════════════════
function SettingsPage() {
  const [settings, setSettings] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [testMode, setTestMode] = useState(false);

  const CONNECT_URL = "https://connect.restrictwithstripe.com";

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cleanUrl = window.location.pathname + "?page=rwstripe";

    if (params.get("pmpro_stripe_connected") === "true") {
      const connectData = {
        stripeSecretKey: params.get("pmpro_stripe_access_token") || "",
        stripePublishableKey: params.get("pmpro_stripe_publishable_key") || "",
        stripeAccountId: params.get("pmpro_stripe_user_id") || "",
        stripeEnvironment: params.get("pmpro_stripe_connected_environment") || "live",
      };
      api("/admin/settings", { method: "POST", body: JSON.stringify(connectData) })
        .then(() => api("/admin/settings"))
        .then(s => { setSettings(s); setMsg("Connected to Stripe!"); })
        .catch(() => setMsg("Error saving Stripe credentials."));
      window.history.replaceState({}, "", cleanUrl);
    } else if (params.get("pmpro_stripe_connected") === "false") {
      setMsg(params.get("error_message") || "Failed to connect to Stripe.");
      window.history.replaceState({}, "", cleanUrl);
      api("/admin/settings").then(setSettings);
    } else if (params.get("pmpro_stripe_disconnected") === "true") {
      setMsg("Disconnected from Stripe.");
      api("/admin/settings").then(setSettings);
      window.history.replaceState({}, "", cleanUrl);
    } else {
      api("/admin/settings").then(setSettings);
    }
  }, []);

  function buildConnectUrl() {
    const returnUrl = window.location.origin + window.location.pathname + "?page=rwstripe";
    const env = testMode ? "sandbox" : "live";
    return `${CONNECT_URL}?action=authorize&gateway_environment=${env}&return_url=${encodeURIComponent(returnUrl)}`;
  }

  async function disconnect() {
    if (!confirm("Disconnect from Stripe?")) return;
    setSaving(true);
    const returnUrl = window.location.origin + window.location.pathname + "?page=rwstripe";
    const env = settings.stripeEnvironment === "test" ? "sandbox" : "live";
    const disconnectUrl = `${CONNECT_URL}?action=disconnect&gateway_environment=${env}&stripe_user_id=${settings.stripeAccountId || ""}&return_url=${encodeURIComponent(returnUrl)}`;
    await api("/admin/settings", { method: "POST", body: JSON.stringify({ disconnect: true }) });
    window.location.href = disconnectUrl;
  }

  const save = async () => {
    setSaving(true); setMsg("");
    try {
      await api("/admin/settings", {
        method: "POST",
        body: JSON.stringify({ showExcerpts: settings.showExcerpts, collectPassword: settings.collectPassword }),
      });
      const updated = await api("/admin/settings");
      setSettings(updated);
      setMsg("Settings saved.");
    } catch { setMsg("Error saving."); }
    setSaving(false);
  };

  if (!settings) return <p>Loading...</p>;

  return (
    <div style={{ maxWidth: 640, padding: 16 }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>Restrict With Stripe</h2>

      <Section title={settings.isConfigured
        ? `1. Connect to Stripe (Connected${settings.stripeEnvironment === "test" ? " in Test Mode" : ""})`
        : "1. Connect to Stripe"}>
        {settings.isConfigured ? (
          <>
            <p style={{ fontSize: 14, color: "#374151", marginBottom: 8 }}>
              Connected to account: <strong>{settings.stripeAccountId || "—"}</strong>
            </p>
            <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 12 }}>
              <a href={`https://dashboard.stripe.com/${settings.stripeEnvironment === "test" ? "test/" : ""}dashboard`}
                target="_blank" rel="noopener" style={{ color: "#635bff" }}>
                Visit your Stripe account dashboard
              </a>
            </p>
            <button onClick={disconnect} disabled={saving}
              style={{ ...btnStyle, background: "#6b7280", fontSize: 13, padding: "6px 14px" }}>
              Disconnect From Stripe
            </button>
          </>
        ) : (
          <>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
                <input type="checkbox" checked={testMode} onChange={e => setTestMode(e.target.checked)} />
                Connect in Test Mode
              </label>
            </div>
            <a href={buildConnectUrl()} style={{
              display: "inline-block", padding: "10px 20px", background: "#635bff", color: "white",
              textDecoration: "none", borderRadius: 6, fontSize: 14, fontWeight: 500, marginBottom: 12,
            }}>
              Connect to Stripe{testMode ? " (Test Mode)" : ""}
            </a>
          </>
        )}
      </Section>

      <Section title="2. Create Products in Stripe">
        <p style={{ fontSize: 14, color: "#6b7280" }}>
          Create products and prices in your{" "}
          <a href="https://dashboard.stripe.com/products" target="_blank" rel="noopener" style={{ color: "#635bff" }}>
            Stripe Dashboard</a>. Each product needs at least one price.
        </p>
      </Section>

      <Section title="3. Restrict Content">
        <p style={{ fontSize: 14, color: "#6b7280" }}>
          Edit any post or page and click the <strong>Restrict</strong> button in the toolbar
          to choose which Stripe products are required for access.
        </p>
      </Section>

      <Section title="4. Display Settings">
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginBottom: 8 }}>
          <input type="checkbox" checked={settings.showExcerpts}
            onChange={e => setSettings({ ...settings, showExcerpts: e.target.checked })} />
          Show excerpts on restricted content
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
          <input type="checkbox" checked={settings.collectPassword}
            onChange={e => setSettings({ ...settings, collectPassword: e.target.checked })} />
          Collect password at registration
        </label>
        <button onClick={save} disabled={saving} style={{ ...btnStyle, marginTop: 12 }}>
          {saving ? "Saving..." : "Save Settings"}
        </button>
        {msg && <p style={{ marginTop: 8, fontSize: 14, color: msg.includes("Error") ? "#dc2626" : "#059669" }}>{msg}</p>}
      </Section>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Restrictions Page
// ═══════════════════════════════════════════════════════════════════
function RestrictionsPage() {
  const [restrictions, setRestrictions] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [r, p] = await Promise.all([
      api("/admin/restrictions"),
      api("/admin/products").catch(() => ({ products: [] })),
    ]);
    setRestrictions(r.items || []);
    setProducts(p.products || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = async (item: any) => {
    const d = item.data || item;
    await api("/admin/restrictions", {
      method: "DELETE",
      body: JSON.stringify({ contentId: d.contentId, collectionSlug: d.collectionSlug }),
    });
    load();
  };

  if (loading) return <p>Loading...</p>;

  return (
    <div style={{ maxWidth: 720, padding: 16 }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>Restricted Content</h2>

      {restrictions.length === 0 ? (
        <p style={{ color: "#6b7280", fontSize: 14 }}>
          No content restricted yet. Edit a post or page and click "Restrict" in the toolbar.
        </p>
      ) : (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
          {restrictions.map((item, i) => {
            const d = item.data || item;
            return (
              <div key={item.id || i} style={{
                padding: 12, borderBottom: i < restrictions.length - 1 ? "1px solid #e5e7eb" : "none",
                display: "flex", justifyContent: "space-between", alignItems: "center",
              }}>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{d.collectionSlug}/{d.contentId}</div>
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    Products: {(d.productIds || []).map((id: string) => {
                      const prod = products.find((p: any) => p.id === id);
                      return prod ? prod.name : id.slice(0, 12) + "...";
                    }).join(", ") || "none"}
                  </div>
                </div>
                <button onClick={() => remove(item)}
                  style={{ fontSize: 12, color: "#dc2626", background: "none", border: "none", cursor: "pointer" }}>
                  Remove
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Dashboard Widget
// ═══════════════════════════════════════════════════════════════════
function OverviewWidget() {
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    Promise.all([api("/admin/settings"), api("/admin/restrictions")])
      .then(([s, r]) => setData({ connected: s.isConfigured, env: s.stripeEnvironment, count: (r.items || []).length }))
      .catch(() => setData({ connected: false, count: 0 }));
  }, []);
  if (!data) return <p style={{ fontSize: 13 }}>Loading...</p>;
  return (
    <div style={{ fontSize: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ color: "#6b7280" }}>Stripe</span>
        <span style={{ fontWeight: 500, color: data.connected ? "#059669" : "#dc2626" }}>
          {data.connected ? `Connected (${data.env})` : "Not connected"}
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ color: "#6b7280" }}>Restricted items</span>
        <span style={{ fontWeight: 500 }}>{data.count}</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Sidebar Panel — Injects toolbar button + restriction modal
// The panel renders minimal in the sidebar, but also injects a
// "Restrict" button next to Preview in the editor toolbar.
// ═══════════════════════════════════════════════════════════════════
function RestrictionPanel({ collection, entryId, item }: {
  collection: string; entryId?: string; item?: Record<string, unknown>;
}) {
  const [products, setProducts] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const toolbarBtnRef = useRef<HTMLElement | null>(null);
  const portalContainer = useRef<HTMLDivElement | null>(null);

  // Use slug for restriction keys (matches frontend URL-based lookups)
  // item.slug is the URL slug; entryId is the database ULID
  const slug = (item as any)?.slug || (item as any)?.data?.slug || entryId;

  // Load data
  useEffect(() => {
    if (!slug) { setLoading(false); return; }
    api("/admin/settings").then(settings => {
      setConfigured(settings.isConfigured);
      if (!settings.isConfigured) { setLoading(false); return; }
      return Promise.all([
        api("/admin/products").catch(() => ({ products: [] })),
        api(`/admin/restrictions?collection=${collection}`).catch(() => ({ items: [] })),
      ]).then(([prodData, resData]) => {
        setProducts(prodData.products || []);
        const items = resData.items || [];
        const match = items.find((r: any) => (r.data?.contentId || r.contentId) === slug);
        if (match) setSelectedIds(match.data?.productIds || match.productIds || []);
        setLoading(false);
      });
    }).catch(() => { setConfigured(false); setLoading(false); });
  }, [slug, collection]);

  // Inject toolbar button next to Preview
  useEffect(() => {
    if (loading) return;

    // Create portal container for the modal
    if (!portalContainer.current) {
      portalContainer.current = document.createElement("div");
      document.body.appendChild(portalContainer.current);
    }

    // Find the toolbar buttons area (the flex container with Preview/Save/Publish)
    const findAndInject = () => {
      // Look for the Preview or Save button area
      const buttons = document.querySelectorAll('button');
      let targetContainer: Element | null = null;
      let insertBefore: Element | null = null;

      for (const btn of buttons) {
        const text = btn.textContent?.trim() || "";
        if (text === "Preview" || text === "Preview draft") {
          targetContainer = btn.parentElement;
          insertBefore = btn;
          break;
        }
      }

      // Fallback: look for Save button
      if (!targetContainer) {
        for (const btn of buttons) {
          if (btn.textContent?.trim() === "Save") {
            targetContainer = btn.parentElement;
            insertBefore = btn;
            break;
          }
        }
      }

      if (!targetContainer || toolbarBtnRef.current?.parentElement === targetContainer) return;

      // Create the Restrict button
      const restrictBtn = document.createElement("button");
      restrictBtn.type = "button";
      restrictBtn.className = (insertBefore as HTMLElement)?.className || "";
      restrictBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256" fill="currentColor" style="margin-right:4px"><path d="M208,80H176V56a48,48,0,0,0-96,0V80H48A16,16,0,0,0,32,96V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V96A16,16,0,0,0,208,80ZM96,56a32,32,0,0,1,64,0V80H96ZM208,208H48V96H208V208Zm-80-36a12,12,0,1,1,12-12A12,12,0,0,1,128,172Zm20-52a4,4,0,0,1-4,4H112a4,4,0,0,1,0-8h32A4,4,0,0,1,148,120Z"/></svg>`;
      restrictBtn.innerHTML += selectedIds.length > 0 ? "Restricted" : "Restrict";

      if (selectedIds.length > 0) {
        restrictBtn.style.color = "#635bff";
        restrictBtn.style.borderColor = "#635bff";
      }

      restrictBtn.addEventListener("click", () => setModalOpen(true));

      if (toolbarBtnRef.current) toolbarBtnRef.current.remove();
      targetContainer.insertBefore(restrictBtn, insertBefore);
      toolbarBtnRef.current = restrictBtn;
    };

    // Try immediately, then with MutationObserver for SPA navigation
    findAndInject();
    const observer = new MutationObserver(findAndInject);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (toolbarBtnRef.current) toolbarBtnRef.current.remove();
    };
  }, [loading, selectedIds, entryId]);

  // Update button text when selection changes
  useEffect(() => {
    if (toolbarBtnRef.current) {
      const hasRestrictions = selectedIds.length > 0;
      toolbarBtnRef.current.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 256 256" fill="currentColor" style="margin-right:4px"><path d="M208,80H176V56a48,48,0,0,0-96,0V80H48A16,16,0,0,0,32,96V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V96A16,16,0,0,0,208,80ZM96,56a32,32,0,0,1,64,0V80H96ZM208,208H48V96H208V208Zm-80-36a12,12,0,1,1,12-12A12,12,0,0,1,128,172Zm20-52a4,4,0,0,1-4,4H112a4,4,0,0,1,0-8h32A4,4,0,0,1,148,120Z"/></svg>`;
      toolbarBtnRef.current.innerHTML += hasRestrictions ? "Restricted" : "Restrict";
      toolbarBtnRef.current.style.color = hasRestrictions ? "#635bff" : "";
      toolbarBtnRef.current.style.borderColor = hasRestrictions ? "#635bff" : "";
    }
  }, [selectedIds]);

  const apply = async (newIds: string[]) => {
    if (!slug) return;
    setSaving(true);
    if (newIds.length === 0) {
      await api("/admin/restrictions", {
        method: "DELETE",
        body: JSON.stringify({ contentId: slug, collectionSlug: collection }),
      });
    } else {
      await api("/admin/restrictions", {
        method: "POST",
        body: JSON.stringify({ contentId: slug, collectionSlug: collection, productIds: newIds }),
      });
    }
    setSelectedIds(newIds);
    setSaving(false);
    setModalOpen(false);
  };

  // Render the modal via portal (outside sidebar)
  const modal = modalOpen && portalContainer.current ? createPortal(
    <RestrictionModal
      products={products}
      selectedIds={selectedIds}
      configured={configured}
      error={error}
      saving={saving}
      onApply={apply}
      onClose={() => setModalOpen(false)}
    />,
    portalContainer.current,
  ) : null;

  // Sidebar shows minimal status
  if (!entryId) return <p style={{ fontSize: 13, color: "#6b7280" }}>Save first.</p>;
  if (loading) return <p style={{ fontSize: 13, color: "#6b7280" }}>Loading...</p>;

  return (
    <div>
      {selectedIds.length > 0 ? (
        <p style={{ fontSize: 13, color: "#635bff", fontWeight: 500 }}>
          {selectedIds.length} product{selectedIds.length > 1 ? "s" : ""} required
        </p>
      ) : (
        <p style={{ fontSize: 13, color: "#6b7280" }}>Not restricted</p>
      )}
      <button onClick={() => setModalOpen(true)}
        style={{ fontSize: 13, color: "#635bff", background: "none", border: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}>
        {selectedIds.length > 0 ? "Edit restrictions" : "Add restriction"}
      </button>
      {modal}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Restriction Modal
// ═══════════════════════════════════════════════════════════════════
function RestrictionModal({ products, selectedIds, configured, error, saving, onApply, onClose }: {
  products: any[];
  selectedIds: string[];
  configured: boolean | null;
  error: string;
  saving: boolean;
  onApply: (ids: string[]) => void;
  onClose: () => void;
}) {
  const [localIds, setLocalIds] = useState<string[]>(selectedIds);

  const toggle = (productId: string, checked: boolean) => {
    setLocalIds(checked ? [...localIds, productId] : localIds.filter(id => id !== productId));
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{
        position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)",
      }} />

      {/* Dialog */}
      <div style={{
        position: "relative", background: "white", borderRadius: 12,
        padding: 24, minWidth: 360, maxWidth: 480, maxHeight: "80vh", overflowY: "auto",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
      }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Restrict With Stripe</h2>

        {configured === false ? (
          <p style={{ color: "#6b7280" }}>Connect Stripe in RWStripe Settings first.</p>
        ) : error ? (
          <p style={{ color: "#dc2626" }}>{error}</p>
        ) : products.length === 0 ? (
          <p style={{ color: "#6b7280" }}>No products found. Create products in Stripe first.</p>
        ) : (
          <>
            <p style={{ fontSize: 14, color: "#6b7280", marginBottom: 12 }}>
              Select which Stripe products are required to view this content:
            </p>
            <div style={{ marginBottom: 16 }}>
              {products.map((p: any) => (
                <label key={p.id} style={{
                  display: "flex", alignItems: "center", gap: 8, fontSize: 14,
                  padding: "8px 0", borderBottom: "1px solid #f3f4f6", cursor: "pointer",
                }}>
                  <input type="checkbox" checked={localIds.includes(p.id)}
                    onChange={e => toggle(p.id, e.target.checked)} />
                  <div>
                    <div style={{ fontWeight: 500 }}>{p.name}</div>
                    {p.description && <div style={{ fontSize: 12, color: "#9ca3af" }}>{p.description}</div>}
                  </div>
                </label>
              ))}
            </div>
          </>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 8 }}>
          <button onClick={onClose} style={{ ...btnStyle, background: "#e5e7eb", color: "#374151" }}>Cancel</button>
          {configured !== false && products.length > 0 && (
            <button onClick={() => onApply(localIds)} disabled={saving}
              style={{ ...btnStyle, opacity: saving ? 0.6 : 1 }}>
              {saving ? "Saving..." : "Apply"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════
export const pages = {
  "/settings": SettingsPage,
  "/restrictions": RestrictionsPage,
};

export const widgets = {
  overview: OverviewWidget,
};

// Toolbar button + modal handles restriction UI — no sidebar panel needed

// ═══════════════════════════════════════════════════════════════════
// Shared UI
// ═══════════════════════════════════════════════════════════════════
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{title}</h3>
      {children}
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "8px 16px", background: "#635bff", color: "white",
  border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14, fontWeight: 500,
};
