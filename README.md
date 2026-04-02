# Restrict With Stripe for EmDash

Restrict content and sell access with Stripe. The first membership plugin for [EmDash CMS](https://emdashcms.com).

## Features

- **Content Restriction** — Restrict any post or page to require a Stripe product purchase
- **Stripe Connect** — One-click connection to your Stripe account via Stripe Connect OAuth
- **Checkout** — Redirect visitors to Stripe Checkout to purchase access
- **Customer Portal** — Let customers manage their subscriptions via Stripe's billing portal
- **Magic Link Login** — Returning customers log in via email link (no passwords)
- **Admin UI** — Settings page, restrictions manager, dashboard widget, and toolbar button in the content editor
- **Real-time Access Checks** — Verifies purchases against the Stripe API on every page load. No stale local data.

## Installation

```bash
npm install emdash-restrict-with-stripe
```

## Setup

### 1. Add the plugin to your EmDash site

```js
// astro.config.mjs
import { restrictWithStripe } from "emdash-restrict-with-stripe";

export default defineConfig({
  integrations: [
    emdash({
      plugins: [restrictWithStripe()],
    }),
  ],
});
```

### 2. Add the frontend script to your theme

Add the content gating script to your base layout, just before `</body>`:

```astro
<!-- src/layouts/Base.astro -->
<EmDashBodyEnd page={pageCtx} />
<script is:inline src="/_emdash/api/plugins/restrict-with-stripe/assets/rwstripe.js" defer></script>
```

> **Note:** EmDash plugins cannot currently inject scripts into themes automatically. This manual step will be unnecessary once EmDash adds full `page:fragments` support for plugin-injected scripts.

### 3. Add the verify page for magic link login

Create a page at `src/pages/account/verify.astro` that handles magic link authentication:

```astro
---
const token = Astro.url.searchParams.get("token");
const redirect = Astro.url.searchParams.get("redirect") || "/";
let error = "";
let sessionToken = "";
let redirectUrl = redirect;

if (token) {
  try {
    const res = await fetch(
      `http://127.0.0.1:4321/_emdash/api/plugins/restrict-with-stripe/auth/verify?token=${encodeURIComponent(token)}&redirect=${encodeURIComponent(redirect)}`
    );
    const json = await res.json();
    const data = json.data || json;
    if (data.ok && data.sessionToken) {
      sessionToken = data.sessionToken;
      redirectUrl = data.redirect || redirect;
    } else {
      error = data.error || "Invalid or expired login link.";
    }
  } catch {
    error = "Verification failed.";
  }
} else {
  error = "No token provided.";
}
---

<html>
<body>
  {error ? (
    <p>{error}</p>
  ) : (
    <script is:inline define:vars={{ sessionToken, redirectUrl }}>
      document.cookie = `rwstripe_session=${sessionToken}; path=/; max-age=${30*24*60*60}; SameSite=Lax`;
      window.location.href = redirectUrl;
    </script>
  )}
