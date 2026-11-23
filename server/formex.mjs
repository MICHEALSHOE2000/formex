// Formex-specific settings intentionally have no fallback to another site's environment.
export function project() {
  const ref = process.env.FORMEX_PROJECT_REF;
  if (
    !/^[a-z]{20}$/.test(ref || "") ||
    ["nrpqiudmdxcabjqalwia", "qmpcfxwqcfxnauymarzu"].includes(ref)
  )
    throw Error("A dedicated Formex project is required");
  return "https://" + ref + ".supabase.co";
}
export function reject(status, message) {
  throw Object.assign(new Error(message), { status });
}
export function field(value, max = 160) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    /[<>\x00-\x1f]/.test(value)
  )
    reject(400, "Check the highlighted details and try again.");
  return value.trim();
}
export function id(value) {
  if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value || ""))
    reject(400, "Invalid reference.");
  return value;
}
export function slug(value) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(field(value, 90)))
    reject(400, "Invalid product slug.");
  return value;
}
export async function request(
  path,
  { method = "GET", body, headers = {}, raw = false } = {},
) {
  const key = process.env.FORMEX_SERVICE_ROLE_KEY;
  if (!key) throw Error("Missing Formex credentials");
  const r = await fetch(project() + path, {
    method,
    headers: {
      apikey: key,
      Authorization: "Bearer " + key,
      ...(!raw && { "Content-Type": "application/json" }),
      ...headers,
    },
    body: raw ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) {
    if (r.status === 409 || r.status === 400)
      reject(
        409,
        "Details changed or conflict with an existing record. Refresh and check again.",
      );
    throw Error("Database request failed");
  }
  const value = await r.text();
  return value ? JSON.parse(value) : null;
}
export const db = (path, opts) => request("/rest/v1/" + path, opts);
export function endpoint(handler) {
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      if (req.method === "POST") {
        const origins = [process.env.FORMEX_ORIGIN];
        if (process.env.VERCEL_ENV === "preview")
          origins.push(
            ...[process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]
              .filter(Boolean)
              .map((h) => "https://" + h),
          );
        if (!req.headers.origin || !origins.includes(req.headers.origin))
          reject(403, "Invalid origin.");
        if (!req.headers["content-type"]?.startsWith("application/json"))
          reject(415, "JSON required.");
      }
      await handler(req, res);
    } catch (e) {
      res
        .status(e.status || 503)
        .json({
          error: e.status ? e.message : "Service temporarily unavailable.",
        });
    }
  };
}
export async function admin(req) {
  const token = req.headers.authorization;
  if (!/^Bearer \S+$/.test(token || "")) reject(401, "Sign in first.");
  const r = await fetch(project() + "/auth/v1/user", {
    headers: {
      apikey: process.env.FORMEX_PUBLISHABLE_KEY,
      Authorization: token,
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) reject(401, "Sign in again.");
  const user = await r.json();
  if (
    user.is_anonymous ||
    !user.email_confirmed_at ||
    !(await db("formex_admins?select=user_id&user_id=eq." + id(user.id))).length
  )
    reject(403, "Staff access required.");
  return user.id;
}
export async function catalogue() {
  const rows = [];
  for (let offset = 0; ; offset += 100) {
    const page = await db(
      "formex_products?select=slug,details,featured,hot,formex_variants(storage,price,details,available),formex_images(position,url)&archived=eq.false&order=slug&limit=100&offset=" +
        offset,
    );
    rows.push(...page);
    if (page.length < 100) break;
  }
  return rows.map((p) => {
    const variants = p.formex_variants
      .sort((a, b) => (a.details.position ?? 0) - (b.details.position ?? 0))
      .map((v) => ({
        ...v.details,
        storage: v.storage,
        price: v.price,
        available: v.available,
        offerId: p.hot ? "formex-hot-deals" : null,
        cataloguePrice: true,
      }));
    return {
      ...p.details,
      slug: p.slug,
      route: "/" + p.slug,
      hot: p.hot,
      featured: p.featured,
      variants,
      images: p.formex_images
        .sort((a, b) => a.position - b.position)
        .map((i) => i.url),
    };
  });
}
export function paymentOptions() {
  const e = process.env;
  return {
    paystack: (e.FORMEX_PAYSTACK_SECRET || "").startsWith("sk_test_"),
    transfer: Boolean(
      e.FORMEX_BANK_NAME &&
      e.FORMEX_ACCOUNT_NAME &&
      /^\d{10}$/.test(e.FORMEX_ACCOUNT_NUMBER || ""),
    ),
  };
}
export async function limit(req, scope, cap) {
  const { createHmac } = await import("node:crypto");
  const address =
    process.env.VERCEL === "1"
      ? req.headers["x-vercel-forwarded-for"] || req.headers["x-forwarded-for"]
      : req.socket?.remoteAddress;
  const k = createHmac("sha256", process.env.FORMEX_SERVICE_ROLE_KEY)
    .update(scope + ":" + String(address || "unknown").split(",")[0])
    .digest("hex");
  if (!(await db("rpc/formex_limit", { method: "POST", body: { k, cap } })))
    reject(429, "Please try again later.");
}
