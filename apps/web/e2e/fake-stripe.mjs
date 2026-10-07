// A tiny in-memory stand-in for the parts of the Stripe API SureFrame uses,
// so billing can be tested without a Stripe account. Start the app with
// STRIPE_API_BASE=http://localhost:12111 STRIPE_SECRET_KEY=sk_test_fake.
import { createServer } from "node:http";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

// State survives between runs, like a real Stripe account does (the app caches price ids).
const FILE = process.env.FAKE_STRIPE_STATE ?? `${tmpdir()}/sureframe-fake-stripe.json`;
const saved = existsSync(FILE) ? JSON.parse(readFileSync(FILE, "utf8")) : {};
let n = saved.n ?? 0;
const RUN = Math.random().toString(36).slice(2, 8);
const id = (p) => `${p}_${RUN}${(++n).toString().padStart(6, "0")}`;
export const state = { products: [], prices: [], customers: [], sessions: [], subs: [], portalConfigs: [], portalSessions: [], deletedCustomers: [], ...saved.state };
// Set to true to make the next payment on a subscription change fail.
export const control = { declineNext: false };
const persist = () => writeFileSync(FILE, JSON.stringify({ n, state }));

// Decode Stripe's form encoding (a[b][0][c]=x) into nested objects.
function parseForm(body) {
  const out = {};
  for (const [k, v] of new URLSearchParams(body)) {
    const path = k.replace(/\]/g, "").split("[");
    let o = out;
    path.forEach((p, i) => {
      if (i === path.length - 1) o[p] = v;
      else o = o[p] ??= {};
    });
  }
  const arrays = (o) => {
    if (o && typeof o === "object") {
      for (const k of Object.keys(o)) o[k] = arrays(o[k]);
      const keys = Object.keys(o);
      if (keys.length && keys.every((k, i) => k === String(i))) return keys.map((k) => o[k]);
    }
    return o;
  };
  return arrays(out);
}

const list = (data) => ({ object: "list", data, has_more: false, url: "" });

function subItem(price, quantity, end) {
  return { id: id("si"), object: "subscription_item", price, quantity, current_period_end: end };
}

export function createSubscription(customer, workspaceId, lookupKey, status = "active") {
  const price = state.prices.find((p) => p.lookup_key === lookupKey);
  const end = Math.floor(Date.now() / 1000) + 30 * 86400;
  const card = { id: id("pm"), object: "payment_method", type: "card", card: { brand: "visa", last4: "4242" } };
  const sub = { id: id("sub"), object: "subscription", customer, status, metadata: { workspaceId }, default_payment_method: card, items: list([subItem(price, 1, end)]) };
  state.subs.push(sub);
  return sub;
}

