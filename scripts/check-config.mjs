// Fails the deploy when src/config.js still has placeholders or unsafe settings.
import { CONFIG } from '../src/config.js';
import { validateConfig } from '../src/validate-config.js';

const errors = validateConfig(CONFIG);
if (errors.length) {
  console.error('src/config.js is not ready to deploy:\n- ' + errors.join('\n- '));
  process.exit(1);
}
console.log('config OK');
