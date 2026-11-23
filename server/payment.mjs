import { db, id, paymentOptions, reject } from "./formex.mjs";
export async function provider(path, body) {
  if (!paymentOptions().paystack) reject(503, "Test payment is unavailable.");
  const response = await fetch("https://api.paystack.co/transaction/" + path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + process.env.FORMEX_PAYSTACK_SECRET,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(18000),
  });
  const result = await response.json();
  if (!response.ok || !result.status)
    reject(
      409,
      "The test payment could not be opened or verified. Check payment status before retrying.",
    );
  return result.data;
}
export async function verify(reference) {
  id(reference);
  const [o] = await db(
    "formex_orders?select=amount,method&reference=eq." + reference,
  );
  if (o?.method !== "paystack") reject(404, "Payment not found.");
  const [payment] = await db(
    "formex_payments?select=attempt&reference=eq." + reference,
  );
  if (!payment?.attempt) return "pending";
  const tx = await provider("verify/" + id(payment.attempt));
  if (tx.status !== "success") return "pending";
  if (
    tx.reference !== payment.attempt ||
    tx.currency !== "NGN" ||
    tx.domain !== "test" ||
    tx.amount !== o.amount * 100 ||
    !tx.id
  )
    reject(409, "Payment details differ from this order.");
  await db("rpc/formex_confirm", {
    method: "POST",
    body: { ref: reference, kobo: tx.amount, tx: String(tx.id) },
  });
  return "paid";
}
