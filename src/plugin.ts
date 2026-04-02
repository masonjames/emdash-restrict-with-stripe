// ─── Plugin Implementation (loaded via entrypoint by emdash) ────
import { definePlugin } from "emdash";
import { checkoutHandler } from "./handlers/checkout.js";
import { portalHandler } from "./handlers/portal.js";
import { accessHandler } from "./handlers/access.js";
import { restrictionsHandler } from "./handlers/restrictions.js";
import { settingsHandler } from "./handlers/settings.js";
import { productsHandler } from "./handlers/products.js";
import { sendLinkHandler, verifyHandler, logoutHandler } from "./handlers/auth.js";

export function createPlugin(_options: Record<string, unknown> = {}) {
  return definePlugin({
    id: "restrict-with-stripe",
    version: "0.1.0",
    capabilities: [
      "read:content",
      "read:users",
      "network:fetch",
      "page:inject",
    ],
    allowedHosts: ["api.stripe.com"],

    storage: {
      restrictions: {
        indexes: ["contentId", "collectionSlug"],
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

    hooks: {
      "page:fragments": {
        handler: async (_event: unknown, ctx: any) => {
          const publishableKey = await ctx.kv.get("stripe_publishable_key");
          if (!publishableKey) return null;
          return [
            {
              kind: "html",
              placement: "head",
              key: "rwstripe-css",
              html: `<link rel="stylesheet" href="/_emdash/api/plugins/restrict-with-stripe/assets/rwstripe.css" />`,
            },
            {
              kind: "inline-script",
              placement: "body:end",
              key: "rwstripe-config",
              code: `window.__RWSTRIPE__=${JSON.stringify({ publishableKey })}`,
            },
            {
              kind: "external-script",
              placement: "body:end",
              key: "rwstripe-js",
              src: "/_emdash/api/plugins/restrict-with-stripe/assets/rwstripe.js",
              defer: true,
            },
          ];
        },
      },
    },

    routes: {
      // Public routes (match WP REST API)
      checkout: { public: true, handler: checkoutHandler },
      // Authenticated routes
      portal: { handler: portalHandler },
      // Public — frontend JS checks this without auth; returns restricted status
      access: { public: true, handler: accessHandler },
      // Products — public so frontend paywall can show product names/prices
      "admin/products": { public: true, handler: productsHandler },
      "admin/restrictions": { handler: restrictionsHandler },
      "admin/settings": { handler: settingsHandler },
      // Auth — magic link login
      "auth/send-link": { public: true, handler: sendLinkHandler },
      "auth/verify": { public: true, handler: verifyHandler },
      "auth/logout": { public: true, handler: logoutHandler },
    },

    admin: {
      entry: "emdash-restrict-with-stripe/admin",
      pages: [
        { path: "/settings", label: "RWStripe Settings" },
        { path: "/restrictions", label: "RWStripe Restrictions" },
      ],
      widgets: [
        { id: "overview", title: "Restrict With Stripe" },
      ],
    },
  });
}

// ─── Static Asset Handlers ───────────────────────────────────────

async function cssHandler() {
  return {
    __raw: true,
    status: 200,
    headers: { "Content-Type": "text/css", "Cache-Control": "public, max-age=3600" },
    body: `
.rwstripe-checkout {
  max-width: 400px;
  margin: 2rem auto;
  padding: 1.5rem;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
  font-family: system-ui, -apple-system, sans-serif;
}
.rwstripe-checkout-heading {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 1rem;
}
.rwstripe-checkout input[type="email"],
.rwstripe-checkout input[type="password"] {
  width: 100%;
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.875rem;
}
.rwstripe-checkout select {
  width: 100%;
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 0.875rem;
}
.rwstripe-checkout-button {
  width: 100%;
  padding: 0.625rem 1rem;
  background: #635bff;
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
}
.rwstripe-checkout-button:hover { background: #5046e5; }
.rwstripe-checkout-button:disabled { opacity: 0.6; cursor: not-allowed; }
.rwstripe-price { font-size: 1.5rem; font-weight: 700; margin: 0.5rem 0 1rem; }
.rwstripe-error { color: #dc2626; font-size: 0.875rem; margin-bottom: 0.75rem; }
.rwstripe-portal-link {
  display: inline-block;
  padding: 0.5rem 1rem;
  background: #635bff;
  color: white;
  text-decoration: none;
  border-radius: 6px;
  font-size: 0.875rem;
}
.rwstripe-portal-link:hover { background: #5046e5; }
.rwstripe-gated { animation: rwstripe-fadein 0.3s ease; }
@keyframes rwstripe-fadein { from { opacity: 0; } to { opacity: 1; } }
`,
  };
}

async function jsHandler() {
  return {
    __raw: true,
    status: 200,
    headers: { "Content-Type": "application/javascript", "Cache-Control": "public, max-age=3600" },
    body: `
// Restrict With Stripe — frontend JS
(function() {
  var API = '/_emdash/api/plugins/restrict-with-stripe';

  // ─── Content Gating ──────────────────────────────────────────
  // On every page load, check if the current content is restricted.
  // If restricted + no access: hide article content, show paywall.
  // If not restricted or has access: do nothing.

  async function checkAccess() {
    // Skip admin pages
    if (location.pathname.startsWith('/_emdash')) return;

    // Extract slug from URL. Blog template uses /blog/[slug] or /[slug]
    var parts = location.pathname.replace(/^\\/|\\/$/, '').split('/');
    if (parts.length === 0 || parts[0] === '') return;

    // Try the most specific slug (last path segment)
    var slug = parts[parts.length - 1];
    // Determine collection from URL pattern
    var collection = parts.length > 1 ? parts[0] : 'pages';
    if (collection === 'blog') collection = 'posts';

    try {
      var res = await fetch(API + '/access?contentId=' + encodeURIComponent(slug) +
        '&collection=' + encodeURIComponent(collection));
      var json = await res.json();
      var data = json.data || json;

      if (!data.restricted) return; // Not restricted, show normally
      if (data.hasAccess) return;   // Has access, show normally

      // Content is restricted and user doesn't have access — gate it
      gateContent(data.productIds || []);
    } catch (err) {
      console.error('[rwstripe] Access check failed:', err);
    }
  }

  async function gateContent(productIds) {
    // Find the main content area
    var article = document.querySelector('article') || document.querySelector('main') || document.querySelector('[data-content]');
    if (!article) return;

    // Check settings for excerpt preference
    var settingsRes = await fetch(API + '/admin/settings', { headers: { 'X-EmDash-Request': '1' } }).catch(function() { return null; });
    var showExcerpts = true;
    if (settingsRes && settingsRes.ok) {
      var s = await settingsRes.json();
      showExcerpts = (s.data || s).showExcerpts !== false;
    }

    // Preserve title/header, hide body content
    var heading = article.querySelector('h1');
    var headingHtml = heading ? heading.outerHTML : '';

    // Maybe show excerpt (first paragraph)
    var excerpt = '';
    if (showExcerpts) {
      var firstP = article.querySelector('p');
      if (firstP) excerpt = '<div style="opacity:0.7;margin-bottom:1rem">' + firstP.outerHTML + '<p style="font-style:italic;color:#6b7280">...</p></div>';
    }

    // Fetch product details for the paywall
    var products = [];
    try {
      var prodRes = await fetch(API + '/admin/products', { headers: { 'X-EmDash-Request': '1' } });
      var prodJson = await prodRes.json();
      products = (prodJson.data || prodJson).products || [];
      // Filter to only the products that restrict this content
      products = products.filter(function(p) { return productIds.indexOf(p.id) !== -1; });
    } catch(e) {}

    // Build product options
    var productHtml = '';
    if (products.length === 1) {
      productHtml = '<input type="hidden" name="rwstripe-product-id" value="' + products[0].default_price + '" />';
    } else if (products.length > 1) {
      productHtml = '<select name="rwstripe-product-id" class="rwstripe-checkout select">';
      productHtml += '<option value="">-- Choose one --</option>';
      products.forEach(function(p) {
        productHtml += '<option value="' + (p.default_price || '') + '">' + p.name + '</option>';
      });
      productHtml += '</select>';
    }

    // Build paywall HTML
    var paywallHtml = headingHtml + excerpt +
      '<div class="rwstripe-checkout">' +
        '<div class="rwstripe-checkout-heading">Purchase Access</div>' +
        '<div class="rwstripe-error"></div>' +
        '<form class="rwstripe-register">' +
          '<input type="email" name="rwstripe-email" placeholder="Email Address" />' +
          productHtml +
          '<button type="submit" class="rwstripe-checkout-button">Create Account &amp; Checkout</button>' +
        '</form>' +
      '</div>';

    article.innerHTML = paywallHtml;
  }

  // Run access check after DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', checkAccess);
  } else {
    checkAccess();
  }

  // ─── Checkout Form Handler ────────────────────────────────────
  document.addEventListener('submit', async function(e) {
    var form = e.target;
    if (!form.classList.contains('rwstripe-register')) return;
    e.preventDefault();

    var btn = form.querySelector('.rwstripe-checkout-button');
    var errDiv = form.parentElement.querySelector('.rwstripe-error');
    if (btn) btn.disabled = true;
    if (errDiv) errDiv.textContent = '';

    var data = {
      price_id: form.querySelector('[name="rwstripe-product-id"]')?.value,
      redirect_url: window.location.href,
      email: form.querySelector('[name="rwstripe-email"]')?.value || undefined,
      password: form.querySelector('[name="rwstripe-password"]')?.value || undefined,
    };

    try {
      var res = await fetch(API + '/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      var json = await res.json();
      var result = json.data || json;
      if (result.url) {
        window.location.href = result.url;
      } else {
        throw new Error(result.error || 'Checkout failed');
      }
    } catch (err) {
      if (errDiv) errDiv.textContent = err.message;
      if (btn) btn.disabled = false;
    }
  });

  // ─── Customer Portal Handler ──────────────────────────────────
  document.addEventListener('click', async function(e) {
    var link = e.target.closest('.rwstripe-portal-link');
    if (!link) return;
    e.preventDefault();

    try {
      var res = await fetch(API + '/portal?return_url=' +
        encodeURIComponent(window.location.href), {
        headers: { 'X-EmDash-Request': '1' },
      });
      var json = await res.json();
      var result = json.data || json;
      if (result.url) window.location.href = result.url;
    } catch (err) {
      console.error('[rwstripe] Portal error:', err);
    }
  });
})();
`,
  };
}
