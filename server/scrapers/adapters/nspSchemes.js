import axios from 'axios';
import * as cheerio from 'cheerio';
import { createHash } from 'node:crypto';

function parseIndianDate(value) {
  const match = value.match(/\b(\d{2})-(\d{2})-(\d{4})\b/);
  if (!match) return null;
  const [, dayText, monthText, yearText] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCDate() !== day || date.getUTCMonth() !== month - 1 || date.getUTCFullYear() !== year) return null;
  return new Date(Date.UTC(year, month - 1, day, 18, 29, 59, 999)).toISOString();
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function collectNspSchemes(source, _config = {}, client = axios) {
  const response = await client.get(source.url, {
    timeout: Number(process.env.SCRAPE_TIMEOUT_MS) || 10000,
    headers: { 'User-Agent': process.env.SCRAPE_USER_AGENT || 'ScholarTrack/1.0' },
    maxRedirects: 3
  });
  const $ = cheerio.load(response.data);

  return $('.accordion-body .row.mb-4.border-1.border-bottom').toArray()
    .map((element) => {
      const item = $(element);
      const title = item.find('h6').first().text().replace(/\s+/g, ' ').trim();
      if (!title) return null;

      const deadlineLabel = item.find('span').toArray()
        .map((span) => $(span).text().replace(/\s+/g, ' ').trim())
        .find((text) => /student application\s+open till/i.test(text));
      const dueAt = deadlineLabel ? parseIndianDate(deadlineLabel) : null;
      const specificationUrl = item.find('a').filter((_, link) => /specifications/i.test($(link).text())).first().attr('href');
      let url = source.url;
      if (specificationUrl) {
        try {
          url = new URL(specificationUrl, source.url).href;
        } catch {
          url = source.url;
        }
      }
      const status = dueAt && new Date(dueAt).getTime() < Date.now() ? 'closed' : 'active';
      const record = {
        canonical_key: `${source.url}#${slug(title)}`,
        title,
        provider: source.name,
        url,
        notice_type: /welfare based scheme/i.test(title) ? 'Welfare based scheme' : 'Merit based scheme',
        education_level: null,
        programme: null,
        discipline: null,
        region: 'India',
        residency_rule: null,
        benefit_text: null,
        eligibility_excerpt: null,
        due_at: dueAt,
        timezone: 'Asia/Kolkata',
        notice_status: status
      };
      record.content_hash = createHash('sha256').update(JSON.stringify(record)).digest('hex');
      return record;
    })
    .filter(Boolean);
}
