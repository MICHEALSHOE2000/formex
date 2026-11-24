import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import admin from "../api/admin.mjs";
import checkout from "../api/checkout.mjs";
import { verify } from "../server/payment.mjs";
import { paymentOptions, project } from "../server/formex.mjs";
const ref = randomUUID(),
  url = "https://formex.example";
async function invoke(fn, req) {
  const result = {
    code: 200,
    setHeader() {
      return this;
    },
    status(code) {
      this.code = code;
      return this;
    },
    json(value) {
      this.value = value;
    },
  };
  await fn({ query: {}, headers: {}, ...req }, result);
  return result;
}
test("Formex project isolation, staff authorization and test provider verification", async (t) => {
  process.env.FORMEX_PROJECT_REF = "nrpqiudmdxcabjqalwia";
  assert.throws(project);
  process.env.FORMEX_PROJECT_REF = "aaaaaaaaaaaaaaaaaaaa";
  process.env.FORMEX_SERVICE_ROLE_KEY = "fixture";
  process.env.FORMEX_ORIGIN = url;
  process.env.FORMEX_PAYSTACK_SECRET = "sk_live_fixture";
  assert.equal(paymentOptions().paystack, false);
  process.env.FORMEX_PAYSTACK_SECRET = "sk_test_fixture";
  const normal = { id: randomUUID(), email_confirmed_at: "test" };
  let confirm = 0,
    tx = {
      id: 12,
      status: "success",
      domain: "test",
      amount: 250000,
      currency: "NGN",
      reference: ref,
    };
  t.mock.method(globalThis, "fetch", async (path) => {
    if (path.includes("/auth/v1/user")) return Response.json(normal);
    if (path.includes("formex_admins?")) return Response.json([]);
    if (path.includes("formex_payments?"))
      return Response.json([{ attempt: ref }]);
    if (path.includes("formex_orders?"))
      return Response.json([{ method: "paystack", amount: 2500 }]);
    if (path.includes("api.paystack.co/transaction/verify/"))
      return Response.json({ status: true, data: tx });
    if (path.includes("rpc/formex_confirm")) {
      confirm++;
      return Response.json(null);
    }
    throw Error("Unexpected path");
  });
  assert.equal((await invoke(admin, { method: "GET" })).code, 401);
  assert.equal(
    (
      await invoke(admin, {
        method: "GET",
        headers: { authorization: "Bearer test" },
      })
    ).code,
    403,
  );
  assert.equal((await invoke(checkout, { method: "POST" })).code, 403);
  assert.equal(await verify(ref), "paid");
  assert.equal(confirm, 1);
  for (const altered of [
    { amount: 249999 },
    { reference: randomUUID() },
    { currency: "USD" },
    { domain: "live" },
  ]) {
    const saved = tx;
    tx = { ...saved, ...altered };
    await assert.rejects(verify(ref));
    tx = saved;
  }
  tx = { ...tx, status: "abandoned" };
  assert.equal(await verify(ref), "pending");
  assert.equal(confirm, 1);
});

test("bulk price edit preserves variant details and detects stale prices", async (t) => {
  process.env.FORMEX_PROJECT_REF = "aaaaaaaaaaaaaaaaaaaa";
  process.env.FORMEX_SERVICE_ROLE_KEY = "fixture";
  process.env.FORMEX_ORIGIN = url;
  const user = { id: randomUUID(), email_confirmed_at: "test" };
  const details = { position: 1, condition: "UK Used", regularPrice: 250000, color: "Black" };
  let variant = { price: 220000, available: false, details };
  let writes = 0;
  t.mock.method(globalThis, "fetch", async (path, args) => {
    if (path.includes("/auth/v1/user")) return Response.json(user);
    if (path.includes("formex_admins?")) return Response.json([{ user_id: user.id }]);
    if (path.includes("formex_variants?")) {
      const query = new URL(path).searchParams;
      assert.equal(query.get("storage"), "eq.128GB · Black");
      if (args.method === "PATCH") {
        assert.equal(query.get("details"), "eq." + JSON.stringify(variant.details));
        variant = JSON.parse(args.body);
        writes++;
      }
      return Response.json([variant]);
    }
    throw Error("Unexpected path");
  });
  const req = {
    method: "POST",
    headers: { origin: url, authorization: "Bearer test", "content-type": "application/json" },
    body: {
      action: "variant_prices", slug: "iphone-11", storage: "128GB · Black",
      original: { price: 220000, regular: 250000, available: false },
      price: 230000, regular: 250000, available: true,
    },
  };
  assert.equal((await invoke(admin, req)).code, 200);
  assert.equal(variant.price, 230000);
  assert.equal(variant.details.condition, "UK Used");
  assert.equal(variant.details.color, "Black");
  assert.equal((await invoke(admin, req)).code, 200);
  assert.equal(writes, 1);
  assert.equal((await invoke(admin, { ...req, body: { ...req.body, price: 235000 } })).code, 409);
  assert.equal((await invoke(admin, { ...req, body: { ...req.body, regular: 1000 } })).code, 400);
  assert.equal(writes, 1);
});