export function start(port = 12111) {
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    const url = new URL(req.url, "http://x");
    const form = parseForm(req.method === "GET" ? url.search.slice(1) : body);
    const send = (code, obj) => {
      persist();
      res.writeHead(code, { "Content-Type": "application/json", "Request-Id": "req_fake" });
      res.end(JSON.stringify(obj));
    };
    const p = url.pathname;
    let m;
    if (p === "/v1/prices" && req.method === "GET") {
      const keys = [].concat(form.lookup_keys ?? []);
      return send(200, list(state.prices.filter((x) => x.active && keys.includes(x.lookup_key))));
    }
    if (p === "/v1/products" && req.method === "POST") {
      const prod = { id: id("prod"), object: "product", name: form.name, tax_code: form.tax_code, metadata: form.metadata ?? {} };
      state.products.push(prod);
      return send(200, prod);
    }
    if (p === "/v1/prices" && req.method === "POST") {
      if (form.transfer_lookup_key === "true") for (const x of state.prices) if (x.lookup_key === form.lookup_key) x.lookup_key = null;
      const price = { id: id("price"), object: "price", active: true, product: form.product, unit_amount: Number(form.unit_amount), currency: form.currency, lookup_key: form.lookup_key, recurring: form.recurring };
      state.prices.push(price);
      return send(200, price);
    }
    if (p === "/v1/customers" && req.method === "POST") {
      const c = { id: id("cus"), object: "customer", email: form.email, name: form.name, metadata: form.metadata ?? {} };
      state.customers.push(c);
      return send(200, c);
    }
    if ((m = p.match(/^\/v1\/customers\/([^/]+)$/)) && req.method === "GET") {
      return send(200, { id: m[1], object: "customer", invoice_settings: { default_payment_method: null } });
    }
    if (p === "/v1/invoices/create_preview" && req.method === "POST") {
      // Half the difference in price, as if switching halfway through the period.
      const sub = state.subs.find((s) => s.id === form.subscription);
      const cost = (items) => items.reduce((t, i) => t + (i.price?.unit_amount ?? 0) * (i.quantity ?? 1), 0);
      const after = sub.items.data
        .filter((i) => !(form.subscription_details.items ?? []).some((x) => x.id === i.id && x.deleted === "true"))
        .map((i) => {
          const change = (form.subscription_details.items ?? []).find((x) => x.id === i.id);
          return change?.price ? { price: state.prices.find((x) => x.id === change.price), quantity: i.quantity } : i;
        });
      // The new items in full from today, less half the current ones as unused time.
      const full = cost(after);
      const credit = -Math.round(cost(sub.items.data) / 2);
      state.previews = [...(state.previews ?? []), form];
      const lines = list([{ amount: full }, { amount: credit }]);
      return send(200, { object: "invoice", amount_due: Math.max(0, full + credit), total: full + credit, currency: "usd", lines });
    }
    if ((m = p.match(/^\/v1\/customers\/([^/]+)$/)) && req.method === "DELETE") {
      state.deletedCustomers.push(m[1]);
      for (const s of state.subs) if (s.customer === m[1]) s.status = "canceled";
      return send(200, { id: m[1], object: "customer", deleted: true });
    }
    if (p === "/v1/checkout/sessions" && req.method === "POST") {
      const s = { id: id("cs"), object: "checkout.session", url: `https://checkout.stripe.test/${n}`, params: form };
      state.sessions.push(s);
      return send(200, s);
    }
    if ((m = p.match(/^\/v1\/subscriptions\/([^/]+)$/))) {
      const sub = state.subs.find((s) => s.id === m[1]);
      if (!sub) return send(404, { error: { type: "invalid_request_error", code: "resource_missing", message: "No such subscription" } });
      if (req.method === "POST") {
        sub.lastUpdate = form;
        if (control.declineNext && form.payment_behavior === "pending_if_incomplete") {
          control.declineNext = false;
          return send(200, { ...sub, pending_update: { expires_at: 0 }, latest_invoice: { id: id("in"), hosted_invoice_url: "https://invoice.stripe.test/pay" } });
        }
        for (const it of [].concat(form.items ?? [])) {
          const existing = sub.items.data.find((i) => i.id === it.id);
          const price = it.price ? state.prices.find((x) => x.id === it.price) : existing?.price;
          if (it.deleted === "true") sub.items.data = sub.items.data.filter((i) => i.id !== it.id);
          else if (existing) Object.assign(existing, { price, quantity: Number(it.quantity ?? existing.quantity) });
          else sub.items.data.push(subItem(price, Number(it.quantity ?? 1), sub.items.data[0]?.current_period_end));
        }
      }
      return send(200, req.method === "POST" ? { ...sub, pending_update: null, latest_invoice: { id: id("in"), hosted_invoice_url: null } } : sub);
    }
    if (p === "/v1/billing_portal/configurations" && req.method === "GET") return send(200, list(state.portalConfigs));
    if (p === "/v1/billing_portal/configurations" && req.method === "POST") {
      const c = { id: id("bpc"), object: "billing_portal.configuration", active: true, metadata: form.metadata ?? {} };
      state.portalConfigs.push(c);
      return send(200, c);
    }
    if (p === "/v1/billing_portal/sessions" && req.method === "POST") {
      state.portalSessions.push(form);
      return send(200, { id: id("bps"), object: "billing_portal.session", url: "https://billing.stripe.test/portal", configuration: form.configuration });
    }
    send(404, { error: { type: "invalid_request_error", message: `fake-stripe: no route ${req.method} ${p}` } });
  });
  return new Promise((r) => server.listen(port, () => r(server)));
}
