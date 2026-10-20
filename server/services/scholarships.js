import { addDays } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';

const validFilter = (value) => typeof value === 'string' && value.trim() ? value.trim() : null;

export function listScholarships(db, query = {}) {
  const clauses = ['1 = 1'];
  const params = {};
  const search = validFilter(query.q);
  if (search) {
    clauses.push('(s.title LIKE @search OR s.provider LIKE @search OR s.eligibility_excerpt LIKE @search)');
    params.search = `%${search}%`;
  }
  const filters = [
    ['level', 'education_level'],
    ['programme', 'programme'],
    ['category', 'notice_type'],
    ['discipline', 'discipline'],
    ['region', 'region'],
    ['source', 'source_id']
  ];
  for (const [parameter, field] of filters) {
    const value = validFilter(query[parameter]);
    if (value) {
      clauses.push(`s.${field} = @${parameter}`);
      params[parameter] = value;
    }
  }
  let timeZone = validFilter(query.timezone) || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    timeZone = 'UTC';
  }
  const isDateOnly = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
  if (isDateOnly(query.from)) {
    clauses.push('s.due_at >= @from');
    params.from = fromZonedTime(`${query.from}T00:00:00`, timeZone).toISOString();
  }
  if (isDateOnly(query.to)) {
    clauses.push('s.due_at < @to');
    const nextDate = addDays(new Date(`${query.to}T00:00:00Z`), 1).toISOString().slice(0, 10);
    params.to = fromZonedTime(`${nextDate}T00:00:00`, timeZone).toISOString();
  }
  if (query.status === 'active') clauses.push("s.notice_status = 'active'");
  if (query.status === 'unknown') clauses.push('s.due_at IS NULL');
  if (query.status === 'closed' || query.status === 'withdrawn') {
    clauses.push('s.notice_status = @status');
    params.status = query.status;
  }

  const orderBy = query.sort === 'updated'
    ? 's.updated_at DESC'
    : query.sort === 'title'
      ? 's.title COLLATE NOCASE ASC'
      : 'CASE WHEN s.due_at IS NULL THEN 1 ELSE 0 END, s.due_at ASC';

  return db.prepare(`
    SELECT s.*, src.name AS source_name, src.is_demo AS source_is_demo
    FROM scholarships s JOIN sources src ON src.source_id = s.source_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY ${orderBy}
  `).all(params);
}

export function getScholarshipFilterOptions(db) {
  const distinctValues = (field) => db.prepare(`
    SELECT DISTINCT ${field} AS value
    FROM scholarships
    WHERE ${field} IS NOT NULL AND TRIM(CAST(${field} AS TEXT)) <> ''
    ORDER BY value COLLATE NOCASE
  `).all().map((row) => row.value);

  return {
    level: distinctValues('education_level'),
    programme: distinctValues('programme'),
    category: distinctValues('notice_type'),
    discipline: distinctValues('discipline'),
    region: distinctValues('region'),
    sources: db.prepare(`
      SELECT DISTINCT src.source_id, src.name
      FROM sources src JOIN scholarships s ON s.source_id = src.source_id
      ORDER BY src.name COLLATE NOCASE
    `).all()
  };
}

export function getScholarship(db, id) {
  const scholarship = db.prepare(`
    SELECT s.*, src.name AS source_name, src.url AS source_url, src.approved AS source_approved
    FROM scholarships s JOIN sources src ON src.source_id = s.source_id
    WHERE s.notice_id = ?
  `).get(id);
  if (!scholarship) return null;
  scholarship.history = db.prepare('SELECT * FROM change_history WHERE notice_id = ? ORDER BY captured_at DESC').all(id);
  return scholarship;
}

export function getDashboard(db) {
  const notices = db.prepare(`
    SELECT s.*, src.name AS source_name
    FROM scholarships s JOIN sources src ON src.source_id = s.source_id
    WHERE s.notice_status = 'active'
    ORDER BY CASE WHEN s.due_at IS NULL THEN 1 ELSE 0 END, s.due_at ASC
  `).all();
  const now = Date.now();
  const days = (iso) => (new Date(iso).getTime() - now) / 86400000;
  const upcoming = notices.filter((notice) => notice.due_at && days(notice.due_at) >= 0 && days(notice.due_at) <= 60);
  const run = db.prepare("SELECT completed_at FROM collection_runs WHERE status = 'success' ORDER BY completed_at DESC LIMIT 1").get();
  const lastCheckedAt = run?.completed_at ? new Date(run.completed_at) : null;
  const freshness = lastCheckedAt
    ? Date.now() - lastCheckedAt.getTime() <= 86400000 ? 'checked within 24 hours' : 'stale cached data'
    : 'demo data only';
  const recentAlerts = db.prepare(`
    SELECT a.*, s.title, s.url, s.is_demo, s.notice_status
    FROM alerts a LEFT JOIN scholarships s ON s.notice_id = a.notice_id
    ORDER BY a.created_at DESC LIMIT 5
  `).all();
  return {
    stats: {
      total: notices.length,
      upcoming: upcoming.length,
      closingSoon: notices.filter((notice) => notice.due_at && days(notice.due_at) >= 0 && days(notice.due_at) <= 14).length,
      updated: db.prepare("SELECT COUNT(DISTINCT notice_id) AS count FROM alerts WHERE alert_type IN ('deadline_revised', 'new_notice')").get().count,
      unknownDeadlines: notices.filter((notice) => !notice.due_at).length
    },
    deadlines: upcoming.slice(0, 6),
    notices: notices.slice(0, 6),
    recentAlerts,
    lastSuccessfulRefresh: run?.completed_at || null,
    freshness
  };
}

export function getAlerts(db) {
  return db.prepare(`
    SELECT a.*, s.title, s.url, s.due_at, s.timezone, s.is_demo, s.notice_status,
      src.name AS source_name, src.approved AS source_approved
    FROM alerts a LEFT JOIN scholarships s ON s.notice_id = a.notice_id
    LEFT JOIN sources src ON src.source_id = s.source_id
    ORDER BY a.created_at DESC
  `).all();
}