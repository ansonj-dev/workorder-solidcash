import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { ethers } from '@solidcash/solidhat/hardhat3';
import { Contract, SignatureTemplate, TransactionBuilder } from '@solidcash/solidcash';
import { MockNetworkProvider } from '@solidcash/solidcash/network/mock';
import { decodeTransaction, encodeCashAddress, hexToBin, ripemd160, sha256 } from '@bitauth/libauth';
import { assertRefundHeight, transactionPlan } from '../lib/plan';
import { localLifecycle } from '../lib/demo';

// Publicly known fixture scalars, exclusively for an in-memory ledger. No wallet secrets or network access.
const signer = (n: number) => new SignatureTemplate(Uint8Array.from({ length: 32 }, (_, i) => i === 31 ? n : 0));
const client = signer(1), maker = signer(2), mediator = signer(3), stranger = signer(4);
const address = (s: SignatureTemplate) => encodeCashAddress({ prefix: 'bchtest', type: 'p2pkh', payload: ripemd160.hash(sha256.hash(s.publicKey)), throwErrors: true }).address;
const artifact = JSON.parse(readFileSync(new URL('../artifacts/solidcash/solidcash/WorkOrder.json', import.meta.url), 'utf8'));
const amount = 250000n, fee = 1800n, refundHeight = 1000n;
const measurements: unknown[] = [];
let provider: MockNetworkProvider;
let contract: Contract;
let coin: { txid: string; vout: number; satoshis: bigint; token?: { category: string; amount: bigint } };

beforeAll(async () => {
  // Confirms the project is also discoverable through the actual SolidHat runtime/artifact loader.
  expect(await ethers.getContractFactory('WorkOrder')).toBeDefined();
});
beforeEach(async () => {
  provider = new MockNetworkProvider({ profile: 'production', updateUtxoSet: true });
  provider.reset();
  provider.setBlockHeight(1100);
  contract = new Contract(artifact, [client.publicKey, maker.publicKey, mediator.publicKey, refundHeight, fee], { provider });
  coin = await provider.seedUtxo(contract.address, { txid: 'ab'.repeat(32), vout: 0, satoshis: amount });
});
afterAll(() => {
  mkdirSync('artifacts', { recursive: true });
  writeFileSync('artifacts/local-vm-measurements.json', JSON.stringify({ mockOnly: true, toolchain: 'SolidHat 0.51.1 / Vitest 5.0.4', measurements }, null, 2));
});

const approve = (clientSigner = client, makerSigner = maker, destination = address(maker), payout = amount - fee) => new TransactionBuilder({ provider })
  .addInput(coin, contract.unlock.approve(clientSigner, makerSigner))
  .addOutput({ to: destination, amount: payout });

function measure(details: { hex: string }, path: string) {
  const bytes = hexToBin(details.hex);
  const decoded = decodeTransaction(bytes);
  if (typeof decoded === 'string') throw new Error(decoded);
  expect(bytes.length).toBeLessThanOrEqual(100000);
  expect(decoded.inputs[0].unlockingBytecode.length).toBeLessThanOrEqual(10000);
  expect(fee >= BigInt(bytes.length)).toBe(true);
  measurements.push({ mockOnly: true, path, redeemScriptBytes: contract.bytesize, transactionBytes: bytes.length, unlockingBytes: decoded.inputs[0].unlockingBytecode.length, feeSats: fee.toString() });
}

