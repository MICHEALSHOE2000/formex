import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { gzipSync } from "node:zlib";
import { catalogue } from "../server/formex.mjs";
import { renderProductPage } from "../commerce/page-render.mjs";
import { storefrontItems } from "../commerce/storefront-data.mjs";
import { products } from "../commerce/catalog.mjs";
import { offerProduct } from "../commerce/offers.mjs";

test("Formex schema, repeat import, role isolation and checkout lifecycle", async (t) => {
  const db = new PGlite();
  try {
    await db.exec(
      "create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create schema storage; create table storage.buckets(id text,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
    );
    const files = (await readdir("supabase/migrations")).sort();
    for (const file of files)
      await db.exec(await readFile("supabase/migrations/" + file, "utf8"));
    await db.exec(
      await readFile(
        "supabase/migrations/" + files.find((f) => f.includes("_seed")),
        "utf8",
      ),
    );
    const q = async (sql, params = []) => (await db.query(sql, params)).rows;
    const stored = await q(
      `select p.*,coalesce((select json_agg(v) from formex_variants v where v.slug=p.slug),'[]') formex_variants,coalesce((select json_agg(i) from formex_images i where i.slug=p.slug),'[]') formex_images from formex_products p order by slug`,
    );
    process.env.FORMEX_PROJECT_REF = "aaaaaaaaaaaaaaaaaaaa";
    process.env.FORMEX_SERVICE_ROLE_KEY = "fixture";
    t.mock.method(globalThis, "fetch", async () => Response.json(stored));
    const live = await catalogue(),
      cards = storefrontItems(live);
    assert.equal(cards.length, 71);
    for (const model of live) {
      const html = renderProductPage(model, live);
      assert.ok(
        html.includes("data-checkout") &&
          html.includes("application/ld+json") &&
          html.includes("https://www.formexcommunication.com.ng/" + model.slug),
      );
    }
    assert.equal(
      cards.find((p) => p.slug === "iphone-11").variants[0].price,
      202860,
    );
    t.diagnostic(
      "Compressed store grid JSON: " +
        gzipSync(JSON.stringify(cards)).length +
        " bytes; full catalogue: " +
        gzipSync(JSON.stringify(live)).length +
        " bytes.",
    );
    const rows = await q(
      "select slug,storage,price,available from formex_variants",
    );
    const indexed = new Map(rows.map((r) => [r.slug + "|" + r.storage, r]));
    assert.equal(rows.length, products.flatMap((p) => p.variants).length);
    for (const p of products.map(offerProduct))
      for (const v of p.variants) {
        const r = indexed.get(p.slug + "|" + v.storage);
        assert.equal(r.price, v.price || null);
        assert.equal(r.available, false);
      }
    assert.equal(
      (await q("select count(*) n from formex_images"))[0].n,
      products.flatMap((p) => p.images).length,
    );
    const rules = await q(
      "select relrowsecurity from pg_class where relname like 'formex_%' and relkind='r'",
    );
    assert.ok(rules.length >= 9 && rules.every((r) => r.relrowsecurity));
    for (const role of ["anon", "authenticated"]) {
      await db.exec("set role " + role);
      await assert.rejects(
        q("select * from formex_orders"),
        /permission denied/,
      );
      await assert.rejects(
        q("select formex_checkout('{}')"),
        /permission denied/,
      );
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    const p = {
      reference: randomUUID(),
      slug: "iphone-11",
      storage: "64GB",
      condition: "UK Used",
      method: "pickup",
      fulfilment: "pickup",
      expected: 202860,
      name: "Test Buyer",
      email: "buyer@example.test",
      phone: "08000000000",
      address: "",
    };
    const checkout = (body) =>
      q("select * from formex_checkout($1)", [JSON.stringify(body)]);
    await assert.rejects(checkout(p));
    await q(
      "update formex_variants set available=true where slug=$1 and storage=$2",
      [p.slug, p.storage],
    );
    await assert.rejects(checkout({ ...p, expected: 1 }));
    await assert.rejects(checkout({ ...p, condition: "unknown" }));
    const [order] = await checkout(p);
    assert.equal(order.amount, 202860);
    await checkout(p);
    assert.equal((await q("select count(*) n from formex_customers"))[0].n, 1);
    await assert.rejects(checkout({ ...p, name: "Different" }));
    const delivery = {
      ...p,
      reference: randomUUID(),
      fulfilment: "delivery",
      address: "Test delivery address",
      method: "transfer",
    };
    await assert.rejects(checkout(delivery));
    await q("update formex_settings set delivery_fee=5000");
    delivery.expected += 5000;
    await checkout(delivery);
    await assert.rejects(
      checkout({ ...delivery, reference: randomUUID(), method: "pickup" }),
    );
    const staff = async (ref, status) =>
      q("select formex_staff_order($1,$2,null)", [ref, status]);
    await assert.rejects(staff(delivery.reference, "preparing"));
    await staff(delivery.reference, "confirm");
    await staff(delivery.reference, "preparing");
    await staff(delivery.reference, "ready");
    await staff(delivery.reference, "completed");
    const online = { ...p, method: "paystack", reference: randomUUID() };
    await checkout(online);
    const init = async () =>
      (await q("select formex_start_payment($1) result", [online.reference]))[0]
        .result;
    assert.ok((await init()).attempt);
    assert.equal((await init()).status, "initializing");
    await q(
      "update formex_payments set checkout_url='https://checkout.paystack.com/fixture' where reference=$1",
      [online.reference],
    );
    assert.ok((await init()).url);
    const confirm = (kobo, tx) =>
      q("select formex_confirm($1,$2,$3)", [online.reference, kobo, tx]);
    await assert.rejects(confirm(1, "fake"));
    await assert.rejects(staff(online.reference, "confirm"));
    await confirm(online.expected * 100, "fixture");
    await confirm(online.expected * 100, "fixture");
    await assert.rejects(confirm(online.expected * 100, "different"));
    const edit = (body) => q("select formex_edit($1)", [JSON.stringify(body)]);
    await edit({
      action: "variant",
      slug: p.slug,
      storage: p.storage,
      price: 210000,
      regular: 240000,
      available: true,
    });
    await assert.rejects(checkout({ ...p, reference: randomUUID() }));
    await edit({
      action: "product",
      slug: p.slug,
      details: { model: "iPhone 11", conditions: ["UK Used"], brand: "Apple" },
      archived: true,
      featured: false,
      hot: false,
    });
    await assert.rejects(
      checkout({ ...p, expected: 210000, reference: randomUUID() }),
    );
  } finally {
    await db.close();
  }
});
