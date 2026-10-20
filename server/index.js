import 'dotenv/config';
import { createDatabase } from './db/database.js';
import { createApp } from './app.js';
import { startScheduler } from './scheduler.js';

const db = await createDatabase();
const port = Number(process.env.PORT) || 3001;
const host = process.env.HOST || '127.0.0.1';
const server = createApp(db).listen(port, host, () => {
  console.log(`ScholarTrack API listening on http://localhost:${port}/api`);
  console.log(`Public collection ${process.env.ENABLE_PUBLIC_SCRAPING === 'true' ? 'enabled' : 'disabled'}; demo records are not live data.`);
});
const scheduler = startScheduler(db);

function shutdown() {
  scheduler?.stop();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);