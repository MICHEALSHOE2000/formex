import { limit, db, endpoint, field, reject } from "../server/formex.mjs";
export default endpoint(async (req, res) => {
  if (req.method !== "POST") reject(405, "POST required.");
  const contact = field(req.body?.contact, 254),
    message = field(req.body?.message, 1000);
  await limit(req, "enquiry", 10);
  await db("formex_enquiries", { method: "POST", body: { contact, message } });
  res.status(201).json({ received: true });
});
