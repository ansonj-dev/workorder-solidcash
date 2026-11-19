import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { compileFile } from '@solidcash/solidc';
import { BitcoinRpcNetworkProvider, Contract, Network, SignatureTemplate, TransactionBuilder } from '@solidcash/solidcash';
import { decodeTransaction, encodeCashAddress, hexToBin, ripemd160, sha256 } from '@bitauth/libauth';
import { checkRegtestAcceptance } from '../lib/node-check';

// Disposable local regtest only. This script funds a fresh contract on the isolated node,
// mines the funding transaction, signs a settlement with generated test keys, then asks
// testmempoolaccept to inspect valid and invalid spends. It never broadcasts a settlement.
const root = process.cwd();
const toolDir = join(root, 'tooling', 'solidcash-regtest-data');
const rpcConfig = readFileSync(join(toolDir, 'bitcoin.conf'), 'utf8');
const configValue = (name: string) => rpcConfig.match(new RegExp(`^${name}=(.+)$`, 'm'))?.[1];
const rpcUser = configValue('rpcuser');
const rpcPassword = configValue('rpcpassword');
if (!rpcUser || !rpcPassword) throw new Error('Local BCHN RPC credentials are missing from the ignored regtest config.');

const rpcUrl = 'http://127.0.0.1:18443';
let requestId = 0;
async function rpc(method: string, params: unknown[] = []) {
  const response = await fetch(rpcUrl, {
    method: 'POST', signal: AbortSignal.timeout(15000), redirect: 'error',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${rpcUser}:${rpcPassword}`).toString('base64')}`,
    },
    body: JSON.stringify({ jsonrpc: '1.0', id: ++requestId, method, params }),
  });
  if (!response.ok) throw new Error(`Local BCHN RPC returned HTTP ${response.status}.`);
  const payload = await response.json() as { result: any; error: { code: number; message: string } | null };
  if (payload.error) throw new Error(`Local BCHN ${method} failed (${payload.error.code}): ${payload.error.message}`);
  return payload.result;
}

const chain = await rpc('getblockchaininfo');
if (chain.chain !== 'regtest') throw new Error('Refusing to run outside local BCHN regtest.');
const refundHeight = BigInt(chain.blocks) + 20n;
const config = JSON.parse(readFileSync(join(toolDir, 'workorder-test-keys.json'), 'utf8')) as Record<string, { pubkey: string; address: string; wif: string }>;
const roles = ['client', 'maker', 'mediator'] as const;
for (const role of roles) {
  const key = config[role];
  if (!key || !/^(02|03)[0-9a-f]{64}$/i.test(key.pubkey) || !key.wif) throw new Error(`Local disposable ${role} key is missing.`);
  const signer = new SignatureTemplate(key.wif);
  if (Buffer.from(signer.publicKey).toString('hex') !== key.pubkey.toLowerCase()) throw new Error(`Local ${role} keypair does not match.`);
}

const provider = new BitcoinRpcNetworkProvider(Network.REGTEST, rpcUrl, { rpcUser, rpcPassword });
const artifact = compileFile(join(root, 'contracts', 'WorkOrder.sol'), { evmCompat: true });
const contract = new Contract(artifact, [
  hexToBin(config.client.pubkey), hexToBin(config.maker.pubkey), hexToBin(config.mediator.pubkey), refundHeight, 10000n,
], { provider });

// Import only this generated contract address into the local throwaway wallet, then fund it
// with regtest coins. `importaddress` is local wallet bookkeeping and does not touch a network.
await rpc('importaddress', [contract.address, 'solidcash-workorder-regtest', false]);
const fundTxid = await rpc('sendtoaddress', [contract.address, 0.01]);
const miningAddress = config.client.address;
await rpc('generatetoaddress', [1, miningAddress]);
const utxo = (await contract.getUtxos()).find(candidate => candidate.txid === fundTxid);
if (!utxo || utxo.satoshis !== 1_000_000n || utxo.token) throw new Error('Funded contract UTXO was not found as the expected plain BCH amount.');

const payoutAddress = (role: 'client' | 'maker') => encodeCashAddress({
  prefix: 'bchreg', type: 'p2pkh',
  payload: ripemd160.hash(sha256.hash(hexToBin(config[role].pubkey))), throwErrors: true,
}).address;
const builder = () => new TransactionBuilder({ provider, maximumFeeSatoshis: 10000n });
const client = new SignatureTemplate(config.client.wif);
const maker = new SignatureTemplate(config.maker.wif);
const mediator = new SignatureTemplate(config.mediator.wif);
const remainder = utxo.satoshis - 10000n;
const makeApproval = (to: string, secondSigner = maker) => builder()
  .addInput(utxo, contract.unlock.approve(client, secondSigner))
  .addOutput({ to, amount: remainder })
  .build();
const approvalHex = makeApproval(payoutAddress('maker'));
const cancelHex = builder().addInput(utxo, contract.unlock.cancel(client, maker))
  .addOutput({ to: payoutAddress('client'), amount: remainder }).build();
const resolveHex = builder().addInput(utxo, contract.unlock.resolve(mediator, 400000n))
  .addOutput({ to: payoutAddress('maker'), amount: 400000n })
  .addOutput({ to: payoutAddress('client'), amount: 590000n }).build();
