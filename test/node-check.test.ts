import { describe, expect, it } from 'vitest';
import { encodeTransaction, binToHex } from '@bitauth/libauth';
import { checkRegtestAcceptance, regtestEndpoint } from '../lib/node-check';

const raw = binToHex(encodeTransaction({ version: 2, locktime: 0,
  inputs: [{ outpointIndex: 0, outpointTransactionHash: new Uint8Array(32).fill(1), sequenceNumber: 0xfffffffe, unlockingBytecode: new Uint8Array([0x51]) }],
  outputs: [{ valueSatoshis: 1000n, lockingBytecode: new Uint8Array([0x51]) }],
}));

describe('read-only real-node acceptance boundary', () => {
  it('permits only a loopback endpoint without credentials in its URL', () => {
    expect(regtestEndpoint('http://127.0.0.1:18443').hostname).toBe('127.0.0.1');
    for (const value of ['https://example.com', 'http://example.com', 'http://user:secret@localhost:18443']) expect(() => regtestEndpoint(value)).toThrow();
  });
  it('calls only chain identity and non-broadcast acceptance methods', async () => {
    const calls: string[] = [];
    const report = await checkRegtestAcceptance(raw, async (method, params) => {
      calls.push(method);
      if (method === 'getblockchaininfo') return { chain: 'regtest', blocks: 1100, bestblockhash: 'ab'.repeat(32) };
      expect(params).toEqual([[raw]]);
      return [{ allowed: true }];
    });
    expect(calls).toEqual(['getblockchaininfo', 'testmempoolaccept']);
    expect(report.allowed).toBe(true); expect(report.broadcast).toBe(false); expect(report.mempoolSubmission).toBe(false);
  });
  it('refuses mainnet before passing raw bytes to an acceptance method', async () => {
    const calls: string[] = [];
    await expect(checkRegtestAcceptance(raw, async method => { calls.push(method); return { chain: 'main' }; })).rejects.toThrow('not regtest');
    expect(calls).toEqual(['getblockchaininfo']);
  });
  it('retains node rejection without claiming an accepted transaction', async () => {
    const report = await checkRegtestAcceptance(raw, async method => method === 'getblockchaininfo' ? { chain:'regtest', blocks:900 } : [{allowed:false, 'reject-reason':'non-final'}]);
    expect(report.allowed).toBe(false); expect(report.rejection).toBe('non-final');
  });
  it('rejects malformed transaction bytes before any node request', async () => {
    let calls = 0;
    await expect(checkRegtestAcceptance('00', async () => { calls++; })).rejects.toThrow('decode');
    expect(calls).toBe(0);
  });
  it('rejects a node response that does not include an explicit acceptance decision', async () => {
    await expect(checkRegtestAcceptance(raw, async method => method === 'getblockchaininfo' ? { chain:'regtest' } : [{ txid:'ab'.repeat(32) }])).rejects.toThrow('unambiguous acceptance');
  });
});
