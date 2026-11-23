const $ = (id) => document.getElementById(id),
  form = $("order"),
  fields = form.elements;
const message = (text) => {
  $("notice").textContent = text;
};
const query = new URLSearchParams(location.search);
async function api(path, body) {
  const r = await fetch(
    "/api/" + path,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {},
  );
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "Request failed.");
  return data;
}
const options = (select, rows, prefer) => {
  select.replaceChildren(...rows.map(([v, t]) => new Option(t, v)));
  if (rows.some(([v]) => v === prefer)) select.value = prefer;
};
async function start() {
  if (query.has("order") || query.has("reference")) {
    const reference = query.get("order") || query.get("reference");
    const result = await api(
      "checkout?reference=" + encodeURIComponent(reference),
    );
    message("Payment " + result.status + " · " + reference);
    return;
  }
  const { products, settings, methods } = await api("catalog");
  const list = products.filter(
    (p) =>
      p.conditions.length && p.variants.some((v) => v.available && v.price > 0),
  );
  if (!list.length) {
    message("Contact Formex to confirm a device for pickup or payment.");
    return;
  }
  const wanted = query.get("slug");
  options(
    fields.slug,
    list.map((p) => [p.slug, p.model]),
    wanted,
  );
  if (
    wanted &&
    !list.some(
      (p) =>
        p.slug === wanted &&
        (!query.get("storage") ||
          p.variants.some(
            (v) =>
              v.storage === query.get("storage") && v.available && v.price > 0,
          )),
    )
  ) {
    message("This device needs confirmation. Send Formex an enquiry below.");
    $("ask").open = true;
    return;
  }
  const product = () => list.find((p) => p.slug === fields.slug.value);
  function variants() {
    const p = product();
    options(
      fields.storage,
      p.variants
        .filter((v) => v.available && v.price > 0)
        .map((v) => [v.storage, v.storage]),
      query.get("storage"),
    );
    selection();
  }
  function selection() {
    const p = product(),
      v = p.variants.find((v) => v.storage === fields.storage.value);
    options(
      fields.condition,
      (v.condition ? [v.condition] : p.conditions).map((c) => [c, c]),
      query.get("condition"),
    );
    const colors = v.color
      ? v.color.split("/").map((c) => c.trim())
      : p.colors || [];
    options(
      fields.color,
      [["", "Confirm with Formex"], ...colors.map((c) => [c, c])],
      query.get("color"),
    );
  }
  function methodsList() {
    const delivery = fields.fulfilment.value === "delivery";
    options(
      fields.method,
      [
        ...(!delivery ? [["pickup", "Reserve and pay at pickup"]] : []),
        ...(methods.transfer ? [["transfer", "Direct bank transfer"]] : []),
        ...(methods.paystack ? [["paystack", "Paystack (test payment)"]] : []),
      ],
      fields.method.value,
    );
    $("address").hidden = !delivery;
    fields.address.required = delivery;
    $("pickup").textContent = delivery
      ? ""
      : settings.pickup_instructions || "Store pickup at Formex Communication.";
  }
  function total() {
    return (
      product().variants.find((v) => v.storage === fields.storage.value).price +
      (fields.fulfilment.value === "delivery" ? settings.delivery_fee : 0)
    );
  }
  function showTotal() {
    const delivery = fields.fulfilment.value === "delivery";
    $("total").textContent =
      (delivery
        ? "Delivery ₦" + settings.delivery_fee.toLocaleString() + " · "
        : "") +
      "Total ₦" +
      total().toLocaleString();
  }
  options(fields.fulfilment, [
    ["pickup", "Store pickup"],
    ...(settings.delivery_fee !== null && (methods.transfer || methods.paystack)
      ? [["delivery", "Delivery"]]
      : []),
  ]);
  variants();
  methodsList();
  showTotal();
  form.hidden = false;
  fields.slug.onchange = () => {
    variants();
    showTotal();
  };
  fields.storage.onchange = () => {
    selection();
    showTotal();
  };
  fields.fulfilment.onchange = () => {
    methodsList();
    showTotal();
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    const btn = form.querySelector("button");
    btn.disabled = true;
    try {
      const payload = {
        ...Object.fromEntries(new FormData(form)),
        expected: total(),
      };
      const hash = Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(JSON.stringify(payload)),
          ),
        ),
      ).join(".");
      const key = "formex-order-" + hash;
      const reference = sessionStorage.getItem(key) || crypto.randomUUID();
      sessionStorage.setItem(key, reference);
      const order = await api("checkout", { ...payload, reference });
      if (order.url) {
        location.assign(order.url);
        return;
      }
      form.hidden = true;
      message(
        [order.status, "Reference " + reference, ...(order.bank || [])].join(
          "\n",
        ),
      );
      sessionStorage.removeItem(key);
    } catch (e) {
      message(e.message);
    } finally {
      btn.disabled = false;
    }
  };
}
$("enquiry").onsubmit = async (e) => {
  e.preventDefault();
  const f = e.currentTarget;
  try {
    await api("enquiry", Object.fromEntries(new FormData(f)));
    message("Your enquiry was received.");
    f.reset();
  } catch (err) {
    message(err.message);
  }
};
start().catch(() =>
  message("Checkout is unavailable. Please contact Formex through the shop."),
);
