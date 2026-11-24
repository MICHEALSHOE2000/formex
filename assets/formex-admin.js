const $ = (id) => document.getElementById(id);
const panels = [...document.querySelectorAll("[data-panel]")];
const tabs = [...document.querySelectorAll("[data-section]")];
const money = new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 });
let token = "";
let state;
let page = 0;
let section = "overview";
let selectedSlug = "";
let busy = false;

function element(tag, text = "", className = "") {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

function icon(name) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  const use = document.createElementNS(ns, "use");
  use.setAttribute("href", "#i-" + name);
  svg.setAttribute("aria-hidden", "true");
  svg.append(use);
  return svg;
}

function note(message, error = false) {
  const signedIn = !$("desk").hidden;
  const notice = $(signedIn ? "notice" : "login-notice");
  notice.textContent = message;
  if (signedIn) {
    $("toast").hidden = !message;
    $("toast").dataset.error = String(error);
  } else {
    notice.hidden = !message;
  }
}

function fill(select, options, selected = select.value) {
  select.replaceChildren(...options.map(([value, label]) => new Option(label, value)));
  if (options.some(([value]) => value === selected)) select.value = selected;
}

async function call(body, pageNumber = page) {
  const response = await fetch("/api/admin?page=" + pageNumber, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + token,
      ...(body && { "Content-Type": "application/json" }),
    },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "The request failed. Try again.");
  return data;
}

function pagination() {
  const count = {
    products: state.products.length,
    photos: state.products.length,
    deals: state.products.length,
    orders: state.orders.length,
    enquiries: state.enquiries.length,
  }[section];
  $("pagination").hidden = count === undefined || (!page && count < 100);
  $("prev").disabled = page === 0 || busy;
  $("next").disabled = count < 100 || busy;
  $("page-number").textContent = "Page " + (page + 1);
}

