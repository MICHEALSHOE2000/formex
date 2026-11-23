import {
  admin,
  db,
  endpoint,
  field,
  id,
  project,
  reject,
  request,
  slug,
} from "../server/formex.mjs";
import { randomUUID } from "node:crypto";
function label(value) {
  const v = field(value);
  if (!/^[\p{L}\p{N} +.,()·/:—–_-]+$/u.test(v))
    reject(400, "Use plain text for product labels.");
  return v;
}
function amount(v) {
  if (v === null) return null;
  if (!Number.isSafeInteger(v) || v < 1 || v > 9000000000)
    reject(400, "Enter a positive whole-naira price.");
  return v;
}
export default endpoint(async (req, res) => {
  if (req.method === "GET" && req.query.login === "1")
    return res.json({
      url: project(),
      key: process.env.FORMEX_PUBLISHABLE_KEY,
    });
  const staff = await admin(req);
  if (req.method === "GET") {
    const page = Number(req.query.page || 0);
    if (!Number.isSafeInteger(page) || page < 0) reject(400, "Invalid page.");
    const paging = "&limit=100&offset=" + page * 100;
    const [products, orders, enquiries, [settings]] = await Promise.all([
      db(
        "formex_products?select=slug,details,archived,featured,hot,formex_variants(storage,price,available,details)&order=slug" +
          paging,
      ),
      db(
        "formex_orders?select=*,formex_customers(name,email,phone),formex_payments(paid_at)&order=created_at.desc,reference" +
          paging,
      ),
      db("formex_enquiries?select=*&order=created_at.desc,id" + paging),
      db("formex_settings?select=*"),
    ]);
    return res.json({ products, orders, enquiries, settings });
  }
  if (req.method !== "POST") reject(405, "POST required.");
  const b = req.body || {};
  let p;
  if (b.action === "product") {
    const k = slug(b.slug),
      model = label(b.model),
      brand = label(b.brand),
      conditions = b.conditions?.map(label);
    if (!conditions?.length || conditions.length > 12)
      reject(400, "Supply at least one condition.");
    if (
      !k.startsWith("formex-device-") &&
      !(await db("formex_products?select=slug&slug=eq." + k)).length
    )
      reject(
        400,
        "Start new slugs with formex-device- to protect existing URLs.",
      );
    p = {
      action: "product",
      slug: k,
      archived: b.archived === true,
      featured: b.featured === true,
      hot: b.hot === true,
      details: {
        slug: k,
        model,
        brand,
        family: brand,
        conditions,
        colors: [],
        defaultStorage: "",
        route: "/" + k,
        specificationsPending: true,
        specifications: {},
        description: model + " at Formex Communication.",
        seoTitle: model + " | Formex Communication",
        metaDescription: model + " at Formex Communication in Ikeja.",
        stockStatus: "Confirm availability",
      },
    };
  } else if (b.action === "variant") {
    const price = amount(b.price),
      regular = amount(b.regular);
    if (regular !== null && (!price || regular <= price))
      reject(400, "Regular price must exceed the selling price.");
    p = {
      action: "variant",
      slug: slug(b.slug),
      storage: label(b.storage),
      condition: b.condition ? label(b.condition) : null,
      price,
      regular,
      available: b.available === true,
    };
  } else if (b.action === "image") {
    const k = slug(b.slug);
    if (typeof b.data !== "string" || b.data.length > 2800000)
      reject(400, "Choose an image under 2 MB.");
    const bytes = Buffer.from(b.data, "base64");
    const type = bytes.subarray(0, 3).equals(Buffer.from("ffd8ff", "hex"))
      ? "jpeg"
      : bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))
        ? "png"
        : bytes.toString("ascii", 0, 4) === "RIFF" &&
            bytes.toString("ascii", 8, 12) === "WEBP"
          ? "webp"
          : null;
    if (!type || bytes.length > 2097152)
      reject(400, "Choose a JPEG, PNG or WebP under 2 MB.");
    const path = "formex-products/" + k + "/" + randomUUID() + "." + type;
    await request("/storage/v1/object/" + path, {
      method: "POST",
      raw: true,
      headers: { "Content-Type": "image/" + type },
      body: bytes,
    });
    p = {
      action: "image",
      slug: k,
      url: project() + "/storage/v1/object/public/" + path,
    };
  } else if (b.action === "order") {
    await db("rpc/formex_staff_order", {
      method: "POST",
      body: { ref: id(b.reference), action: field(b.status, 20), staff },
    });
  } else if (b.action === "resolve") {
    await db("formex_enquiries?id=eq." + id(b.id), {
      method: "PATCH",
      body: { resolved: true },
    });
  } else if (b.action === "settings") {
    if (
      b.fee !== null &&
      (!Number.isSafeInteger(b.fee) || b.fee < 0 || b.fee > 10000000)
    )
      reject(400, "Invalid delivery fee.");
    await db("formex_settings?id=eq.true", {
      method: "PATCH",
      body: {
        delivery_fee: b.fee,
        pickup_instructions: b.pickup ? field(b.pickup, 400) : null,
      },
    });
  } else reject(400, "Unknown action.");
  if (p) await db("rpc/formex_edit", { method: "POST", body: { p } });
  res.json({ saved: true });
});
