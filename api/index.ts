import type { VercelRequest, VercelResponse } from '@vercel/node';
import express from 'express';
import apiRoutes from '../server/routes.js';
import { initCockroachSchema } from '../server/db.js';
import { gzipMiddleware } from '../server/gzipMiddleware.js';

const app = express();

app.use(gzipMiddleware);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health check endpoint
app.get(['/api/health', '/health', '/healthz'], (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount existing API routes directly
app.use('/api', apiRoutes);

// Optional fallback if called directly as /api
app.use('/', apiRoutes);

// Init schema asynchronously
initCockroachSchema().catch(err => {
  console.log('CockroachDB schema check on serverless invoke');
});

export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req as any, res as any);
}
