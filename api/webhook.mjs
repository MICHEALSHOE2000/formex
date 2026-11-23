import { createHmac, timingSafeEqual } from "node:crypto";
import { db, id } from "../server/formex.mjs";
import { verify } from "../server/payment.mjs";
export const config = { api: { bodyParser: false } };
export default async function webhook(req, res) {
  const key = process.env.FORMEX_PAYSTACK_SECRET;
  if (req.method !== "POST" || !key?.startsWith("sk_test_"))
    return res.status(403).end();
  try {
    let size = 0;
    const chunks = [];
    for await (const part of req) {
      size += part.length;
      if (size > 131072) return res.status(413).end();
      chunks.push(Buffer.from(part));
    }
    const raw = Buffer.concat(chunks),
      sig = req.headers["x-paystack-signature"];
    if (
      !/^[a-f0-9]{128}$/.test(sig || "") ||
      !timingSafeEqual(
        Buffer.from(sig, "hex"),
        createHmac("sha512", key).update(raw).digest(),
      )
    )
      return res.status(401).end();
    const event = JSON.parse(raw);
    if (event.event === "charge.success") {
      const [payment] = await db(
        "formex_payments?select=reference&attempt=eq." +
          id(event.data.reference),
      );
      if (payment) await verify(payment.reference);
    }
    res.status(200).end();
  } catch {
    res.status(503).end();
  }
}
