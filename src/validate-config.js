// Pre-deploy sanity check for src/config.js (run by scripts/check-config.mjs in CI).
// Returns a list of problems; an empty list means the config is safe to ship.
export function validateConfig(c) {
  const errors = [];
  if (!c.checkoutUrl || /REPLACE-ME|YOUR-STORE/i.test(c.checkoutUrl)) {
    errors.push('checkoutUrl is still a placeholder: nobody can buy Pro.');
  } else if (!/^https:\/\//.test(c.checkoutUrl)) {
    errors.push('checkoutUrl must be an https:// link.');
  }
  if (c.licenseProvider === 'none') errors.push("licenseProvider 'none' accepts every key; use it on localhost only.");
  else if (c.licenseProvider === 'lemonsqueezy') {
    if (!Number(c.lemonStoreId)) errors.push('lemonStoreId is required (Lemon Squeezy → Settings → Stores, the number after #).');
    if (!Number(c.lemonProductId)) errors.push('lemonProductId is required (Products → your product → the ID in the URL / product menu).');
  } else if (c.licenseProvider === 'gumroad') {
    if (!c.gumroadProductId) errors.push('gumroadProductId is required (product edit page → License key section).');
  } else errors.push(`Unknown licenseProvider '${c.licenseProvider}'.`);
  if (c.openalex?.apiKey) errors.push('openalex.apiKey must stay empty: config.js is public. Put the key in the Worker proxy as a secret.');
  return errors;
}
