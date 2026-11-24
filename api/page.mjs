import { catalogue, endpoint, reject, slug } from "../server/formex.mjs";
import { products, categoryPages } from "../commerce/catalog.mjs";
import { offerProduct } from "../commerce/offers.mjs";
import { newestFirst } from "../commerce/catalog-order.mjs";
import {
  renderProductPage,
  renderCategoryPage,
} from "../commerce/page-render.mjs";
export default endpoint(async (req, res) => {
  if (req.method !== "GET") reject(405, "GET required.");
  const k = slug(req.query.slug);
  const rows = process.env.FORMEX_PROJECT_REF
    ? (await catalogue()).sort(newestFirst)
    : products.map(offerProduct);
  const product = rows.find((p) => p.slug === k),
    category = categoryPages.find((c) => c.route === "/" + k);
  if (!product && !category)
    return res.status(404).send("Device unavailable. Visit the Formex shop.");
  res.setHeader(
    "Cache-Control",
    "public, max-age=0, s-maxage=30, stale-while-revalidate=30",
  );
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(
    product
      ? renderProductPage(product, rows, req.query.storage)
      : renderCategoryPage(category, rows),
  );
});
