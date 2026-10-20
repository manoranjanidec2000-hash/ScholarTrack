import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import axios from 'axios';
import { createApp } from '../app.js';
import { createDatabase, persistNotice } from '../db/database.js';
import { runCollection } from '../scrapers/collector.js';
import { collectHtmlNotices, normalizeDeadline } from '../scrapers/adapters/htmlNotices.js';
import { collectNspSchemes } from '../scrapers/adapters/nspSchemes.js';
import { getScholarshipFilterOptions, listScholarships } from '../services/scholarships.js';

const here = dirname(fileURLToPath(import.meta.url));

async function setup() {
  const db = await createDatabase(':memory:');
  const sourceId = db.prepare(`
    INSERT INTO sources (name, url, approved, adapter_key, adapter_status)
    VALUES ('Test source', 'https://source.test/notices', 1, 'html-notices', 'ready')
  `).run().lastInsertRowid;
  const source = db.prepare('SELECT * FROM sources WHERE source_id = ?').get(sourceId);
  return { db, source };
}

function notice(overrides = {}) {
  const record = {
    canonical_key: 'https://source.test/notices/award',
    title: 'Research Access Award',
    provider: 'Test University',
    url: 'https://source.test/notices/award',
    due_at: '2026-12-01T23:59:00.000Z',
    timezone: 'UTC',
    content_hash: 'hash-one',
    notice_status: 'active'
  };
  return { ...record, ...overrides };
}

test('HTML adapter extracts valid notices and preserves unknown deadlines', async () => {
  const html = readFileSync(resolve(here, 'fixtures/valid-notices.html'), 'utf8');
  const source = { name: 'Test University', url: 'https://source.test/notices' };
  const result = await collectHtmlNotices(source, {
    selectors: { item: '.notice', title: '.title', link: 'a', deadline: '.deadline' }
  }, { get: async () => ({ data: html }) });

  assert.equal(result.length, 2);
  assert.equal(result[0].title, 'Research Access Award');
  assert.equal(result[0].url, 'https://source.test/funding/research-access');
  assert.equal(result[0].due_at, '2026-12-01T23:59:00.000Z');
  assert.equal(result[1].due_at, null);
  assert.equal(normalizeDeadline('not a date'), null);
});

test('HTML adapter rejects malformed items and unsafe URLs', async () => {
  const html = readFileSync(resolve(here, 'fixtures/malformed-notices.html'), 'utf8');
  const result = await collectHtmlNotices(
    { name: 'Test University', url: 'https://source.test/notices' },
    { selectors: { item: '.notice', title: '.title', link: 'a' } },
    { get: async () => ({ data: html }) }
  );
  assert.deepEqual(result, []);
});

test('NSP adapter extracts public scheme deadlines and preserves missing dates', async () => {
  const html = readFileSync(resolve(here, 'fixtures/nsp-schemes.html'), 'utf8');
  const source = { name: 'National Scholarship Portal (NSP)', url: 'https://scholarships.gov.in/All-Scholarships' };
  const records = await collectNspSchemes(source, {}, { get: async () => ({ data: html }) });

  assert.equal(records.length, 2);
  assert.equal(records[0].title, 'College Scholarship Scheme (Merit Based Scheme)');
  assert.equal(records[0].due_at, '2099-10-31T18:29:59.999Z');
  assert.equal(records[0].timezone, 'Asia/Kolkata');
  assert.equal(records[0].url, 'https://scholarships.gov.in/public/schemeGuidelines/college.pdf');
  assert.equal(records[1].due_at, null);
  assert.equal(records[1].notice_type, 'Welfare based scheme');
  assert.match(records[1].canonical_key, /disability-support/);
});

test('upsert is idempotent and a meaningful deadline revision creates one history row and alert', async () => {
  const { db, source } = await setup();
  const first = notice();
  persistNotice(db, source, first, '2026-10-01T00:00:00.000Z');
  persistNotice(db, source, first, '2026-10-02T00:00:00.000Z');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM scholarships WHERE is_demo = 0').get().count, 1);

  const revised = notice({ due_at: '2026-12-12T23:59:00.000Z', content_hash: 'hash-two' });
  persistNotice(db, source, revised, '2026-10-03T00:00:00.000Z');
  persistNotice(db, source, revised, '2026-10-04T00:00:00.000Z');
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM change_history').get().count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM alerts WHERE alert_type = 'deadline_revised'").get().count, 1);
  const history = db.prepare('SELECT previous_deadline, updated_deadline FROM change_history').get();
  assert.equal(history.previous_deadline, first.due_at);
  assert.equal(history.updated_deadline, revised.due_at);
  db.close();
});

test('unknown deadlines stay null and can later be confirmed with history', async () => {
  const { db, source } = await setup();
  persistNotice(db, source, notice({ due_at: null }), '2026-10-01T00:00:00.000Z');
  assert.equal(db.prepare('SELECT due_at FROM scholarships WHERE is_demo = 0').get().due_at, null);
  persistNotice(db, source, notice({ due_at: '2026-12-01T23:59:00.000Z', content_hash: 'confirmed' }), '2026-10-02T00:00:00.000Z');
  const history = db.prepare('SELECT previous_deadline, updated_deadline FROM change_history').get();
  assert.equal(history.previous_deadline, null);
  assert.ok(history.updated_deadline);
  db.close();
});

