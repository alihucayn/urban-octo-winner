// Edit these before deploying. See docs/LAUNCH.md.
export const CONFIG = {
  productName: 'AdvisorScout',
  // Where the "Buy" button sends people (Lemon Squeezy / Gumroad / Dodo checkout link).
  checkoutUrl: 'https://YOUR-STORE.lemonsqueezy.com/buy/REPLACE-ME',
  price: '$12',
  priceNote: 'one-time · whole application season',
  // 'lemonsqueezy' | 'gumroad' | 'none' (none = every key is accepted; for local testing only)
  licenseProvider: 'lemonsqueezy',
  // Lemon Squeezy: reject keys from other stores/products. Leave null to skip the check.
  lemonStoreId: null,
  lemonProductId: null,
  // Gumroad: the product_id shown on the product's edit page (license keys must be enabled).
  gumroadProductId: '',
  // Free tier limits
  freeResults: 5,
  freeShortlist: 3,
  // OpenAlex: optional. Visitors' browsers call OpenAlex directly, so each visitor
  // uses their own free allowance. A mailto identifies you to OpenAlex politely.
  openalex: { mailto: '', apiKey: '' },
};
