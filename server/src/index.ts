import { ConfigError, loadConfig } from './config.ts';
import { createApp } from './app.ts';

let config;
try {
  config = loadConfig();
} catch (err) {
  if (!(err instanceof ConfigError)) throw err;
  console.error(`Config error: ${err.message}`);
  process.exit(1);
}
const app = await createApp(config);
await app.listen({ port: config.port, host: config.host });