describe('WorkOrder spend paths in the SolidHat environment / production-limit mock BCH VM', () => {
  it('joint approval pays the fixed maker and consumes the funding output', async () => {
    const details = await approve().send();
    measure(details, 'approve');
    expect(await contract.getUtxos()).toHaveLength(0);
    expect((await provider.getUtxos(address(maker))).some(u => u.satoshis === amount - fee)).toBe(true);
  });
  it('joint cancellation returns funds to the client before the timeout', async () => {
    provider.setBlockHeight(900);
    const details = await new TransactionBuilder({ provider })
      .addInput(coin, contract.unlock.cancel(client, maker))
      .addOutput({ to: address(client), amount: amount - fee }).send();
    measure(details, 'cancel');
    expect(await contract.getUtxos()).toHaveLength(0);
    expect((await provider.getUtxos(address(client))).some(u => u.satoshis === amount - fee)).toBe(true);
  });
  it('rejects unilateral cancellation by the client', async () => {
    await expect(new TransactionBuilder({ provider })
      .addInput(coin, contract.unlock.cancel(client, stranger))
      .addOutput({ to: address(client), amount: amount - fee }).send()).rejects.toThrow();
  });
  it('rejects cancellation redirected away from the client', async () => {
    await expect(new TransactionBuilder({ provider })
      .addInput(coin, contract.unlock.cancel(client, maker))
      .addOutput({ to: address(maker), amount: amount - fee }).send()).rejects.toThrow();
  });
  it.each([['client', stranger, maker], ['maker', client, stranger]] as const)('rejects an incorrect %s signature', async (_, a, b) => {
    await expect(approve(a, b).send()).rejects.toThrow();
  });
  it('rejects approval redirected to another address', async () => {
    await expect(approve(client, maker, address(stranger)).send()).rejects.toThrow();
  });
  it('rejects a payout that exceeds the agreed fee cap by one satoshi', async () => {
    await expect(approve(client, maker, address(maker), amount - fee - 1n).send()).rejects.toThrow();
  });
  it.each([[0n, 1000n], [10001n, 1000n], [1800n, 0n]] as const)('shared order policy rejects cap %s / refund height %s on approval', async (cap, height) => {
    const invalid = new Contract(artifact, [client.publicKey, maker.publicKey, mediator.publicKey, height, cap], { provider });
    const funded = await provider.seedUtxo(invalid.address, { txid: 'bc'.repeat(32), vout: 0, satoshis: amount });
    await expect(new TransactionBuilder({ provider })
      .addInput(funded, invalid.unlock.approve(client, maker))
      .addOutput({ to: address(maker), amount: amount - fee }).send()).rejects.toThrow();
  });
  it('refunds to the client at a reached locktime with nonfinal sequence', async () => {
    const details = await new TransactionBuilder({ provider })
      .addInput(coin, contract.unlock.refund(client), { sequence: 0xfffffffe })
      .addOutput({ to: address(client), amount: amount - fee }).setLocktime(Number(refundHeight)).send();
    measure(details, 'refund');
    expect((await provider.getUtxos(address(client))).some(u => u.satoshis === amount - fee)).toBe(true);
  });
  it('rejects an early refund locktime', async () => {
    await expect(new TransactionBuilder({ provider })
      .addInput(coin, contract.unlock.refund(client), { sequence: 0xfffffffe })
      .addOutput({ to: address(client), amount: amount - fee }).setLocktime(Number(refundHeight - 1n)).send()).rejects.toThrow();
  });
  it('documents mock finality limitation and rejects early refund in the shared client preflight', async () => {
    provider.setBlockHeight(900);
    expect(() => assertRefundHeight(900, refundHeight)).toThrow('has not been reached');
    // Script CLTV validates the encoded locktime; a node's transaction-finality gate also checks its tip.
    // This provider currently omits that second gate, even under the production profile.
    await expect(new TransactionBuilder({ provider })
      .addInput(coin, contract.unlock.refund(client), { sequence: 0xfffffffe })
      .addOutput({ to: address(client), amount: amount - fee }).setLocktime(Number(refundHeight)).send()).resolves.toHaveProperty('txid');
  });
  it('rejects an incorrect client signature on refund', async () => {
    await expect(new TransactionBuilder({ provider })
      .addInput(coin, contract.unlock.refund(stranger), { sequence: 0xfffffffe })
      .addOutput({ to: address(client), amount: amount - fee }).setLocktime(Number(refundHeight)).send()).rejects.toThrow();
  });
  it('rejects a refund with final input sequence', async () => {
    await expect(new TransactionBuilder({ provider })
      .addInput(coin, contract.unlock.refund(client), { sequence: 0xffffffff })
      .addOutput({ to: address(client), amount: amount - fee }).setLocktime(Number(refundHeight)).send()).rejects.toThrow();
  });
  it('mediator splits only between the fixed maker and client', async () => {
    const makerAward = 148920n;
    const details = await new TransactionBuilder({ provider })
      .addInput(coin, contract.unlock.resolve(mediator, makerAward))
      .addOutput({ to: address(maker), amount: makerAward })
      .addOutput({ to: address(client), amount: amount - fee - makerAward }).send();
    measure(details, 'resolve');
    expect((await provider.getUtxos(address(client))).some(u => u.satoshis === amount - fee - makerAward)).toBe(true);
  });
  it('rejects mediator redirection of the client award', async () => {
    await expect(new TransactionBuilder({ provider })
      .addInput(coin, contract.unlock.resolve(mediator, 100000n))
      .addOutput({ to: address(maker), amount: 100000n })
      .addOutput({ to: address(stranger), amount: amount - fee - 100000n }).send()).rejects.toThrow();
  });
  it('rejects a split signed by a party other than the mediator', async () => {
    await expect(new TransactionBuilder({ provider })
      .addInput(coin, contract.unlock.resolve(client, 100000n))
      .addOutput({ to: address(maker), amount: 100000n })
      .addOutput({ to: address(client), amount: amount - fee - 100000n }).send()).rejects.toThrow();
  });
  it('rejects a mismatched maker award argument', async () => {
    await expect(new TransactionBuilder({ provider })
      .addInput(coin, contract.unlock.resolve(mediator, 100001n))
      .addOutput({ to: address(maker), amount: 100000n })
      .addOutput({ to: address(client), amount: amount - fee - 100000n }).send()).rejects.toThrow();
  });
  it('rejects a conflicting settlement of the spent UTXO', async () => {
    await approve().send();
    await expect(new TransactionBuilder({ provider })
      .addInput(coin, contract.unlock.refund(client), { sequence: 0xfffffffe })
      .addOutput({ to: address(client), amount: amount - fee }).setLocktime(Number(refundHeight)).send()).rejects.toThrow();
  });
  it('rejects a token-bearing funding input even when its tokens are preserved', async () => {
    const token = { category: 'cd'.repeat(32), amount: 1n };
    const tokenAddress = encodeCashAddress({ prefix: 'bchtest', type: 'p2pkhWithTokens', payload: ripemd160.hash(sha256.hash(maker.publicKey)), throwErrors: true }).address;
    const tokenCoin = await provider.seedUtxo(contract.address, { txid: 'ef'.repeat(32), vout: 0, satoshis: amount, token });
    await expect(new TransactionBuilder({ provider })
      .addInput(tokenCoin, contract.unlock.approve(client, maker))
      .addOutput({ to: tokenAddress, amount: amount - fee, token }).send()).rejects.toThrow();
  });
});

