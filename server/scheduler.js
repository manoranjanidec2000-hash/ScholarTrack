import cron from 'node-cron';
import { runCollection } from './scrapers/collector.js';

export function startScheduler(db) {
  const expression = process.env.REFRESH_CRON || '0 */12 * * *';
  if (!cron.validate(expression)) {
    console.error(`Invalid REFRESH_CRON expression: ${expression}`);
    return null;
  }
  return cron.schedule(expression, () => {
    runCollection(db).catch((error) => console.error('Scheduled refresh failed:', error.message));
  }, { noOverlap: true });
}