import axios from 'axios';
import * as cheerio from 'cheerio';
import { createHash } from 'node:crypto';

function normalizeDeadline(value) {
  if (!value) return null;
  const timestamp = Date.parse(value.trim());
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function clean(value) {
  return value?.replace(/\s+/g, ' ').trim() || null;
}

function toNotice(item, source, selectors) {
  const title = clean(item.find(selectors.title).first().text());
  const rawUrl = item.find(selectors.link).first().attr('href');
  if (!title || !rawUrl) return null;

  let url;
  try {
    url = new URL(rawUrl, source.url).href;
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(new URL(url).protocol)) return null;
  const rawDeadline = selectors.deadline ? item.find(selectors.deadline).first().attr('datetime') || item.find(selectors.deadline).first().text() : null;
  const record = {
    canonical_key: url,
    title,
    provider: clean(item.find(selectors.provider).first().text()) || source.name,
    url,
    notice_type: clean(item.find(selectors.noticeType).first().text()) || 'scholarship',
    education_level: clean(item.find(selectors.educationLevel).first().text()),
    programme: clean(item.find(selectors.programme).first().text()),
    discipline: clean(item.find(selectors.discipline).first().text()),
    region: clean(item.find(selectors.region).first().text()),
    residency_rule: clean(item.find(selectors.residency).first().text()),
    benefit_text: clean(item.find(selectors.benefit).first().text()),
    eligibility_excerpt: clean(item.find(selectors.eligibility).first().text()),
    due_at: normalizeDeadline(rawDeadline),
    timezone: selectors.timezone || 'UTC',
    notice_status: /withdrawn|cancelled/i.test(item.text()) ? 'withdrawn' : 'active'
  };
  record.content_hash = createHash('sha256').update(JSON.stringify(record)).digest('hex');
  return record;
}

export async function collectHtmlNotices(source, config, client = axios) {
  const response = await client.get(source.url, {
    timeout: Number(process.env.SCRAPE_TIMEOUT_MS) || 10000,
    headers: { 'User-Agent': process.env.SCRAPE_USER_AGENT || 'ScholarTrack/1.0' },
    maxRedirects: 3
  });
  const $ = cheerio.load(response.data);
  const selectors = {
    item: '.scholarship-notice',
    title: '.title',
    link: 'a',
    provider: '.provider',
    noticeType: '.notice-type',
    educationLevel: '.education-level',
    programme: '.programme',
    discipline: '.discipline',
    region: '.region',
    residency: '.residency',
    benefit: '.benefit',
    eligibility: '.eligibility',
    deadline: 'time.deadline',
    ...config.selectors
  };
  return $(selectors.item).toArray()
    .map((element) => toNotice($(element), source, selectors))
    .filter(Boolean);
}

export { normalizeDeadline };