import initSqlJs from 'sql.js';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

class PersistentDatabase {
  constructor(sqlite, databasePath) {
    this.sqlite = sqlite;
    this.databasePath = databasePath;
    this.transactionDepth = 0;
  }

  exec(query) {
    const result = this.sqlite.exec(query);
    if (/\b(CREATE|INSERT|UPDATE|DELETE|DROP|ALTER|REPLACE)\b/i.test(query)) this.save();
    return result;
  }

  pragma(query) {
    return this.sqlite.exec(`PRAGMA ${query}`);
  }

  prepare(query) {
    const database = this;
    const bind = (statement, parameters) => {
      if (parameters.length === 1 && Array.isArray(parameters[0])) {
        statement.bind(parameters[0]);
      } else if (parameters.length === 1 && parameters[0] && typeof parameters[0] === 'object') {
        const named = Object.fromEntries(Object.entries(parameters[0]).map(([key, value]) => [
          /^[$:@]/.test(key) ? key : `@${key}`,
          value === undefined ? null : value
        ]));
        statement.bind(named);
      } else if (parameters.length) {
        statement.bind(parameters.map((value) => value === undefined ? null : value));
      }
    };
    return {
      run(...parameters) {
        const statement = database.sqlite.prepare(query);
        try {
          bind(statement, parameters);
          while (statement.step()) {}
          const changes = database.sqlite.getRowsModified();
          const rowId = database.sqlite.exec('SELECT last_insert_rowid() AS id')[0]?.values[0]?.[0] ?? 0;
          if (!database.transactionDepth) database.save();
          return { changes, lastInsertRowid: rowId };
        } finally {
          statement.free();
        }
      },
      get(...parameters) {
        const statement = database.sqlite.prepare(query);
        try {
          bind(statement, parameters);
          return statement.step() ? statement.getAsObject() : undefined;
        } finally {
          statement.free();
        }
      },
      all(...parameters) {
        const statement = database.sqlite.prepare(query);
        const rows = [];
        try {
          bind(statement, parameters);
          while (statement.step()) rows.push(statement.getAsObject());
          return rows;
        } finally {
          statement.free();
        }
      }
    };
  }

  transaction(callback) {
    return (...parameters) => {
      this.sqlite.run('BEGIN TRANSACTION');
      this.transactionDepth += 1;
      try {
        const result = callback(...parameters);
        this.sqlite.run('COMMIT');
        this.transactionDepth -= 1;
        this.save();
        return result;
      } catch (error) {
        this.sqlite.run('ROLLBACK');
        this.transactionDepth -= 1;
        throw error;
      }
    };
  }

  save() {
    if (this.databasePath === ':memory:') return;
    const bytes = this.sqlite.export();
    writeFileSync(this.databasePath, Buffer.from(bytes));
  }

  close() {
    this.save();
    this.sqlite.close();
  }
}

function demoRecords() {
  const capturedAt = new Date().toISOString();
  const daysFromNow = (days) => new Date(Date.now() + days * 86400000).toISOString();
  return [
    {
      canonical_key: 'demo-global-research-fellowship',
      title: 'Global Research Fellowship',
      provider: 'Northstar Learning Fund',
      url: 'https://example.org/demo/global-research-fellowship',
      education_level: 'Postgraduate',
      programme: 'Research fellowship',
      discipline: 'All disciplines',
      region: 'International',
      residency_rule: 'Demo: open to international applicants',
      benefit_text: 'Demo award: tuition support and a monthly research stipend.',
      eligibility_excerpt: 'Demo record only. Check official programme rules before applying.',
      due_at: daysFromNow(18),
      timezone: 'UTC',
      notice_status: 'active',
      captured_at: capturedAt,
      verified_at: null
    },
    {
      canonical_key: 'demo-first-generation-award',
      title: 'First-Generation Student Award',
      provider: 'Open Pathways Foundation',
      url: 'https://example.org/demo/first-generation-award',
      education_level: 'Undergraduate',
      programme: 'Degree study',
      discipline: 'All disciplines',
      region: 'United States',
      residency_rule: 'Demo: residency requirements not verified',
      benefit_text: 'Demo award: one-time education grant.',
      eligibility_excerpt: 'Demo keyword: first-generation student. This is not an eligibility decision.',
      due_at: daysFromNow(42),
      timezone: 'America/New_York',
      notice_status: 'active',
      captured_at: capturedAt,
      verified_at: null
    },
    {
      canonical_key: 'demo-creative-futures-grant',
      title: 'Creative Futures Study Grant',
      provider: 'Brightline Arts Trust',
      url: 'https://example.org/demo/creative-futures-grant',
      education_level: 'Undergraduate',
      programme: 'Arts and design',
      discipline: 'Arts',
      region: 'United Kingdom',
      residency_rule: 'Demo: residency requirements not verified',
      benefit_text: 'Demo award: partial tuition grant and materials allowance.',
      eligibility_excerpt: 'Demo keyword: portfolio submission. Confirm all requirements at the official source.',
      due_at: null,
      timezone: 'Europe/London',
      notice_status: 'active',
      captured_at: capturedAt,
      verified_at: null
    },
    {
      canonical_key: 'demo-community-impact-scholarship',
      title: 'Community Impact Scholarship',
      provider: 'Civic Futures Fund',
      url: 'https://example.org/demo/community-impact-scholarship',
      education_level: 'Postgraduate',
      programme: 'Public service',
      discipline: 'Social sciences',
      region: 'Canada',
      residency_rule: 'Demo: Canadian residency stated for illustration only',
      benefit_text: 'Demo award: annual tuition contribution.',
      eligibility_excerpt: 'Demo keyword: community leadership. No automated eligibility assessment is performed.',
      due_at: daysFromNow(7),
      timezone: 'America/Toronto',
      notice_status: 'active',
      captured_at: capturedAt,
      verified_at: null
    },
    {
      canonical_key: 'demo-stem-women-fellowship',
      title: 'Women in STEM Fellowship',
      provider: 'Future Lab Initiative',
      url: 'https://example.org/demo/women-in-stem-fellowship',
      education_level: 'Doctoral',
      programme: 'Fellowship',
      discipline: 'STEM',
      region: 'International',
      residency_rule: 'Demo: open to international applicants',
      benefit_text: 'Demo award: living stipend and conference travel allowance.',
      eligibility_excerpt: 'Demo keyword: STEM research. Review official terms; this record is illustrative.',
      due_at: daysFromNow(75),
      timezone: 'UTC',
      notice_status: 'active',
      captured_at: capturedAt,
      verified_at: null
    }
  ];
}

