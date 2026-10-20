import path from 'node:path';
import { openDb } from '../db/db.ts';
import { Blocklist } from '../policy/blocklist.ts';

/**
 * npm run blocklist -- add|remove|list [domain]
 *
 * Writes to the same SQLite database as the server (DATA_DIR). The server checks the blocklist on
 * every ingest request and its minute sweep purges cached faces of blocked domains within 1 min.
 */
const [cmd, domain] = process.argv.slice(2);
const db = openDb(path.resolve(process.env.DATA_DIR ?? './data'));
const blocklist = new Blocklist(db);

function fail(message: string): never {
  console.error(message);
  console.error('Usage: npm run blocklist -- add|remove|list [domain]');
  db.close();
  process.exit(1);
}

if (cmd === 'list') {
  for (const d of blocklist.list()) console.log(d);
} else if (cmd === 'add' || cmd === 'remove') {
  if (!domain) fail(`Missing domain for ${cmd}`);
  if (cmd === 'add') {
    const entry = blocklist.add(domain) ?? fail(`Not a valid domain: ${domain}`);
    console.log(`Blocked ${entry}. Cached faces are purged by the server within 1 minute.`);
  } else {
    console.log(blocklist.remove(domain) ? `Removed ${domain}` : `Not in blocklist: ${domain}`);
  }
} else {
  fail(`Unknown command: ${cmd ?? '(none)'}`);
}
db.close();