async function navigate(next) {
  if (!state || busy) return;
  if (page !== 0 && next !== section) {
    busy = true;
    pagination();
    try {
      state = await call(undefined, 0);
      page = 0;
      render();
    } catch (error) {
      note(error.message, true);
      return;
    } finally {
      busy = false;
      pagination();
    }
  }
  section = next;
  for (const panel of panels) panel.hidden = panel.dataset.panel !== section;
  for (const tab of tabs) {
    if (tab.dataset.section === section) {
      tab.setAttribute("aria-current", "page");
      $("current-section").textContent = tab.textContent.trim();
      if (window.matchMedia("(max-width: 760px)").matches)
        $("sections").scrollLeft = tab.offsetLeft - $("sections").offsetLeft - 6;
    } else {
      tab.removeAttribute("aria-current");
    }
  }
  pagination();
  const heading = panels.find((panel) => !panel.hidden).querySelector("h1");
  heading.tabIndex = -1;
  heading.focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function variant() {
  const product = state.products.find((p) => p.slug === selectedSlug);
  const row = product?.formex_variants.find((v) => v.storage === $("variantSelect").value);
  const fields = $("variant").elements;
  fill(fields.condition, [
    ["", "All recorded model conditions"],
    ...(product?.details.conditions || []).map((condition) => [condition, condition]),
  ], row?.details.condition || "");
  fields.storage.value = row?.storage || "";
  fields.price.value = row?.price ?? "";
  fields.regular.value = row?.details.regularPrice ?? "";
  fields.available.checked = !!row?.available;
}

function selectProduct(slug, storage) {
  const row = state.products.find((product) => product.slug === slug);
  selectedSlug = row?.slug || "";
  const fields = $("product").elements;
  $("product-heading").textContent = row ? "Edit " + row.details.model : "Add a product";
  fields.slug.value = selectedSlug;
  fields.slug.readOnly = !!row;
  fields.model.value = row?.details.model || "";
  fields.brand.value = row?.details.brand || "Apple";
  fields.conditions.value = row?.details.conditions.join(", ") || "";
  for (const flag of ["featured", "archived", "hot"])
    fields[flag].checked = !!row?.[flag];
  $("editor").hidden = !row;
  const variants = row?.formex_variants || [];
  const defaultVariant = variants.find((v) => v.storage === row.details.defaultStorage && v.price != null)
    || variants.find((v) => v.price != null)
    || variants[0];
  const selectedStorage = storage === "" || variants.some((v) => v.storage === storage)
    ? storage
    : defaultVariant?.storage ?? "";
  fill($("variantSelect"), [
    ["", "Add variant"],
    ...variants.map((v) => [v.storage, v.storage + " · " + (v.price == null ? "Price on request" : money.format(v.price))]),
  ], selectedStorage);
  variant();
  for (const button of $("product-list").querySelectorAll("button"))
    button.setAttribute("aria-pressed", String(button.dataset.slug === selectedSlug));
}

const searchText = (value) => String(value ?? "").trim().toLowerCase();
function productImages(product) {
  return [...(product?.formex_images || [])]
    .sort((a, b) => a.position - b.position)
    .map(({ url }) => url)
    .filter((url) => /^\/(?!\/)|^https:\/\/[a-z]{20}\.supabase\.co\/storage\/v1\/object\/public\/formex-products\//.test(url));
}

function image(url, description = "") {
  const photo = element("img");
  photo.src = url;
  photo.alt = description;
  photo.loading = "lazy";
  return photo;
}

function renderProducts() {
  const terms = searchText($("product-search").value).split(/\s+/);
  const products = state.products.filter((p) => {
    const haystack = searchText([p.details.model, p.details.brand, p.slug, ...p.formex_variants.map((v) => v.storage)].join(" "));
    return terms.every((term) => haystack.includes(term));
  });
  $("product-count").textContent = products.length + (products.length === 1 ? " model" : " models");
  const rows = products.map((product) => {
    const row = element("button", "", "product-row");
    row.type = "button";
    row.dataset.slug = product.slug;
    row.setAttribute("aria-pressed", String(product.slug === selectedSlug));
    const name = element("span");
    const list = product.formex_variants;
    name.append(element("strong", product.details.model), element("small", product.details.brand + " · " + list.length + (list.length === 1 ? " variant" : " variants")));
    const [url] = productImages(product);
    const thumb = element("span", "", "thumb");
    thumb.append(url ? image(url) : icon("box"));
    row.append(thumb, name);
    if (product.archived || product.hot)
      row.append(element("span", product.archived ? "Archived" : "Hot Deal", "chip waiting"));
    row.append(icon("arrow"));
    row.onclick = () => {
      selectProduct(product.slug);
      if (window.matchMedia("(max-width: 760px)").matches)
        $("product-heading").scrollIntoView({ block: "start" });
    };
    return row;
  });
  $("product-list").replaceChildren(...(rows.length ? rows : [element("p", "No matching products.", "empty")]));
}

const paid = (order) => !!order.formex_payments?.paid_at;
const fulfilmentLabels = { received: "Received", preparing: "Preparing", ready: "Ready", completed: "Completed", cancelled: "Cancelled" };
const methodLabels = { paystack: "Paystack", transfer: "Bank transfer", pickup: "Pay at pickup" };
const nextActions = { received: ["Start preparing", "preparing"], preparing: ["Mark ready", "ready"], ready: ["Mark completed", "completed"] };

function record(title, badge, waiting, details, actions = []) {
  const article = element("article", "", "record");
  const head = element("div", "", "record-head");
  head.append(element("h3", title), element("span", badge, waiting ? "chip waiting" : "chip"));
  article.append(head, element("p", details));
  if (actions.length) {
    const controls = element("div", "", "record-actions");
    for (const [label, body] of actions) {
      const button = element("button", label, "button " + (body.status === "cancelled" ? "danger" : "quiet"));
      button.type = "button";
      button.onclick = () => save(body, button);
      controls.append(button);
    }
    article.append(controls);
  }
  return article;
}

function renderOrders() {
  const filter = $("order-filter").value;
  const term = searchText($("order-search").value);
  const rows = state.orders.filter((order) => {
    const customer = order.formex_customers || {};
    const haystack = searchText([order.reference, order.model, customer.name, customer.email, customer.phone].join(" "));
    const matchesFilter = !filter || (filter === "pickup" ? order.fulfilment === "pickup" : paid(order) === (filter === "paid"));
    return matchesFilter && haystack.includes(term);
  }).map((order) => {
    const customer = order.formex_customers || {};
    const actions = [];
    if (!paid(order) && order.method !== "paystack" && order.status !== "cancelled")
      actions.push(["Confirm money received", "confirm"]);
    const next = nextActions[order.status];
    if (next && (paid(order) || (order.fulfilment === "pickup" && next[1] !== "completed")))
      actions.push(next);
    if (order.status === "received" && !paid(order) && order.method !== "paystack")
      actions.push(["Cancel order", "cancelled"]);
    const details = [
      [order.reference, order.storage, order.condition, order.color].filter(Boolean).join(" · "),
      [customer.name, customer.email, customer.phone].filter(Boolean).join(" · "),
      [methodLabels[order.method], order.fulfilment === "pickup" ? "Store pickup" : "Delivery", order.address].filter(Boolean).join(" · "),
    ].filter(Boolean).join("\n");
    return record(order.model + " · " + money.format(order.amount),
      (fulfilmentLabels[order.status] || order.status) + (paid(order) ? " · Paid" : " · Unpaid"),
      !paid(order), details, actions.map(([label, status]) => [label, { action: "order", reference: order.reference, status }]));
  });
  $("orders").replaceChildren(...(rows.length ? rows : [element("p", term || filter ? "No orders match those filters." : "No orders yet.", "empty")]));
}

function renderOverview() {
  const metrics = [
    ["Orders", state.orders.length, "orders", "order", ""],
    ["Unpaid orders", state.orders.filter((o) => !paid(o) && o.status !== "cancelled").length, "orders", "order", "unpaid"],
    ["Open enquiries", state.enquiries.filter((e) => !e.resolved).length, "enquiries", "chat", ""],
    ["Active products", state.products.filter((p) => !p.archived).length, "products", "box", ""],
  ];
  $("metrics").replaceChildren(...metrics.map(([label, number, panel, symbol, filter]) => {
    const button = element("button", "", "metric");
    button.type = "button";
    const title = element("span", label);
    title.append(icon(symbol));
    button.append(title, element("strong", String(number)));
    const count = { orders: state.orders.length, enquiries: state.enquiries.length, products: state.products.length }[panel];
    if (count === 100) button.append(element("small", "On the first page", "meta"));
    button.onclick = () => {
      if (panel === "orders") {
        $("order-filter").value = filter;
        $("order-search").value = "";
        renderOrders();
      }
      navigate(panel);
    };
    return button;
  }));
  const recent = state.orders.slice(0, 4).map((order) =>
    record(order.model, fulfilmentLabels[order.status] || order.status, !paid(order), money.format(order.amount)));
  $("recent-orders").replaceChildren(...(recent.length ? recent : [element("p", "New orders will appear here.", "empty")]));
}

function renderPhotos() {
  const product = state.products.find((p) => p.slug === $("photo-product").value);
  const urls = productImages(product);
  $("product-photos").replaceChildren(...urls.map((url, index) =>
    image(url, product.details.model + " photo " + (index + 1))));
  if (product && !urls.length)
    $("product-photos").append(element("p", "This product has no photos yet.", "meta"));
}

function promotionFields() {
  const product = state.products.find((p) => p.slug === $("deal-product").value);
  for (const name of ["hot", "featured"]) $("promotion").elements[name].checked = !!product?.[name];
}

function render(selected = selectedSlug, storage = selected === selectedSlug ? $("variantSelect").value : undefined) {
  renderOverview();
  renderProducts();
  selectProduct(selected, storage);
  renderOrders();
  const enquiries = state.enquiries.map((enquiry) =>
    record(enquiry.contact, enquiry.resolved ? "Resolved" : "Open", !enquiry.resolved, enquiry.message,
      enquiry.resolved ? [] : [["Mark resolved", { action: "resolve", id: enquiry.id }]]));
  $("enquiries").replaceChildren(...(enquiries.length ? enquiries : [element("p", "No enquiries yet.", "empty")]));
  const choices = [["", "Choose a product"], ...state.products.map((p) => [p.slug, p.details.model + (p.archived ? " (archived)" : "")])];
  fill($("photo-product"), choices);
  renderPhotos();
  fill($("deal-product"), choices);
  promotionFields();
  $("settings").elements.fee.value = state.settings.delivery_fee ?? "";
  $("settings").elements.pickup.value = state.settings.pickup_instructions ?? "";
  pagination();
}

async function save(body, button) {
  if (busy) return;
  busy = true;
  if (button) button.disabled = true;
  pagination();
  try {
    await call(body);
    state = await call();
    render(
      body.action === "product" ? body.slug : selectedSlug,
      body.action === "variant" ? body.storage : undefined,
    );
    if (body.action === "image") $("image").elements.photo.value = "";
    note("Saved.");
  } catch (error) {
    note(error.message, true);
  } finally {
    busy = false;
    if (button) button.disabled = false;
    pagination();
  }
}

$("login").onsubmit = async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    const response = await fetch("/api/admin?login=1");
    if (!response.ok) throw Error("Sign-in is unavailable. Try again shortly.");
    const config = await response.json();
    const auth = await fetch(config.url + "/auth/v1/token?grant_type=password", {
      method: "POST",
      headers: { apikey: config.key, "Content-Type": "application/json" },
      body: JSON.stringify(Object.fromEntries(new FormData(form))),
    });
    if (!auth.ok) throw Error("Sign-in failed. Check your email and password.");
    token = (await auth.json()).access_token;
    state = await call();
    form.reset();
    render();
    $("signin").hidden = true;
    $("desk").hidden = false;
    navigate("overview");
    note("");
  } catch (error) {
    note(error.message, true);
  } finally {
    button.disabled = false;
  }
};

