import type { IncomingMessage, ServerResponse } from 'node:http';
import { localLifecycle } from '../lib/demo.js';

function sendJson(res: ServerResponse, status: number, value: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(value));
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use POST.' });
  try {
    return sendJson(res, 200, await localLifecycle());
  } catch (error) {
    return sendJson(res, 400, {
      error: error instanceof Error ? error.message : 'Local demo failed.',
    });
  }
}
