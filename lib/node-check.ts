import { decodeTransaction, hexToBin } from '@bitauth/libauth';
import { createHash } from 'node:crypto';

type Rpc = (method: 'getblockchaininfo' | 'testmempoolaccept', params: unknown[]) => Promise<any>;
export function regtestEndpoint(value: string) {
  const url = new URL(value);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || url.username || url.password) {
    throw new Error('Use a loopback HTTP regtest RPC URL without embedded credentials.');
  }
  return url;
}

// testmempoolaccept checks node policy/consensus without submitting the transaction to its mempool.
// The injected RPC seam makes the non-broadcast method boundary independently testable.
export async function checkRegtestAcceptance(rawHex: string, rpc: Rpc) {
  if (!/^(?:[0-9a-fA-F]{2})+$/.test(rawHex)) throw new Error('Expected complete transaction hex.');
  const bytes = hexToBin(rawHex);
  const transaction = decodeTransaction(bytes);
  if (typeof transaction === 'string') throw new Error('Unable to decode the transaction.');
  if (bytes.length > 100000 || transaction.inputs.some(input => input.unlockingBytecode.length > 10000)) throw new Error('Transaction exceeds documented standard size or input limits.');
  const chain = await rpc('getblockchaininfo', []);
  if (chain?.chain !== 'regtest') throw new Error('Refusing acceptance inspection: the RPC server is not regtest.');
  const decisions = await rpc('testmempoolaccept', [[rawHex]]);
  if (!Array.isArray(decisions) || decisions.length !== 1 || typeof decisions[0]?.allowed !== 'boolean') throw new Error('Node did not return one unambiguous acceptance decision.');
  const hash = createHash('sha256').update(bytes).digest();
  const txid = Buffer.from(createHash('sha256').update(hash).digest()).reverse().toString('hex');
  return {
    format: 'workorder-regtest-acceptance-v1', chain: chain.chain, nodeHeight: chain.blocks,
    bestBlockHash: chain.bestblockhash, txid, transactionBytes: bytes.length,
    inputUnlockingBytes: transaction.inputs.map(input => input.unlockingBytecode.length),
    allowed: decisions[0].allowed, rejection: decisions[0]['reject-reason'] ?? decisions[0].error ?? null,
    broadcast: false, mempoolSubmission: false, mainnetExecuted: false, contractAssociationVerified: false,
    note: 'Read-only node acceptance inspection. It neither broadcasts nor mines. Acceptance applies only to this regtest tip/UTXO set and policy. Independently associate the supplied bytes with the reviewed WorkOrder source, funding reference and plan.',
  };
}
