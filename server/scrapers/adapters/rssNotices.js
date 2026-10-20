import axios from 'axios';
import * as cheerio from 'cheerio';
import { createHash } from 'node:crypto';

function text(node, selector) {
  return node.find(selector).first().text().replace(/\s+/g, ' ').trim() || null;
}

export async function collectRssNotices(source, config, client = axios) {
  const response = await client.get(source.url, {
    timeout: Number(process.env.SCRAPE_TIMEOUT_MS) || 10000,
    headers: { 'User-Agent': process.env.SCRAPE_USER_AGENT || 'ScholarTrack/1.0' },
    maxRedirects: 3
  });
  const $ = cheerio.load(response.data, { xml: true });
  const records = [];
  $('item, entry').each((_, item) => {
    const node = $(item);
    const title = text(node, 'title');
    const url = text(node, 'link') || node.find('link').attr('href');
    if (!title || !url) return;
    const absoluteUrl = new URL(url, source.url).href;
    const due = text(node, 'deadline, dueDate, due_at');
    const record = {
      canonical_key: absoluteUrl,
      title,
      provider: config.provider || source.name,
      url: absoluteUrl,
      notice_type: config.noticeType || 'scholarship',
      education_level: text(node, 'educationLevel'),
      programme: text(node, 'programme'),
      discipline: text(node, 'discipline'),
      region: text(node, 'region'),
      residency_rule: text(node, 'residency'),
      benefit_text: text(node, 'benefit'),
      eligibility_excerpt: text(node, 'eligibility, description'),
      due_at: due && !Number.isNaN(Date.parse(due)) ? new Date(due).toISOString() : null,
      timezone: config.timezone || 'UTC',
      notice_status: /withdrawn|cancelled/i.test(node.text()) ? 'withdrawn' : 'active'
    };
    record.content_hash = createHash('sha256').update(JSON.stringify(record)).digest('hex');
    records.push(record);
  });
  return records;
}