</body>
</html>
```

Adjust the port (`4321`) to match your dev server.

### 4. Connect to Stripe

1. Go to your EmDash admin: `/_emdash/admin`
2. Navigate to **RWStripe Settings** in the sidebar
3. Click **Connect to Stripe** (or check "Connect in Test Mode" first for testing)
4. Authorize the connection on Stripe's site
5. You'll be redirected back to your EmDash admin with the connection confirmed

### 5. Create products in Stripe

1. Go to your [Stripe Dashboard](https://dashboard.stripe.com/products)
2. Create products with prices (one-time or recurring)
3. Each product needs at least one **default price**

### 6. Restrict content

1. Edit any post or page in the EmDash admin
2. Click the **Restrict** button in the toolbar (lock icon, next to Preview)
3. Select which Stripe products are required to view the content
4. Click **Apply**

Visitors without access will see a paywall with options to purchase or log in.

## How It Works

### For new visitors (purchase flow)

1. Visitor hits a restricted page
2. Content is replaced with a paywall showing "Purchase" and "Log In" tabs
3. On the **Purchase** tab: enter email, select product, click checkout
4. Redirected to Stripe Checkout to complete payment
5. After payment, Stripe redirects back to the page with a session token
6. Session cookie is set automatically — content is now visible

### For returning visitors (login flow)

1. Visitor hits a restricted page, session cookie has expired
2. Click the **Log In** tab, enter email
3. A magic link is sent to their inbox
4. Click the link → session cookie set → content visible
5. Access is verified against Stripe's API (active subscription or paid invoice)

### Access verification

Every access check queries the Stripe API directly:

1. Look up customer by email (`GET /v1/customers?email=...`)
2. Check active/trialing subscriptions for the required products
3. Check paid invoices for one-time purchases
4. Grant or deny access based on the results

No local state is trusted. The Stripe API is the source of truth.

## Plugin Architecture

```
src/
  index.ts          # Plugin descriptor (loaded by astro.config.mjs)
  plugin.ts         # Plugin implementation (hooks, routes, storage)
  admin.tsx         # React admin UI (settings, restrictions, toolbar button, modal)
  stripe.ts         # Fetch-based Stripe API client (no SDK dependency)
  handlers/
    auth.ts         # Magic link send + verify
    checkout.ts     # Stripe Checkout session creation
    portal.ts       # Stripe Customer Portal session
    access.ts       # Content access verification
    products.ts     # List Stripe products
    restrictions.ts # CRUD for content restrictions
    settings.ts     # Plugin settings (Stripe keys, display prefs)
```

### Plugin Storage

The plugin uses EmDash's plugin storage system (SQLite-backed):

| Collection | Purpose |
|---|---|
| `restrictions` | Which content requires which Stripe products |
| `taxonomyRestrictions` | Category/tag-level restrictions |
| `customers` | Email → Stripe customer ID mapping |
| `authTokens` | Magic link tokens (15-minute expiry) |
| `sessions` | Login sessions (30-day expiry) |

### API Routes

| Route | Auth | Purpose |
|---|---|---|
| `POST /checkout` | Public | Create Stripe Checkout session |
| `GET /access` | Public | Check if current user can view content |
| `GET /portal` | Session | Get Stripe Customer Portal URL |
| `POST /auth/send-link` | Public | Send magic link email |
| `GET /auth/verify` | Public | Verify magic link token |
| `GET /auth/logout` | Public | Clear session |
| `GET /admin/products` | Public | List Stripe products |
| `GET/POST/DELETE /admin/restrictions` | Admin | Manage restrictions |
| `GET/POST /admin/settings` | Admin | Plugin settings |

## Email Configuration

Magic link emails are sent via SMTP. Configure in the plugin's KV store:

| Key | Default | Description |
|---|---|---|
| `smtp_host` | `127.0.0.1` | SMTP server host |
| `smtp_port` | `1025` | SMTP server port |
| `from_email` | `noreply@emdash.local` | Sender email address |
| `site_name` | `EmDash Site` | Site name in emails |

For local development, use [Mailpit](https://mailpit.axllent.org/) to capture emails.

For production, configure a real SMTP server or update the auth handler to use an email API (Resend, SES, etc.).

## Requirements

- EmDash CMS v0.1.0+
- Node.js runtime (not Cloudflare Workers — uses `node:net` for SMTP)
- A Stripe account with products and prices configured

## WordPress Comparison

This plugin is a direct port of [Restrict With Stripe](https://restrictwithstripe.com) for WordPress. Key differences:

| Feature | WordPress Version | EmDash Version |
|---|---|---|
| Content restriction | Post meta + term meta | Plugin storage (SQLite) |
| Content filtering | `the_content` filter | Client-side JS gating |
| User accounts | WordPress users | Magic link sessions |
| Checkout | WP REST API + Stripe Checkout | Plugin route + Stripe Checkout |
| Admin UI | WP Settings page + meta boxes | React admin pages + toolbar button |
| Stripe SDK | PHP SDK | Fetch-based client (no SDK) |

## License

GPL-2.0-or-later

## Credits

Built by [Stranger Studios](https://strangerstudios.com), the team behind [Paid Memberships Pro](https://www.paidmembershipspro.com).
