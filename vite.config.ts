import { defineConfig } from 'vite';
import { transactionPlan } from './lib/plan';
import { localLifecycle } from './lib/demo';

let demoRunning = false;

function installPlanEndpoint(server: any) {
  server.middlewares.use('/api/demo', async (req: any, res: any) => {
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ error: 'Use POST.' })); return; }
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) { res.statusCode = 403; res.end(JSON.stringify({ error: 'Same-origin requests only.' })); return; }
    if (demoRunning) { res.statusCode = 409; res.end(JSON.stringify({ error: 'A local VM lifecycle is already running.' })); return; }
    demoRunning = true;
    try { res.end(JSON.stringify(await localLifecycle())); }
    catch (error) { res.statusCode = 400; res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Local demo failed.' })); }
    finally { demoRunning = false; }
  });
  server.middlewares.use('/api/plan', async (req: any, res: any) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ error: 'Use POST.' })); return; }
    // This is a loopback development tool. Reject cross-origin browser requests.
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) { res.statusCode = 403; res.end(JSON.stringify({ error: 'Same-origin requests only.' })); return; }
    try {
      let body = '';
      for await (const chunk of req) {
        body += chunk;
        if (Buffer.byteLength(body) > 12000) { res.statusCode = 413; res.end(JSON.stringify({ error: 'Request is too large.' })); return; }
      }
      const input = JSON.parse(body);
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Expected a JSON object.');
      res.end(JSON.stringify(transactionPlan(input)));
    } catch (error) { res.statusCode = 400; res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Unable to create plan.' })); }
  });
}
export default defineConfig({
  server: { host: '127.0.0.1' }, preview: { host: '127.0.0.1' },
  plugins: [{ name: 'workorder-public-plan', configureServer: installPlanEndpoint, configurePreviewServer: installPlanEndpoint }],
});
