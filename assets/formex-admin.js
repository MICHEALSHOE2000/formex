const $ = (id) => document.getElementById(id),
  note = (t) => {
    $("notice").textContent = t;
  };
let token = "",
  state,
  page = 0;
const current = () =>
  state.products.find((p) => p.slug === $("selection").value);
const fill = (select, options) =>
  select.replaceChildren(
    ...options.map(([key, name]) => new Option(name, key)),
  );
async function call(body) {
  const response = await fetch("/api/admin?page=" + page, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + token,
      ...(body && { "Content-Type": "application/json" }),
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error);
  return data;
}
function variant() {
  const row = current()?.formex_variants.find(
      (v) => v.storage === $("variantSelect").value,
    ),
    f = $("variant").elements;
  fill(f.condition, [
    ["", "All recorded model conditions"],
    ...(current()?.details.conditions || []).map((c) => [c, c]),
  ]);
  f.condition.value = row?.details.condition || "";
  f.storage.value = row?.storage || "";
  f.price.value = row?.price ?? "";
  f.regular.value = row?.details.regularPrice ?? "";
  f.available.checked = !!row?.available;
}
function select() {
  const row = current(),
    f = $("product").elements;
  f.slug.value = row?.slug || "";
  f.slug.readOnly = !!row;
  f.model.value = row?.details.model || "";
  f.brand.value = row?.details.brand || "Apple";
  f.conditions.value = row?.details.conditions.join(", ") || "";
  for (const flag of ["featured", "archived", "hot"])
    f[flag].checked = !!row?.[flag];
  $("editor").hidden = !row;
  fill($("variantSelect"), [
    ["", "Add variant"],
    ...(row?.formex_variants || []).map((v) => [v.storage, v.storage]),
  ]);
  variant();
}
function entry(parent, text, actions) {
  const box = document.createElement("article"),
    p = document.createElement("p");
  p.textContent = text;
  box.append(p);
  for (const [name, body] of actions) {
    const btn = document.createElement("button");
    btn.textContent = name;
    btn.onclick = () => save(body);
    box.append(btn, document.createTextNode(" "));
  }
  parent.append(box);
}
async function refresh(prefer) {
  state = await call();
  $("desk").hidden = false;
  $("login").hidden = true;
  fill($("selection"), [
    ["", "Add product"],
    ...state.products.map((p) => [
      p.slug,
      p.details.model + (p.archived ? " (archived)" : ""),
    ]),
  ]);
  $("selection").value = prefer || "";
  select();
  $("orders").replaceChildren();
  $("enquiries").replaceChildren();
  for (const o of state.orders) {
    const paid = !!o.formex_payments?.paid_at,
      c = o.formex_customers;
    const actions = [];
    if (!paid && o.method !== "paystack" && o.status !== "cancelled")
      actions.push(["Confirm money received", "confirm"]);
    const next = {
      received: "preparing",
      preparing: "ready",
      ready: "completed",
    }[o.status];
    if (next && (paid || (o.fulfilment === "pickup" && next !== "completed")))
      actions.push([next, next]);
    if (o.status === "received" && !paid && o.method !== "paystack")
      actions.push(["Cancel", "cancelled"]);
    entry(
      $("orders"),
      [
        o.reference,
        o.model,
        o.storage,
        o.condition,
        o.color,
        "₦" + o.amount,
        o.method,
        paid ? "Paid" : "Unpaid",
        o.status,
        o.fulfilment,
        o.address,
        c.name,
        c.email,
        c.phone,
      ]
        .filter(Boolean)
        .join(" · "),
      actions.map(([t, status]) => [
        t,
        { action: "order", reference: o.reference, status },
      ]),
    );
  }
  for (const e of state.enquiries)
    entry(
      $("enquiries"),
      e.contact + " · " + e.message + (e.resolved ? " · Resolved" : ""),
      e.resolved ? [] : [["Mark resolved", { action: "resolve", id: e.id }]],
    );
  $("prev").disabled = page === 0;
  $("next").disabled =
    Math.max(
      state.products.length,
      state.orders.length,
      state.enquiries.length,
    ) < 100;
  $("settings").elements.fee.value = state.settings.delivery_fee ?? "";
  $("settings").elements.pickup.value =
    state.settings.pickup_instructions || "";
}
async function save(body) {
  try {
    await call(body);
    await refresh(body.slug || $("selection").value);
    note("Saved.");
  } catch (e) {
    note(e.message);
  }
}
$("login").onsubmit = async (e) => {
  e.preventDefault();
  try {
    const cfg = await (await fetch("/api/admin?login=1")).json();
    const r = await fetch(cfg.url + "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: { apikey: cfg.key, "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(e.target))),
    });
    if (!r.ok) throw Error("Sign-in failed.");
    token = (await r.json()).access_token;
    e.target.reset();
    await refresh();
    note("");
  } catch (err) {
    note(err.message);
  }
};
$("logout").onclick = () => location.reload();
$("selection").onchange = select;
$("variantSelect").onchange = variant;
for (const [id, delta] of [
  ["prev", -1],
  ["next", 1],
])
  $(id).onclick = async () => {
    page += delta;
    try {
      await refresh();
    } catch (e) {
      page -= delta;
      note(e.message);
    }
  };
for (const action of ["product", "variant", "settings", "image"])
  $(action).onsubmit = async (e) => {
    e.preventDefault();
    const f = e.currentTarget.elements,
      b = { ...Object.fromEntries(new FormData(e.currentTarget)), action };
    if (action === "product") {
      b.conditions = b.conditions
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      for (const k of ["archived", "featured", "hot"]) b[k] = f[k].checked;
    }
    if (action === "variant") {
      b.slug = current().slug;
      b.price = b.price ? Number(b.price) : null;
      b.regular = b.regular ? Number(b.regular) : null;
      b.available = f.available.checked;
    }
    if (action === "settings") b.fee = b.fee === "" ? null : Number(b.fee);
    if (action === "image") {
      if (b.photo.size > 2097152) {
        note("Choose an image under 2 MB.");
        return;
      }
      const reader = new FileReader();
      reader.onload = () =>
        save({
          action,
          slug: current().slug,
          data: reader.result.split(",")[1],
        });
      reader.readAsDataURL(b.photo);
      return;
    }
    await save(b);
  };