describe('public planning review boundary', () => {
  const terms = { client: Buffer.from(client.publicKey).toString('hex'), maker: Buffer.from(maker.publicKey).toString('hex'), mediator: Buffer.from(mediator.publicKey).toString('hex'), refundHeight: '1000', feeCap: '1800', inputSats: '250000', feeSats: '1800' };
  it('derives the same real contract and payout scripts as the execution fixture', () => {
    const plan = transactionPlan(terms);
    expect(plan.contractAddress).toBe(contract.address);
    expect(plan.outputs[0].address).toBe(address(maker));
    expect(plan.outputs[0].satoshis).toBe('248200');
    expect(plan.broadcast).toBe(false);
    expect(plan.fundingReferenceComplete).toBe(false);
  });
  it('rejects duplicate role keys and split dust', () => {
    expect(() => transactionPlan({ ...terms, maker: terms.client })).toThrow('different public key');
    expect(() => transactionPlan({ ...terms, action: 'resolve', makerSats: '248000' })).toThrow('546 sats');
  });
  it('reports the input sequence and locktime actually used by the SDK builder', () => {
    const plan = transactionPlan(terms);
    const transaction = approve().buildLibauthTransaction();
    expect(plan.input.sequence).toBe(transaction.inputs[0].sequenceNumber);
    expect(plan.locktime).toBe(transaction.locktime);
  });
  it('plans cancellation as a joint-signature client payout with no timeout', () => {
    const plan = transactionPlan({ ...terms, action: 'cancel' });
    expect(plan.outputs[0].address).toBe(address(client));
    expect(plan.requiredSigners).toEqual(['client', 'maker']);
    expect(plan.locktime).toBe(0);
  });
});

it('runs the same local lifecycle function exposed by the UI without chain broadcast', async () => {
  const demo = await localLifecycle();
  expect(demo.chainBroadcast).toBe(false);
  expect(demo.paths.map(p => p.action)).toEqual(['approve', 'cancel', 'refund', 'resolve']);
  for (const path of demo.paths) {
    expect(path.vmAccepted).toBe(true);
    expect(path.remainingEscrowOutputs).toBe(0);
    expect(path.payouts.reduce((sum, p) => sum + BigInt(p.satoshis), 0n)).toBe(248200n);
  }
});
