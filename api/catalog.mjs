import { storefrontItems } from "../commerce/storefront-data.mjs";
import { categoryPages } from "../commerce/catalog.mjs";
import {
  catalogue,
  db,
  endpoint,
  paymentOptions,
  reject,
} from "../server/formex.mjs";
export default endpoint(async (req, res) => {
  if (req.method !== "GET") reject(405, "GET required.");
  const [products, [settings]] = await Promise.all([
    catalogue(),
    db("formex_settings?select=delivery_fee,pickup_instructions"),
  ]);
  res.setHeader(
    "Cache-Control",
    "public, max-age=0, s-maxage=30, stale-while-revalidate=30",
  );
  if (req.query.view === "store") return res.json(storefrontItems(products));
  if (req.query.view === "search")
    return res.json([
      ...products.map((p) => ({
        type: "product",
        label: p.model,
        brand: p.brand,
        storage: p.variants.map((v) => v.storage),
        price:
          Math.min(...p.variants.map((v) => v.price).filter(Boolean)) || null,
        keywords: [p.model, p.brand],
        image: p.images[0],
        route: p.route,
      })),
      ...categoryPages.map((c) => ({
        type: "category",
        label: c.h1,
        brand: "Formex Communication",
        storage: [],
        keywords: [c.title],
        route: c.route,
      })),
    ]);
  res.json({ products, settings, methods: paymentOptions() });
});
