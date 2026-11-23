import { readdir, cp, mkdir, rm } from "node:fs/promises";
import { categoryPages } from "../commerce/catalog.mjs";
import { existsSync } from "node:fs";
await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
for (const name of await readdir(".")) {
  if (name === "dist") continue;
  // Runtime pages own these routes, including archived slugs left in the source checkout.
  if (
    process.env.FORMEX_PROJECT_REF &&
    (/^(iphone-(?:[0-9]|x|se-)|samsung-(?:s[0-9]|z-fold)|google-pixel-[0-9]|formex-device-)/.test(
      name,
    ) ||
      categoryPages.some(
        (c) => c.route === "/" + name && name !== "phone-swap",
      ))
  )
    continue;
  if (
    [
      "assets",
      "images",
      "commerce",
      "index.html",
      "robots.txt",
      "sitemap.xml",
      "favicon.svg",
      "style.css",
      "script.js",
      "scrripts.js",
      "blog",
    ].includes(name) ||
    existsSync(name + "/index.html")
  )
    await cp(name, "dist/" + name, { recursive: true });
}
