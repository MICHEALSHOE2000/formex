import {
  limit,
  db,
  endpoint,
  id,
  slug,
  field,
  paymentOptions,
  reject,
} from "../server/formex.mjs";
import { provider, verify } from "../server/payment.mjs";
export default endpoint(async (req, res) => {
  if (req.method === "GET")
    return res.json({ status: await verify(id(req.query.reference)) });
  if (req.method !== "POST") reject(405, "POST required.");
  const b = req.body || {},
    reference = id(b.reference),
    methods = paymentOptions();
  if (
    !["pickup", "delivery"].includes(b.fulfilment) ||
    !["pickup", "transfer", "paystack"].includes(b.method) ||
    (b.method === "pickup" ? b.fulfilment !== "pickup" : !methods[b.method])
  )
    reject(400, "Choose an available payment method.");
  const email = field(b.email, 254),
    phone = field(b.phone, 32);
  if (
    !/^\S+@\S+\.\S+$/.test(email) ||
    !/^\+?[\d ()-]{7,25}$/.test(phone) ||
    !Number.isSafeInteger(b.expected) ||
    b.expected <= 0
  )
    reject(400, "Check contact information and total.");
  const p = {
    reference,
    slug: slug(b.slug),
    storage: field(b.storage),
    condition: field(b.condition),
    color: b.color ? field(b.color) : "",
    email,
    phone,
    name: field(b.name),
    method: b.method,
    fulfilment: b.fulfilment,
    expected: b.expected,
    address: b.fulfilment === "delivery" ? field(b.address, 500) : "",
  };
  await limit(req, "orders", 30);
  const o = await db("rpc/formex_checkout", { method: "POST", body: { p } });
  if (o.method === "paystack") {
    const payment = await db("rpc/formex_start_payment", {
      method: "POST",
      body: { ref: reference },
    });
    if (payment.status === "paid")
      return res.json({ reference, status: "paid" });
    if (payment.url) return res.json({ reference, url: payment.url });
    if (!payment.attempt)
      reject(409, "Payment is opening. Retry in 45 seconds using this order.");
    const attempt = id(payment.attempt);
    const tx = await provider("initialize", {
      reference: attempt,
      amount: o.amount * 100,
      currency: "NGN",
      email,
      callback_url: req.headers.origin + "/checkout/?order=" + reference,
    });
    if (
      new URL(tx.authorization_url).origin !== "https://checkout.paystack.com"
    )
      throw Error("Unexpected provider redirect");
    const saved = await db(
      "formex_payments?reference=eq." +
        reference +
        "&attempt=eq." +
        attempt +
        "&select=reference",
      {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: { checkout_url: tx.authorization_url },
      },
    );
    if (!saved?.length) reject(409, "Retry this order to reopen payment.");
    return res.json({ reference, url: tx.authorization_url });
  }
  const e = process.env;
  res.json({
    reference,
    amount: o.amount,
    status:
      o.method === "pickup"
        ? "Reservation received"
        : "Awaiting manual verification",
    bank:
      o.method === "transfer"
        ? [e.FORMEX_BANK_NAME, e.FORMEX_ACCOUNT_NAME, e.FORMEX_ACCOUNT_NUMBER]
        : undefined,
  });
});
