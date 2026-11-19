import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { checkRegtestAcceptance, regtestEndpoint } from '../lib/node-check';

const input = process.argv[2];
if (!input) throw new Error('Usage: npm run node:check -- <signed-transaction.hex>. Requires a separately prepared regtest transaction and a local BCHN regtest node.');
const url = regtestEndpoint(process.env.REGTEST_RPC_URL ?? 'http://127.0.0.1:18443');
const user = process.env.REGTEST_RPC_USER, password = process.env.REGTEST_RPC_PASSWORD;
const rawHex = readFileSync(input, 'utf8').trim();
let id = 0;
const report = await checkRegtestAcceptance(rawHex, async (method, params) => {
  const response = await fetch(url, {
    method: 'POST', signal: AbortSignal.timeout(10000), redirect: 'error',
    headers: { 'Content-Type': 'application/json', ...(user && password ? { Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}` } : {}) },
    body: JSON.stringify({ jsonrpc: '1.0', id: ++id, method, params }),
  });
  if (!response.ok) throw new Error(`Regtest RPC returned HTTP ${response.status}. Check the local node and credentials.`);
  const result = await response.json();
  if (result.error) throw new Error(`Regtest RPC ${method} failed (code ${result.error.code}).`);
  return result.result;
});
mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/regtest-acceptance.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (!report.allowed) process.exitCode = 1;
