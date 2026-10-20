import express from 'express';
import cors from 'cors';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getAlerts, getDashboard, getScholarship, getScholarshipFilterOptions, listScholarships } from './services/scholarships.js';
import { runCollection } from './scrapers/collector.js';

export function createApp(db) {
  const app = express();
  const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',').map((origin) => origin.trim()).filter(Boolean);
  app.use(cors({
    origin(origin, callback) {
      callback(null, !origin || allowedOrigins.includes(origin));
    }
  }));
  app.use(express.json({ limit: '100kb' }));

  app.get('/api/health', (_request, response) => response.json({ status: 'ok' }));
  app.get('/api/dashboard', (_request, response) => response.json(getDashboard(db)));
  app.get('/api/scholarships', (request, response) => response.json(listScholarships(db, request.query)));
  app.get('/api/scholarships/filters', (_request, response) => response.json(getScholarshipFilterOptions(db)));
  app.get('/api/scholarships/:id', (request, response) => {
    const item = getScholarship(db, Number(request.params.id));
    if (!item) return response.status(404).json({ error: 'Scholarship not found.' });
    return response.json(item);
  });
  app.get('/api/alerts', (_request, response) => response.json(getAlerts(db)));

  app.get('/api/admin/status', (_request, response) => {
    const sources = db.prepare('SELECT * FROM sources ORDER BY source_id').all().map((source) => ({
      ...source,
      config_json: undefined,
      approved: Boolean(source.approved),
      is_demo: Boolean(source.is_demo)
    }));
    const runs = db.prepare(`
      SELECT r.*, s.name AS source_name FROM collection_runs r
      LEFT JOIN sources s ON s.source_id = r.source_id
      ORDER BY r.started_at DESC LIMIT 25
    `).all();
    return response.json({
      sources,
      runs,
      publicScrapingEnabled: process.env.ENABLE_PUBLIC_SCRAPING === 'true',
      lastSuccessfulRefresh: db.prepare("SELECT completed_at FROM collection_runs WHERE status = 'success' ORDER BY completed_at DESC LIMIT 1").get()?.completed_at || null,
      failedCount: db.prepare("SELECT COUNT(*) AS count FROM collection_runs WHERE status = 'failed'").get().count
    });
  });
  app.post('/api/admin/sources', (request, response) => {
    const { name, url, adapterKey, selectors, approvalConfirmed } = request.body || {};
    if (!approvalConfirmed) return response.status(400).json({ error: 'Confirm the source rights and crawl-policy review before adding it.' });
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 120) {
      return response.status(400).json({ error: 'Enter a source name under 120 characters.' });
    }
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return response.status(400).json({ error: 'Enter a valid HTTPS source URL.' });
    }
    if (parsedUrl.protocol !== 'https:') return response.status(400).json({ error: 'Approved sources must use HTTPS.' });
    if (!['html-notices', 'rss-notices', 'nsp-schemes'].includes(adapterKey)) {
      return response.status(400).json({ error: 'Choose a supported HTML, RSS, or NSP public-schemes adapter.' });
    }
    if (selectors !== undefined && (!selectors || typeof selectors !== 'object' || Array.isArray(selectors) || JSON.stringify(selectors).length > 4000)) {
      return response.status(400).json({ error: 'Source selectors must be a JSON object under 4 KB.' });
    }
    const cleanSelectors = {};
    for (const [key, value] of Object.entries(selectors || {})) {
      if (typeof value !== 'string' || value.length > 240) return response.status(400).json({ error: 'Each CSS selector must be a string under 240 characters.' });
      cleanSelectors[key] = value;
    }
    try {
      const result = db.prepare(`
        INSERT INTO sources (name, url, adapter_key, config_json, approved, is_demo, adapter_status)
        VALUES (?, ?, ?, ?, 1, 0, 'configured')
      `).run(name.trim(), parsedUrl.href, adapterKey, JSON.stringify({ selectors: cleanSelectors }));
      const source = db.prepare('SELECT source_id, name, url, adapter_key, approved, is_demo, adapter_status, last_checked_at FROM sources WHERE source_id = ?').get(result.lastInsertRowid);
      return response.status(201).json({ ...source, approved: true, is_demo: false });
    } catch (error) {
      if (String(error.message).includes('UNIQUE')) return response.status(409).json({ error: 'That source URL is already registered.' });
      throw error;
    }
  });
  app.post('/api/admin/refresh', async (_request, response, next) => {
    try {
      const result = await runCollection(db);
      return response.status(result.status === 'skipped' ? 200 : 202).json(result);
    } catch (error) {
      return next(error);
    }
  });
  app.post('/api/admin/retry/:sourceId', async (request, response, next) => {
    try {
      const result = await runCollection(db, { sourceId: Number(request.params.sourceId) });
      return response.status(result.status === 'failed' ? 502 : 200).json(result);
    } catch (error) {
      return next(error);
    }
  });

  const clientDist = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  const clientIndex = resolve(clientDist, 'index.html');
  if (existsSync(clientIndex)) {
    app.use(express.static(clientDist));
    app.get(/^(?!\/api\/).*/, (_request, response) => response.sendFile(clientIndex));
  }
  app.use((_request, response) => response.status(404).json({ error: 'API route not found.' }));
  app.use((error, _request, response, _next) => {
    console.error('API error:', error.message);
    response.status(500).json({ error: 'The request could not be completed.' });
  });
  return app;
}