export async function createDatabase(databasePath = process.env.DATABASE_PATH || './data/scholartrack.sqlite') {
  const resolvedPath = databasePath === ':memory:' ? ':memory:' : resolve(process.cwd(), databasePath);
  if (resolvedPath !== ':memory:') mkdirSync(dirname(resolvedPath), { recursive: true });
  const wasmPath = resolve(dirname(require.resolve('sql.js')), 'sql-wasm.wasm');
  const SQL = await initSqlJs({ locateFile: () => wasmPath });
  const existing = resolvedPath !== ':memory:' && existsSync(resolvedPath) ? new Uint8Array(readFileSync(resolvedPath)) : undefined;
  const db = new PersistentDatabase(new SQL.Database(existing), resolvedPath);
  db.pragma('foreign_keys = ON');
  db.exec(readFileSync(resolve(here, 'schema.sql'), 'utf8'));

  const insertSource = db.prepare(`
    INSERT OR IGNORE INTO sources (name, url, adapter_key, config_json, approved, is_demo, adapter_status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertSource.run('ScholarTrack demo catalog', 'https://example.org/scholartrack-demo', 'demo', '{}', 0, 1, 'demo_only');
  insertSource.run('Example public source A (not approved)', 'https://example.org/source-a', 'html-notices', '{}', 0, 0, 'not_configured');
  insertSource.run('Example public source B (not approved)', 'https://example.org/source-b', 'rss-notices', '{}', 0, 0, 'not_configured');

  const demoSource = db.prepare('SELECT source_id FROM sources WHERE url = ?').get('https://example.org/scholartrack-demo');
  const insertNotice = db.prepare(`
    INSERT OR IGNORE INTO scholarships (
      source_id, canonical_key, title, provider, url, education_level, programme,
      discipline, region, residency_rule, benefit_text, eligibility_excerpt,
      due_at, timezone, captured_at, verified_at, content_hash, notice_status, is_demo
    ) VALUES (
      @source_id, @canonical_key, @title, @provider, @url, @education_level, @programme,
      @discipline, @region, @residency_rule, @benefit_text, @eligibility_excerpt,
      @due_at, @timezone, @captured_at, @verified_at, @content_hash, @notice_status, 1
    )
  `);
  for (const record of demoRecords()) {
    insertNotice.run({
      ...record,
      source_id: demoSource.source_id,
      content_hash: `${record.canonical_key}-demo-v1`
    });
  }
  db.prepare("UPDATE scholarships SET notice_status = 'active' WHERE is_demo = 1 AND due_at IS NULL AND notice_status = 'unknown'").run();

  return db;
}

export function persistNotice(db, source, notice, capturedAt = new Date().toISOString()) {
  const existing = db.prepare('SELECT * FROM scholarships WHERE source_id = ? AND canonical_key = ?')
    .get(source.source_id, notice.canonical_key);
  const isNew = !existing;
  const nextStatus = notice.notice_status || 'active';
  const insert = db.prepare(`
    INSERT INTO scholarships (
      source_id, canonical_key, title, provider, url, notice_type, education_level,
      programme, discipline, region, residency_rule, benefit_text, eligibility_excerpt,
      due_at, timezone, captured_at, verified_at, content_hash, notice_status, is_demo
    ) VALUES (
      @source_id, @canonical_key, @title, @provider, @url, @notice_type, @education_level,
      @programme, @discipline, @region, @residency_rule, @benefit_text, @eligibility_excerpt,
      @due_at, @timezone, @captured_at, @verified_at, @content_hash, @notice_status, 0
    ) ON CONFLICT(source_id, canonical_key) DO UPDATE SET
      title = excluded.title, provider = excluded.provider, url = excluded.url,
      notice_type = excluded.notice_type, education_level = excluded.education_level,
      programme = excluded.programme, discipline = excluded.discipline, region = excluded.region,
      residency_rule = excluded.residency_rule, benefit_text = excluded.benefit_text,
      eligibility_excerpt = excluded.eligibility_excerpt,
      due_at = CASE WHEN excluded.due_at IS NULL THEN scholarships.due_at ELSE excluded.due_at END,
      timezone = excluded.timezone, captured_at = excluded.captured_at,
      verified_at = excluded.verified_at, content_hash = excluded.content_hash,
      notice_status = excluded.notice_status, updated_at = CURRENT_TIMESTAMP
  `);

  const record = {
    source_id: source.source_id,
    canonical_key: notice.canonical_key,
    title: notice.title,
    provider: notice.provider || 'Unknown provider',
    url: notice.url,
    notice_type: notice.notice_type || 'scholarship',
    education_level: notice.education_level || null,
    programme: notice.programme || null,
    discipline: notice.discipline || null,
    region: notice.region || null,
    residency_rule: notice.residency_rule || null,
    benefit_text: notice.benefit_text || null,
    eligibility_excerpt: notice.eligibility_excerpt || null,
    due_at: notice.due_at || null,
    timezone: notice.timezone || 'UTC',
    captured_at: capturedAt,
    verified_at: capturedAt,
    content_hash: notice.content_hash,
    notice_status: nextStatus
  };
  insert.run(record);
  const current = db.prepare('SELECT * FROM scholarships WHERE source_id = ? AND canonical_key = ?')
    .get(source.source_id, notice.canonical_key);

  if (isNew) {
    createAlert(db, current.notice_id, 'new_notice', `new:${current.notice_id}`, 'A new announcement was collected.');
    createApproachingAlert(db, current);
    return { record: current, changed: true, isNew: true };
  }

  const deadlineChanged = record.due_at && existing.due_at !== record.due_at;
  const statusChanged = existing.notice_status !== nextStatus;
  if (deadlineChanged) {
    db.prepare(`
      INSERT INTO change_history (notice_id, change_type, previous_deadline, updated_deadline, captured_at, details)
      VALUES (?, 'deadline_revised', ?, ?, ?, 'Source-reported deadline revision')
    `).run(existing.notice_id, existing.due_at, record.due_at, capturedAt);
    createAlert(
      db,
      existing.notice_id,
      'deadline_revised',
      `deadline:${existing.notice_id}:${existing.due_at}:${record.due_at}`,
      'The source reported a revised application deadline.'
    );
  }

  if (statusChanged) {
    const changeType = nextStatus === 'withdrawn' ? 'withdrawn' : 'reopened';
    db.prepare(`
      INSERT INTO change_history (notice_id, change_type, previous_status, updated_status, captured_at, details)
      VALUES (?, ?, ?, ?, ?, 'Source-reported announcement status change')
    `).run(existing.notice_id, changeType, existing.notice_status, nextStatus, capturedAt);
    if (nextStatus === 'withdrawn') {
      createAlert(db, existing.notice_id, 'withdrawn', `withdrawn:${existing.notice_id}:${capturedAt}`, 'The source marked this announcement as withdrawn.');
    }
  }

  createApproachingAlert(db, current);
  return { record: current, changed: Boolean(deadlineChanged || statusChanged || existing.content_hash !== record.content_hash), isNew: false };
}

function createAlert(db, noticeId, type, eventKey, message) {
  db.prepare(`
    INSERT OR IGNORE INTO alerts (notice_id, alert_type, event_key, message, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(noticeId, type, eventKey, message, new Date().toISOString());
}

function createApproachingAlert(db, notice) {
  if (!notice.due_at || notice.notice_status !== 'active') return;
  const daysRemaining = (new Date(notice.due_at).getTime() - Date.now()) / 86400000;
  if (daysRemaining < 0 || daysRemaining > 7) return;
  createAlert(
    db,
    notice.notice_id,
    'deadline_approaching',
    `approaching:${notice.notice_id}:${notice.due_at}`,
    'The application deadline is within seven days.'
  );
}