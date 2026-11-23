import { products } from "../commerce/catalog.mjs";
import { offerProduct, promotion } from "../commerce/offers.mjs";
const literal = (value) =>
  value == null ? "NULL" : "'" + String(value).replaceAll("'", "''") + "'";
const insert = (table, columns, values) =>
  console.log(
    "insert into public.formex_" +
      table +
      " (" +
      columns +
      ") values (" +
      values.map(literal).join(",") +
      ") on conflict do nothing;",
  );
console.log("begin;");
for (const source of products) {
  const { variants, images, ...details } = offerProduct(source);
  insert("products", "slug,details,hot", [
    source.slug,
    JSON.stringify(details),
    promotion.models.includes(source.slug),
  ]);
  for (const [position, { storage, price, ...variant }] of variants.entries())
    insert("variants", "slug,storage,price,details", [
      source.slug,
      storage,
      price || null,
      JSON.stringify({ ...variant, position }),
    ]);
  images.forEach((url, i) =>
    insert("images", "slug,position,url", [source.slug, i, url]),
  );
}
console.log("commit;");