test('withdrawals are recorded once as change history and an alert', async () => {
  const { db, source } = await setup();
  persistNotice(db, source, notice(), '2026-10-01T00:00:00.000Z');
  const withdrawn = notice({ notice_status: 'withdrawn', content_hash: 'withdrawn' });
  persistNotice(db, source, withdrawn, '2026-10-02T00:00:00.000Z');
  persistNotice(db, source, withdrawn, '2026-10-03T00:00:00.000Z');
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM change_history WHERE change_type = 'withdrawn'").get().count, 1);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM alerts WHERE alert_type = 'withdrawn'").get().count, 1);
  db.close();
});

test('confirmed deadlines within seven days create one approaching alert', async () => {
  const { db, source } = await setup();
  const dueSoon = new Date(Date.now() + 3 * 86400000).toISOString();
  const record = notice({ due_at: dueSoon, content_hash: 'soon' });
  persistNotice(db, source, record);
  persistNotice(db, source, record);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM alerts WHERE alert_type = 'deadline_approaching'").get().count, 1);
  db.close();
});

test('date filters use the requested timezone boundary', async () => {
  const { db, source } = await setup();
  persistNotice(db, source, notice({
    canonical_key: 'https://source.test/notices/late-evening',
    title: 'Late evening deadline',
    due_at: '2026-10-18T06:30:00.000Z',
    content_hash: 'late-evening'
  }));
  persistNotice(db, source, notice({
    canonical_key: 'https://source.test/notices/next-day',
    title: 'Next day deadline',
    due_at: '2026-10-18T07:30:00.000Z',
    content_hash: 'next-day'
  }));
  const result = listScholarships(db, { from: '2026-10-17', to: '2026-10-17', timezone: 'America/Los_Angeles' });
  assert.ok(result.some((item) => item.title === 'Late evening deadline'));
  assert.ok(!result.some((item) => item.title === 'Next day deadline'));
  db.close();
});

test('scholarships from multiple sources can be filtered and filter options include all sources', async () => {
  const { db, source } = await setup();
  const secondSourceId = db.prepare(`
    INSERT INTO sources (name, url, approved, adapter_key, adapter_status)
    VALUES ('Another source', 'https://another.test/awards', 1, 'rss-notices', 'ready')
  `).run().lastInsertRowid;
  const secondSource = db.prepare('SELECT * FROM sources WHERE source_id = ?').get(secondSourceId);
  persistNotice(db, source, notice({
    canonical_key: 'source-one-award',
    discipline: 'Science',
    region: 'India',
    content_hash: 'source-one'
  }));
  persistNotice(db, secondSource, notice({
    canonical_key: 'source-two-award',
    title: 'Arts Study Award',
    discipline: 'Arts',
    region: 'India',
    content_hash: 'source-two'
  }));

  const options = getScholarshipFilterOptions(db);
  assert.ok(options.discipline.includes('Arts'));
  assert.ok(options.discipline.includes('Science'));
  assert.ok(options.sources.some(({ name }) => name === 'Another source'));
  assert.ok(options.sources.some(({ name }) => name === 'Test source'));
  assert.deepEqual(listScholarships(db, { source: String(secondSourceId) }).map(({ title }) => title), ['Arts Study Award']);
  const activeTitles = listScholarships(db, { status: 'active' }).map(({ title }) => title);
  assert.ok(activeTitles.includes('Arts Study Award'));
  assert.ok(activeTitles.includes('Research Access Award'));
  db.close();
});

test('failed source access is logged and disabled refresh is explicitly skipped', async () => {
  const { db, source } = await setup();
  const originalGet = axios.get;
  const previousEnabled = process.env.ENABLE_PUBLIC_SCRAPING;
  try {
    process.env.ENABLE_PUBLIC_SCRAPING = 'true';
    axios.get = async () => { throw new Error('source unavailable'); };
    const failed = await runCollection(db, { sourceId: source.source_id });
    assert.equal(failed.status, 'failed');
    assert.match(db.prepare('SELECT error_message FROM collection_runs ORDER BY run_id DESC').get().error_message, /unavailable/);

    process.env.ENABLE_PUBLIC_SCRAPING = 'false';
    const skipped = await runCollection(db);
    assert.equal(skipped.status, 'skipped');
    assert.match(skipped.message, /disabled/);
  } finally {
    axios.get = originalGet;
    if (previousEnabled === undefined) delete process.env.ENABLE_PUBLIC_SCRAPING;
    else process.env.ENABLE_PUBLIC_SCRAPING = previousEnabled;
    db.close();
  }
});

test('source registration requires approval, validates HTTPS, and rejects duplicate URLs', async () => {
  const { db } = await setup();
  const server = createApp(db).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/admin/sources`;
  try {
    const unapproved = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test feed', url: 'https://feed.test/rss', adapterKey: 'rss-notices' })
    });
    assert.equal(unapproved.status, 400);

    const registration = {
      name: 'Test feed',
      url: 'https://feed.test/rss',
      adapterKey: 'rss-notices',
      approvalConfirmed: true
    };
    const created = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registration)
    });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).approved, true);

    const duplicate = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registration)
    });
    assert.equal(duplicate.status, 409);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  }
});

test('SQLite records persist after closing and reopening the database', async () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'scholartrack-'));
  const databasePath = resolve(directory, 'persist.sqlite');
  try {
    let db = await createDatabase(databasePath);
    const source = db.prepare('SELECT * FROM sources WHERE url = ?').get('https://example.org/source-a');
    persistNotice(db, source, notice({ canonical_key: 'persistent-award', content_hash: 'persistent' }));
    db.close();
    db = await createDatabase(databasePath);
    assert.equal(db.prepare("SELECT title FROM scholarships WHERE canonical_key = 'persistent-award'").get().title, 'Research Access Award');
    db.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});