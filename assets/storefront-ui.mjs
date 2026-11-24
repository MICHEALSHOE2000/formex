import {minimumDeposit} from '../easy-buy/easy-buy-core.mjs';
export const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money = value => new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(value);
export function lowestPricedVariant(variants) {
  return variants.reduce((lowest, variant) => {
    if (!Number.isFinite(variant.price) || variant.price <= 0) return lowest;
    return !lowest || variant.price < lowest.price ? variant : lowest;
  }, undefined);
}

export function variantLink(item, variant = lowestPricedVariant(item.variants)) {
  if (!variant) return item.route;
  const url = new URL(item.route, 'https://formexcommunication.com.ng');
  url.searchParams.set('storage', variant.storage);
  return url.pathname + url.search + url.hash;
}

export function priceText(item, variant = lowestPricedVariant(item.variants)) {
  if (!variant) return 'Confirm price';
  const hasMorePricedVariants = item.variants.some(other =>
    other !== variant && Number.isFinite(other.price) && other.price > 0
  );
  return (hasMorePricedVariants ? 'From ' : '') + money(variant.price);
}
export const media = (src,label,priority=false) => `<span class="device-media${src?' is-loading':' is-missing'}"><span class="media-fallback" aria-hidden="true">${escape(label)}</span>${src?`<img src="${escape(src.replace('-720.webp','-360.webp'))}" ${src.includes('-720.webp')?`srcset="${escape(src.replace('-720.webp','-360.webp'))} 360w, ${escape(src)} 720w" sizes="(max-width:600px) 45vw, 280px"`:''} alt="${escape(label)}" width="360" height="400" loading="${priority?'eager':'lazy'}" decoding="async" ${priority?'fetchpriority="high"':''}>`:''}</span>`;
export function card(item) {
  const variant = lowestPricedVariant(item.variants);
  const link = variantLink(item, variant);
  const id = `${item.slug}|${variant?.storage ?? item.variants[0]?.storage}`;
  const phone = ['iphones', 'samsung', 'pixel'].includes(item.category);
  return `<article class="store-phone" data-model="${escape(item.slug)}"><a class="store-photo" href="${escape(link)}">${variant?.offerId?'<span class="offer-label">HOT DEAL</span>':''}${media(item.image,item.model)}</a><div class="store-card-copy"><p class="store-condition">${escape(item.conditions.join(' / ')) || 'Ask for available models'}</p><h3><a href="${escape(link)}">${escape(item.model)}</a></h3><p class="store-storage">${escape(item.variants.slice(0,3).map(v=>v.storage).join(' · '))}${item.variants.length>3?' + more':''}</p>${variant && variant.regularPrice > variant.price?`<del class="regular-price">${money(variant.regularPrice)}</del>`:''}<strong class="store-price">${priceText(item, variant)}</strong><p class="store-options">${item.easy&&variant?`Pay Small Small from ${money(minimumDeposit(variant.price,item))} deposit`:''}</p><a class="store-view" href="${escape(link)}">${phone?'VIEW PHONE':'VIEW OPTIONS'} <span aria-hidden="true">→</span></a>${phone?`<div class="card-shortcuts">${item.swap?`<a data-buying-path="swap" data-product-id="${escape(id)}" data-value="${variant?.price||0}" href="/swap/?target=${encodeURIComponent(id)}">Swap to this phone</a>`:''}${item.easy?`<a data-buying-path="easy" data-product-id="${escape(id)}" data-value="${variant?.price||0}" href="/easybuy/?phone=${encodeURIComponent(id)}">Pay Small Small</a>`:''}</div>`:''}</div></article>`;
}
const observedImages = new WeakSet();
export function activateImages(root=document){root.querySelectorAll('.device-media img').forEach(img=>{if(observedImages.has(img))return;observedImages.add(img);const box=img.closest('.device-media');const done=()=>{box.classList.remove('is-loading');box.classList.toggle('is-missing',!img.naturalWidth);};img.addEventListener('load',done);img.addEventListener('error',done);if(img.complete)done();});}

export const dealCard = phone => `<article class="deal-card" data-deal data-id="${escape(phone.id)}"><a class="product-image" href="/${phone.slug}?storage=${encodeURIComponent(phone.storage)}">${phone.offerId?'<span class="offer-label">HOT DEAL</span>':''}${media(phone.image,phone.model)}</a><div class="card-body"><p class="eyebrow">${escape(phone.brand)} · ${escape(phone.storage)}</p><h3>${escape(phone.model)}</h3><p class="guide">Condition confirmed for your unit</p>${phone.regularPrice?`<del>${money(phone.regularPrice)}</del>`:''}<strong class="price">${money(phone.price)}</strong><p class="deposit">Pay Small Small from ${money(minimumDeposit(phone.price,phone))} deposit</p><a class="store-view" href="/${phone.slug}?storage=${encodeURIComponent(phone.storage)}">VIEW PHONE →</a><div class="card-shortcuts"><a data-buying-path="swap" data-product-id="${escape(phone.id)}" data-value="${phone.price}" href="/swap/?target=${encodeURIComponent(phone.id)}">Swap to this phone</a><a data-buying-path="easy" data-product-id="${escape(phone.id)}" data-value="${phone.price}" href="/easybuy/?phone=${encodeURIComponent(phone.id)}">Pay Small Small</a></div></div></article>`;