const wrongResolveHex = builder().addInput(utxo, contract.unlock.resolve(mediator, 400000n))
  .addOutput({ to: payoutAddress('client'), amount: 400000n })
  .addOutput({ to: payoutAddress('client'), amount: 590000n }).build();
const refundBuilder = (sequence: number) => builder()
  .addInput(utxo, contract.unlock.refund(client), { sequence })
  .addOutput({ to: payoutAddress('client'), amount: remainder })
  .setLocktime(Number(refundHeight));
const earlyRefundHex = refundBuilder(0xfffffffe).build();
const disabledRefundHex = refundBuilder(0xffffffff).build();
const validBytes = hexToBin(approvalHex);
const decoded = decodeTransaction(validBytes);
if (typeof decoded === 'string') throw new Error('Built approval transaction did not decode.');
mkdirSync(join(root, 'artifacts', 'regtest'), { recursive: true });
writeFileSync(join(root, 'artifacts', 'regtest', 'approval-review.hex'), approvalHex, { mode: 0o600 });
writeFileSync(join(root, 'artifacts', 'regtest', 'redirected-output-review.hex'), makeApproval(payoutAddress('client')), { mode: 0o600 });
writeFileSync(join(root, 'artifacts', 'regtest', 'cancel-review.hex'), cancelHex, { mode: 0o600 });
writeFileSync(join(root, 'artifacts', 'regtest', 'resolve-review.hex'), resolveHex, { mode: 0o600 });

const inspect = (hex: string) => checkRegtestAcceptance(hex, (method, params) => rpc(method, params));
const approval = await inspect(approvalHex);
const cancellation = await inspect(cancelHex);
const resolution = await inspect(resolveHex);
const redirected = await inspect(makeApproval(payoutAddress('client')));
const wrongSigner = await inspect(makeApproval(payoutAddress('maker'), mediator));
const redirectedResolution = await inspect(wrongResolveHex);
const earlyRefund = await inspect(earlyRefundHex);
const disabledRefund = await inspect(disabledRefundHex);

// A refund is valid only after the block-height locktime is final. Mine 100 more local
// regtest blocks; this is isolated test data, not a public-chain action.
await rpc('generatetoaddress', [100, miningAddress]);
const finalRefundHex = refundBuilder(0xfffffffe).build();
const finalRefund = await inspect(finalRefundHex);
const nodeVersion = await rpc('getnetworkinfo');
const report = {
  format: 'solidcash-workorder-bchn-regtest-v1',
  nodeVersion: nodeVersion.subversion,
  chain: chain.chain,
  upgradeStatus: chain.upgrade_status,
  relayPolicy: { acceptnonstdtxn: false },
  startingHeight: chain.blocks,
  finalHeight: await rpc('getblockcount'),
  refundHeight: refundHeight.toString(),
  fundingTxid: fundTxid,
  contractAddress: contract.address,
  contractScriptSha256: (await import('node:crypto')).createHash('sha256').update(Buffer.from(contract.bytecode, 'hex')).digest('hex'),
  fundingSats: utxo.satoshis.toString(),
  checks: {
    approve: { txid: approval.txid, bytes: approval.transactionBytes, inputUnlockingBytes: approval.inputUnlockingBytes, allowed: approval.allowed, rejection: approval.rejection },
    mutualCancel: { txid: cancellation.txid, allowed: cancellation.allowed, rejection: cancellation.rejection },
    mediatorResolve: { txid: resolution.txid, allowed: resolution.allowed, rejection: resolution.rejection },
    redirectedApproval: { txid: redirected.txid, allowed: redirected.allowed, rejection: redirected.rejection },
    wrongApprovalSigner: { txid: wrongSigner.txid, allowed: wrongSigner.allowed, rejection: wrongSigner.rejection },
    redirectedMediatorPayout: { txid: redirectedResolution.txid, allowed: redirectedResolution.allowed, rejection: redirectedResolution.rejection },
    refundBeforeHeight: { txid: earlyRefund.txid, allowed: earlyRefund.allowed, rejection: earlyRefund.rejection },
    refundWithFinalSequenceDisabled: { txid: disabledRefund.txid, allowed: disabledRefund.allowed, rejection: disabledRefund.rejection },
    refundAfterHeight: { txid: finalRefund.txid, allowed: finalRefund.allowed, rejection: finalRefund.rejection },
  },
  broadcast: false,
  settlementMempoolSubmission: false,
  localFundingAndMining: true,
  note: 'Disposable local BCHN regtest only. Funding was mined to this generated contract. Approval, mutual cancellation, mediator settlement, and post-height refund were accepted by testmempoolaccept. Redirected payouts, an incorrect approval signer, early refund and disabled refund sequence were expected to fail. No settlement was submitted or broadcast.',
};
writeFileSync(join(root, 'artifacts', 'regtest', 'workorder-node-acceptance.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (
  !approval.allowed || !cancellation.allowed || !resolution.allowed || !finalRefund.allowed ||
  redirected.allowed || wrongSigner.allowed || redirectedResolution.allowed || earlyRefund.allowed || disabledRefund.allowed
) process.exitCode = 1;
