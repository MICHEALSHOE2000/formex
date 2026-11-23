import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { landingPages } from "../landing-pages/config.mjs";
import {media} from '../assets/storefront-ui.mjs';
import {shopCategories} from '../commerce/storefront-data.mjs';
import {
  accessories,
  categoryPages,
  commerceSite,
  products as baseProducts
} from "../commerce/catalog.mjs";

import {offerProduct,isComplete} from '../commerce/offers.mjs';
const products=baseProducts.map(offerProduct);
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

import {renderProductPage,renderCategoryPage,cleanGeneratedOutput,minimumKnownPrice} from '../commerce/page-render.mjs';
for (const product of products) {
  const outputPath = join(root, product.slug, "index.html");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${cleanGeneratedOutput(renderProductPage(product,products))}\n`, "utf8");
}

for (const category of categoryPages) {
  const outputPath = join(root, category.route.slice(1), "index.html");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${cleanGeneratedOutput(renderCategoryPage(category,products))}\n`, "utf8");
}

const searchIndex = [
  ...products.slice().sort((a,b)=>Number(isComplete(b))-Number(isComplete(a))).map((product) => ({
    type: "product",
    label: product.model,
    route: product.route,
    brand: product.brand,
    storage: product.variants.map((variant) => variant.storage),
    price: Number.isFinite(minimumKnownPrice(product)) ? minimumKnownPrice(product) : null,
    image: product.images[0] || null,
    keywords: [
      product.model,
      product.brand,
      product.family,
      ...product.variants.map((variant) => `${product.model} ${variant.storage}`),
      ...product.variants.map((variant) => variant.storage),
      "price in Nigeria",
      "Easy Buy",
      "swap"
    ]
  })),
  ...categoryPages.map((category) => ({
    type: "category",
    label: category.h1,
    route: category.route,
    brand: category.brand || "Formex Communication",
    storage: [],
    price: null,
    image: null,
    keywords: [category.h1, category.title, category.eyebrow]
  }))
];

await writeFile(
  join(root, "assets", "catalog-search.json"),
  `${JSON.stringify(searchIndex, null, 2)}\n`,
  "utf8"
);

await writeFile(
  join(root, "commerce", "route-manifest.json"),
  `${JSON.stringify({
    products: products.map((product) => product.route),
    categories: [...categoryPages, ...shopCategories].map((category) => category.route)
  }, null, 2)}\n`,
  "utf8"
);

const fixedRoutes = [
  "/easybuy/",
  "/swap/",
  "/buy/",
  "/deals/",
  "/",
  "/easy-buy/",
  "/blog/best-uk-used-iphone-shop",
  "/blog/where-to-buy-original-samsung-phones",
  "/blog/best-phone-under-250000",
  "/blog/iphone-battery-health-guide",
  "/blog/pixel-vs-samsung-camera"
];
const sitemapRoutes = [
  ...new Set([
    ...fixedRoutes,
    ...landingPages.map((page) => page.route),
    ...products.map((product) => product.route),
    ...categoryPages.map((category) => category.route),
    ...shopCategories.map((category) => category.route)
  ])
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapRoutes.map((route) => `  <url><loc>${commerceSite.baseUrl}${route}</loc></url>`).join("\n")}
</urlset>
`;
await writeFile(join(root, "sitemap.xml"), sitemap, "utf8");

console.log(`Generated ${products.length} product pages and ${categoryPages.length} commerce category pages.`);