$("logout").onclick = () => location.reload();
$("dismiss").onclick = () => note("");
tabs.forEach((tab) => tab.onclick = () => navigate(tab.dataset.section));
document.querySelectorAll("[data-go]").forEach((button) => button.onclick = async () => {
  await navigate(button.dataset.go);
  if (button.id === "quick-add" && section === "products") $("new-product").click();
});
$("new-product").onclick = () => {
  selectProduct("");
  $("product").elements.model.focus();
};
$("variantSelect").onchange = variant;
$("deal-product").onchange = promotionFields;
$("photo-product").onchange = renderPhotos;
$("product-search").oninput = renderProducts;
$("order-search").oninput = renderOrders;
$("order-filter").onchange = renderOrders;

for (const [id, offset] of [["prev", -1], ["next", 1]]) {
  $(id).onclick = async () => {
    if (busy) return;
    busy = true;
    pagination();
    try {
      state = await call(undefined, page + offset);
      page += offset;
      render();
    } catch (error) {
      note(error.message, true);
    } finally {
      busy = false;
      pagination();
    }
  };
}

for (const action of ["product", "variant", "settings", "image", "promotion"]) {
  $(action).onsubmit = (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = form.elements;
    const body = { ...Object.fromEntries(new FormData(form)), action };
    const button = event.submitter;
    if (action === "product") {
      body.conditions = body.conditions.split(",").map((condition) => condition.trim()).filter(Boolean);
      for (const flag of ["archived", "featured", "hot"]) body[flag] = fields[flag].checked;
    }
    if (action === "variant") {
      body.slug = selectedSlug;
      body.price = body.price ? Number(body.price) : null;
      body.regular = body.regular ? Number(body.regular) : null;
      body.available = fields.available.checked;
    }
    if (action === "promotion") {
      body.hot = fields.hot.checked;
      body.featured = fields.featured.checked;
    }
    if (action === "settings") body.fee = body.fee === "" ? null : Number(body.fee);
    if (action === "image") {
      if (body.photo.size > 2097152) {
        note("Choose an image under 2 MB.", true);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => save({ action, slug: body.slug, data: reader.result.split(",")[1] }, button);
      reader.onerror = () => note("The photo could not be read. Select it again.", true);
      reader.readAsDataURL(body.photo);
      return;
    }
    save(body, button);
  };
}
