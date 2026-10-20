import { loadConfig } from './config.ts';
import { createApp } from './app.ts';

const config = loadConfig();
const app = await createApp(config);
await app.listen({ port: config.port, host: config.host });
