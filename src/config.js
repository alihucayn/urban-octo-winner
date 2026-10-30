// Edit these before deploying. See docs/LAUNCH.md. CI (scripts/check-config.mjs)
// refuses to deploy while placeholders or unsafe settings remain.
export const CONFIG = {
  productName: 'AdvisorScout',
  // Where the "Buy" button sends people (Lemon Squeezy or Gumroad checkout link).
  checkoutUrl: 'https://YOUR-STORE.lemonsqueezy.com/buy/REPLACE-ME',
  price: '$12',
  priceNote: 'one-time · no subscription · yours to keep',
  // Trust signals. Each line on the page is shown only when its value is set.
  // sellerName + supportEmail appear in the footer and on terms/privacy/refund pages;
  // Lemon Squeezy reviews these pages before it activates a store.
  sellerName: 'AdvisorScout',
  supportEmail: '',
  refundDays: 14, // match this in Lemon Squeezy (refund policy + product description) before launch
  activationLimit: 5, // match the product's license-key activation limit (also the Gumroad uses cap)
  // Opt-in: names you publicly. e.g. 'Built by a CS student applying to PhDs this cycle, for my own shortlist.'
  founderLine: '',
  founderUrl: '', // e.g. your LinkedIn or a short "why I built this" post
  testimonials: [], // [{ quote: '…', who: 'MS applicant, Lahore' }], only real, permissioned quotes
  // Discount codes people may arrive with (?code=NUSTSOC). Label shown in a small banner;
  // the discount itself lives in Lemon Squeezy. Unknown codes are still passed to checkout.
  codes: { /* NUSTSOC: 'NUST student society discount' */ },
  // Optional regional price test, matched by the browser's time zone. Keep it modest
  // (e.g. $8-9), give the code a redemption limit or end date, and drop it if
  // revenue per visitor falls. Example:
  // [{ code: 'SOUTHASIA', priceLabel: '$8', timezones: ['Asia/Karachi', 'Asia/Kolkata', 'Asia/Calcutta', 'Asia/Dhaka'] }]
  regionalOffers: [],
  // Manual local-payment fallback (JazzCash/Easypaisa). Shown only when whatsapp is set,
  // as digits with country code, e.g. '923001234567'. See docs/LAUNCH.md section 2.
  localPay: { whatsapp: '', pricePKR: 2000 },
  // Lemon Squeezy affiliates: your store slug (the "slug" in slug.lemonsqueezy.com).
  // When set, Lemon Squeezy's affiliate.js is loaded so ?aff= links credit affiliates.
  lsStoreSlug: '',
  // Free email list (Kit form action, https://app.kit.com/forms/<id>/subscriptions). Empty = hidden.
  emailCapture: { action: '', topicField: false },
  // 'lemonsqueezy' | 'gumroad' | 'none' (none = every key is accepted, and only on localhost)
  licenseProvider: 'lemonsqueezy',
  // Lemon Squeezy: REQUIRED. Numeric IDs; keys from any other store/product are rejected.
  lemonStoreId: null,
  lemonProductId: null,
  // Gumroad: the product_id shown on the product's edit page (license keys must be enabled).
  gumroadProductId: '',
  // Free tier limits
  freeResults: 5,
  freeShortlist: 3,
  // OpenAlex. NEVER put an API key here: this file is public, and the key is also your
  // openalex.org sign-in. Free visitors call api.openalex.org directly (their own per-IP
  // allowance). Set `proxy` to your Cloudflare Worker (worker/openalex-proxy.js, key held
  // as a Worker secret): free searches retry through it on a 429, Pro always uses it.
  // Visitors can also paste their own free key in the app.
  openalex: { base: 'https://api.openalex.org', proxy: '', mailto: '', apiKey: '' },
  // Cookieless analytics: 'umami' | 'goatcounter' | 'none'. Nothing is sent until siteId is set.
  // umami: the Website ID from cloud.umami.is. goatcounter: your site code (code.goatcounter.com).
  analytics: { provider: 'umami', siteId: '' },
};
