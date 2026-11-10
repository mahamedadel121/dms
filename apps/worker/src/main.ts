import { loadEnv } from '@dms/db';

loadEnv();
console.log('TODO(WP4): worker started (job runner + schedulers)');
setInterval(() => undefined, 60_000);
