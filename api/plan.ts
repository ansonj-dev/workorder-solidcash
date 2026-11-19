import type { IncomingMessage, ServerResponse } from 'node:http';
import { transactionPlan } from '../lib/plan.js';

interface JsonRequest extends IncomingMessage {
  body?: unknown;
}

function sendJson(res: ServerResponse, status: number, value: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(value));
}

export default function handler(req: JsonRequest, res: ServerResponse) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Use POST.' });
  const input = req.body;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return sendJson(res, 400, { error: 'Expected a JSON object.' });
  }
  try {
    return sendJson(res, 200, transactionPlan(input as Record<string, unknown>));
  } catch (error) {
    return sendJson(res, 400, {
      error: error instanceof Error ? error.message : 'Unable to create plan.',
    });
  }
}
