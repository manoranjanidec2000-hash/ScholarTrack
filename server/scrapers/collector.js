import axios from 'axios';
import robotsParser from 'robots-parser';
import { collectHtmlNotices } from './adapters/htmlNotices.js';
import { collectNspSchemes } from './adapters/nspSchemes.js';
import { collectRssNotices } from './adapters/rssNotices.js';
import { persistNotice } from '../db/database.js';

let collectionInProgress = false;
const adapters = {
  'html-notices': collectHtmlNotices,
  'rss-notices': collectRssNotices,
  'nsp-schemes': collectNspSchemes
};

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchWithRetry(task, retries = Number(process.env.SCRAPE_MAX_RETRIES) || 2) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await sleep(400 * (2 ** attempt));
    }
  }
  throw lastError;
}

async function checkRobots(source) {
  const base = new URL(source.url).origin;
  const robotsUrl = `${base}/robots.txt`;
  const response = await axios.get(robotsUrl, {
    timeout: Number(process.env.SCRAPE_TIMEOUT_MS) || 10000,
    headers: { 'User-Agent': process.env.SCRAPE_USER_AGENT || 'ScholarTrack/1.0' },
    validateStatus: (status) => status === 200 || status === 404
  });
  if (response.status === 404) return true;
  const parser = robotsParser(robotsUrl, response.data);
  return parser.isAllowed(source.url, process.env.SCRAPE_USER_AGENT || '*') !== false;
}

async function collectOne(db, source) {
  const startedAt = new Date().toISOString();
  const run = db.prepare(`
    INSERT INTO collection_runs (source_id, started_at, status) VALUES (?, ?, 'running')
  `).run(source.source_id, startedAt);
  try {
    if (source.is_demo || !source.approved) throw new Error('Source is not approved for collection.');
    if (!await checkRobots(source)) throw new Error('robots.txt disallows this URL for the configured user agent.');
    const adapter = adapters[source.adapter_key];
    if (!adapter) throw new Error(`Unsupported adapter: ${source.adapter_key}`);
    const config = JSON.parse(source.config_json || '{}');
    const records = await fetchWithRetry(() => adapter(source, config));
    const persist = db.transaction((items) => items.map((item) => persistNotice(db, source, item)));
    const results = persist(records);
    const changed = results.filter((item) => item.changed).length;
    const completedAt = new Date().toISOString();
    db.prepare(`
      UPDATE collection_runs SET completed_at = ?, status = 'success', records_seen = ?, records_changed = ? WHERE run_id = ?
    `).run(completedAt, records.length, changed, run.lastInsertRowid);
    db.prepare("UPDATE sources SET last_checked_at = ?, adapter_status = 'available' WHERE source_id = ?")
      .run(completedAt, source.source_id);
    return { sourceId: source.source_id, status: 'success', recordsSeen: records.length, recordsChanged: changed };
  } catch (error) {
    const completedAt = new Date().toISOString();
    const message = error?.message || 'Collection failed';
    db.prepare("UPDATE collection_runs SET completed_at = ?, status = 'failed', error_message = ? WHERE run_id = ?")
      .run(completedAt, message, run.lastInsertRowid);
    db.prepare("UPDATE sources SET adapter_status = 'error' WHERE source_id = ?").run(source.source_id);
    return { sourceId: source.source_id, status: 'failed', error: message };
  }
}

export async function runCollection(db, { sourceId = null } = {}) {
  if (collectionInProgress) return { status: 'skipped', message: 'A collection run is already in progress.', results: [] };
  collectionInProgress = true;
  try {
    if (process.env.ENABLE_PUBLIC_SCRAPING !== 'true') {
      const startedAt = new Date().toISOString();
      db.prepare(`
        INSERT INTO collection_runs (source_id, started_at, completed_at, status, error_message)
        VALUES (?, ?, ?, 'skipped', 'Public collection is disabled. Demo data was not refreshed.')
      `).run(sourceId, startedAt, new Date().toISOString());
      return { status: 'skipped', message: 'Public collection is disabled. Demo data was not refreshed.', results: [] };
    }

    const sources = sourceId
      ? db.prepare('SELECT * FROM sources WHERE source_id = ? AND approved = 1 AND is_demo = 0').all(sourceId)
      : db.prepare('SELECT * FROM sources WHERE approved = 1 AND is_demo = 0').all();
    if (!sources.length) {
      const startedAt = new Date().toISOString();
      db.prepare(`
        INSERT INTO collection_runs (source_id, started_at, completed_at, status, error_message)
        VALUES (?, ?, ?, 'skipped', 'No approved public sources are configured.')
      `).run(sourceId, startedAt, new Date().toISOString());
      return { status: 'skipped', message: 'No approved public sources are configured.', results: [] };
    }

    const results = [];
    for (const source of sources) {
      results.push(await collectOne(db, source));
      if (sources.length > 1) await sleep(1000);
    }
    const status = results.every((result) => result.status === 'success')
      ? 'success'
      : results.some((result) => result.status === 'success') ? 'partial' : 'failed';
    return { status, message: 'Collection run completed.', results };
  } finally {
    collectionInProgress = false;
  }
}