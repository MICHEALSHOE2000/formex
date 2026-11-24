const $ = (id) => document.getElementById(id);

function element(tag, text = "", className = "") {
  const node = document.createElement(tag);
  node.textContent = text;
  if (className) node.className = className;
  return node;
}

const keyFor = (product, variant) => JSON.stringify([product.slug, variant.storage]);
const titleFor = (product, variant) => product.details.model + " · " + variant.storage;
const priceFields = (variant) => ({
  price: variant.price ?? null,
  regular: variant.details.regularPrice ?? null,
  available: !!variant.available,
});

export function setupBulkPrices(run) {
  const form = $("bulk-prices");
  const changes = new Map();
  const errors = new Map();
  let products = [];

  function renderStatus() {
    form.querySelector('[type="submit"]').disabled = !changes.size;
    $("bulk-discard").disabled = !changes.size;
    $("bulk-count").textContent = changes.size
      ? changes.size + (changes.size === 1 ? " unsaved variant" : " unsaved variants")
      : "";
    $("bulk-errors").hidden = !errors.size;
    $("bulk-errors").replaceChildren(...[...errors.values()].map((message) => element("li", message)));
  }

  function rowFor(product, variant) {
    const key = keyFor(product, variant);
    const title = titleFor(product, variant);
    const pending = changes.get(key);
    const original = pending?.original ?? priceFields(variant);
    const values = pending?.values ?? original;
    const row = element("div", "", "bulk-row");
    row.dataset.pending = String(!!pending);
    const heading = element("div");
    heading.append(element("strong", product.details.model), element("small",
      [variant.storage, variant.details.condition, product.archived ? "Archived" : ""].filter(Boolean).join(" · "), "meta"));
    row.append(heading);
    const controls = {};
    for (const [name, labelText] of [["price", "Selling price (₦)"], ["regular", "Regular price (₦)"], ["available", "Available for checkout"]]) {
      const label = element("label", labelText);
      const input = element("input");
      input.setAttribute("aria-label", title + " " + labelText);
      if (name === "available") {
        input.type = "checkbox";
        input.checked = values[name];
        label.prepend(input);
      } else {
        input.type = "number";
        input.min = "1";
        input.max = "9000000000";
        input.step = "1";
        input.value = values[name] ?? "";
        label.append(input);
      }
      controls[name] = input;
      input.addEventListener("input", () => {
        const { price, regular, available } = controls;
        if (!price.validity.valid || !regular.validity.valid) {
          changes.set(key, { key, title, original, invalid: true, values: {
            price: price.value, regular: regular.value, available: available.checked,
          } });
        } else {
          const values = {
            price: price.value === "" ? null : price.valueAsNumber,
            regular: regular.value === "" ? null : regular.valueAsNumber,
            available: available.checked,
          };
          if (Object.keys(values).some((name) => values[name] !== original[name]))
            changes.set(key, { key, title, original, values, slug: product.slug, storage: variant.storage });
          else changes.delete(key);
        }
        errors.delete(key);
        row.dataset.pending = String(changes.has(key));
        renderStatus();
      });
      row.append(label);
    }
    return row;
  }

  function render() {
    const category = $("bulk-brand").value;
    const words = $("bulk-search").value.trim().toLowerCase().split(/\s+/);
    const rows = [];
    for (const product of products) {
      if (category && product.details.brand !== category) continue;
      for (const variant of product.formex_variants) {
        const searchText = titleFor(product, variant).toLowerCase();
        if (words.every((word) => searchText.includes(word)))
          rows.push(rowFor(product, variant));
      }
    }
    $("bulk-variants").replaceChildren(...(rows.length ? rows : [element("p", "No matching variants.", "empty")]));
    renderStatus();
  }

  $("bulk-search").oninput = render;
  $("bulk-brand").onchange = render;
  $("bulk-discard").onclick = () => {
    changes.clear();
    errors.clear();
    render();
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (!changes.size) return;
    errors.clear();
    for (const entry of changes.values()) {
      const { price, regular } = entry.values;
      if (entry.invalid || (regular !== null && (price === null || regular <= price)))
        errors.set(entry.key, entry.title + ": enter valid prices. Regular price must be higher than selling price.");
    }
    if (errors.size) {
      renderStatus();
      return;
    }
    try {
      form.inert = true;
      await run(async (call) => {
        const total = changes.size;
        let saved = 0;
        for (const entry of changes.values()) {
          try {
            await call({ action: "variant_prices", slug: entry.slug, storage: entry.storage, original: entry.original, ...entry.values });
            changes.delete(entry.key);
            saved++;
          } catch (error) {
            errors.set(entry.key, entry.title + ": " + error.message);
          }
          $("bulk-count").textContent = saved + " of " + total + " variants saved";
        }
        return { message: saved + " of " + total + " variants saved.", error: errors.size > 0 };
      });
    } finally {
      form.inert = false;
      renderStatus();
    }
  };

  return (items) => {
    products = items;
    render();
  };
}

function readPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = () => reject(Error("Could not read this file."));
    reader.readAsDataURL(file);
  });
}

export function setupPhotoQueue(run, notify) {
  const form = $("image");
  const list = $("queued-photos");
  const queue = [];
  let uploading = false;

  function render() {
    $("photo-queue").hidden = !queue.length;
    $("upload-photos").disabled = uploading;
    list.replaceChildren(...queue.map((entry, index) => {
      const item = element("li");
      const label = element("span", entry.model + " · " + entry.file.name);
      if (entry.error) label.append(element("small", entry.error));
      const remove = element("button", "Remove", "button quiet");
      remove.type = "button";
      remove.disabled = uploading;
      remove.setAttribute("aria-label", "Remove " + entry.file.name + " for " + entry.model);
      remove.onclick = () => {
        queue.splice(index, 1);
        render();
      };
      item.append(label, remove);
      return item;
    }));
  }

  form.onsubmit = (event) => {
    event.preventDefault();
    if (uploading) return;
    const select = $("photo-product");
    const photos = [...form.elements.photo.files];
    if (!select.value || !photos.length) return;
    const errors = [];
    for (const file of photos) {
      if (!file.size || file.size > 2097152 || !/\.(jpe?g|png|webp)$/i.test(file.name)) {
        errors.push(file.name);
        continue;
      }
      if (queue.length >= 50) {
        notify("The queue holds up to 50 photos. Upload the current queue first.", true);
        break;
      }
      const slug = select.value;
      const duplicate = queue.some((entry) =>
        entry.slug === slug && entry.file.name === file.name && entry.file.size === file.size && entry.file.lastModified === file.lastModified);
      if (!duplicate) queue.push({ slug, model: select.selectedOptions[0].textContent, file });
    }
    if (errors.length) notify("Skipped unsupported or oversized photos: " + errors.join(", "), true);
    form.elements.photo.value = "";
    render();
  };

  $("upload-photos").onclick = async () => {
    if (uploading || !queue.length) return;
    uploading = true;
    form.inert = true;
    render();
    try {
      await run(async (call) => {
        const batch = [...queue];
        let saved = 0;
        for (const entry of batch) {
          try {
            await call({ action: "image", slug: entry.slug, data: await readPhoto(entry.file) });
            queue.splice(queue.indexOf(entry), 1);
            saved++;
          } catch (error) {
            entry.error = error.message;
          }
          $("photo-progress").textContent = saved + " of " + batch.length + " photos uploaded";
        }
        $("photo-progress").textContent = queue.length ? "Check failed files before retrying." : "";
        return { message: saved + " of " + batch.length + " photos uploaded.", error: !!queue.length };
      });
    } finally {
      uploading = false;
      form.inert = false;
      render();
    }
  };
}
