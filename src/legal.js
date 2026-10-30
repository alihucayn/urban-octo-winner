// Fills seller name, support email and policy numbers on the static legal pages from CONFIG.
import { CONFIG } from './config.js';

const set = (sel, text) => document.querySelectorAll(sel).forEach((el) => (el.textContent = text));
set('[data-seller]', CONFIG.sellerName || CONFIG.productName);
set('[data-refund-days]', String(CONFIG.refundDays || 14));
set('[data-activations]', String(CONFIG.activationLimit || 5));
document.querySelectorAll('[data-support]').forEach((el) => {
  const email = CONFIG.supportEmail;
  if (!email) return;
  const a = document.createElement('a');
  a.href = 'mailto:' + email;
  a.textContent = email;
  el.replaceChildren(a);
});
