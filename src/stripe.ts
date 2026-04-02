// Fetch-based Stripe client — works in emdash sandboxed plugins (no Node SDK).

type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export class StripeClient {
  constructor(
    private secretKey: string,
    private fetchFn: FetchFn,
  ) {}

  private async request(path: string, method = "GET", body?: Record<string, string>) {
    const res = await this.fetchFn(`https://api.stripe.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body ? new URLSearchParams(body).toString() : undefined,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || `Stripe error ${res.status}`);
    }
    return data;
  }

  // ─── Products & Prices ─────────────────────────────────────────

  async getAllProducts(): Promise<{ data: StripeProduct[] }> {
    return this.request("/products?active=true&limit=100");
  }

  async getProduct(id: string): Promise<StripeProduct> {
    return this.request(`/products/${encodeURIComponent(id)}`);
  }

  async getPrice(id: string): Promise<StripePrice> {
    return this.request(`/prices/${encodeURIComponent(id)}`);
  }

  // ─── Customers ─────────────────────────────────────────────────

  async createCustomer(email: string): Promise<{ id: string }> {
    return this.request("/customers", "POST", { email });
  }

  async updateCustomerEmail(customerId: string, email: string) {
    return this.request(`/customers/${encodeURIComponent(customerId)}`, "POST", { email });
  }

  async getCustomersByEmail(email: string): Promise<{ data: Array<{ id: string }> }> {
    return this.request(`/customers?email=${encodeURIComponent(email)}&limit=10`);
  }

  // ─── Checkout ──────────────────────────────────────────────────

  async createCheckoutSession(params: {
    priceId: string;
    customerId: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ url: string }> {
    // Detect mode from price
    const price = await this.getPrice(params.priceId);
    const mode = price.type === "recurring" ? "subscription" : "payment";

    return this.request("/checkout/sessions", "POST", {
      "line_items[0][price]": params.priceId,
      "line_items[0][quantity]": "1",
      customer: params.customerId,
      success_url: params.successUrl,
      cancel_url: params.cancelUrl,
      mode,
    });
  }

  // ─── Customer Portal ───────────────────────────────────────────

  async createPortalSession(customerId: string, returnUrl: string): Promise<{ url: string }> {
    return this.request("/billing_portal/sessions", "POST", {
      customer: customerId,
      return_url: returnUrl,
    });
  }

  // ─── Access Checks ─────────────────────────────────────────────

  async customerHasProduct(customerId: string, productIds: string[]): Promise<boolean> {
    if (!customerId || productIds.length === 0) return false;

    // Check active/trialing subscriptions
    const subs = await this.request(
      `/subscriptions?customer=${encodeURIComponent(customerId)}&status=active&limit=100`,
    );
    for (const sub of subs.data || []) {
      for (const item of sub.items?.data || []) {
        if (productIds.includes(item.price?.product)) return true;
      }
    }

    // Check trialing
    const trialSubs = await this.request(
      `/subscriptions?customer=${encodeURIComponent(customerId)}&status=trialing&limit=100`,
    );
    for (const sub of trialSubs.data || []) {
      for (const item of sub.items?.data || []) {
        if (productIds.includes(item.price?.product)) return true;
      }
    }

    // Check paid invoices (one-time purchases, not subscription invoices)
    const invoices = await this.request(
      `/invoices?customer=${encodeURIComponent(customerId)}&status=paid&limit=100`,
    );
    for (const inv of invoices.data || []) {
      if (inv.subscription) continue; // Skip subscription invoices
      if (inv.metadata?.["rwstripe-ignore"]) continue;
      for (const line of inv.lines?.data || []) {
        if (productIds.includes(line.price?.product)) return true;
      }
    }

    return false;
  }
}

// ─── Types ───────────────────────────────────────────────────────

export interface StripeProduct {
  id: string;
  name: string;
  description: string | null;
  default_price: string | null;
  active: boolean;
  images: string[];
}

export interface StripePrice {
  id: string;
  product: string;
  active: boolean;
  currency: string;
  unit_amount: number | null;
  type: "one_time" | "recurring";
  recurring: { interval: string; interval_count: number } | null;
}
