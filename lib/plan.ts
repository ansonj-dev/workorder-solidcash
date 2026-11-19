import { compileFile } from '@solidcash/solidc';
import { Contract } from '@solidcash/solidcash';
import { ElectrumNetworkProvider } from '@solidcash/solidcash/network/electrum';
import { binToHex, encodeCashAddress, hexToBin, ripemd160, secp256k1, sha256 } from '@bitauth/libauth';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const source = fileURLToPath(new URL('../contracts/WorkOrder.sol', import.meta.url));
let artifact: ReturnType<typeof compileFile>;
export function assertRefundHeight(tip: number, height: bigint) {
  if (!Number.isSafeInteger(tip) || tip < 0) throw new Error('The chain tip must be a verified nonnegative block height.');
  if (BigInt(tip) < height) throw new Error(`Refund block ${height} has not been reached (current tip ${tip}).`);
}
const integer = (value: unknown, name: string, minimum: bigint, maximum: bigint) => {
  if (!/^(0|[1-9][0-9]*)$/.test(String(value ?? ''))) throw new Error(`${name} must be a whole unsigned integer.`);
  const result = BigInt(String(value));
  if (result < minimum || result > maximum) throw new Error(`${name} must be between ${minimum} and ${maximum}.`);
  return result;
};

export function contractTerms(input: Record<string, unknown>) {
  const network = String(input.network ?? 'chipnet');
  if (!['chipnet', 'mainnet'].includes(network)) throw new Error('Choose Chipnet or mainnet.');
  const keys = ['client', 'maker', 'mediator'].map(role => {
    const hex = String(input[role] ?? '').toLowerCase();
    if (!/^(02|03)[0-9a-f]{64}$/.test(hex) || !secp256k1.validatePublicKey(hexToBin(hex))) {
      throw new Error(`${role} must be a valid compressed secp256k1 public key (66 hex characters).`);
    }
    return hex;
  });
  if (new Set(keys).size !== 3) throw new Error('Each role needs a different public key.');
  const height = integer(input.refundHeight, 'Refund block', 1n, 499999999n);
  const cap = integer(input.feeCap ?? '1800', 'Fee cap', 1n, 10000n);
  artifact ??= compileFile(source, { evmCompat: true });
  // Constructing the provider and contract is offline. No method on this provider is called here.
  const provider = new ElectrumNetworkProvider(network as 'chipnet' | 'mainnet', { manualConnectionManagement: true });
  const publicKeys = keys.map(hexToBin);
  const contract = new Contract(artifact, [...publicKeys, height, cap], { provider });
  if (contract.isStateful || contract.usesExternalLibraries) throw new Error('This planner supports only the standalone WorkOrder artifact.');
  if (contract.bytesize > 9000) throw new Error('Redeem script leaves insufficient room for signatures under the documented 10,000-byte input limit.');
  const addresses = publicKeys.map(key => encodeCashAddress({
    prefix: network === 'mainnet' ? 'bitcoincash' : 'bchtest', type: 'p2pkh',
    payload: ripemd160.hash(sha256.hash(key)), throwErrors: true,
  }).address);
  const scripts = publicKeys.map(key => `76a914${binToHex(ripemd160.hash(sha256.hash(key)))}88ac`);
  const summary = {
    network, contractAddress: contract.address,
    publicKeys: Object.fromEntries(['client', 'maker', 'mediator'].map((role, i) => [role, keys[i]])),
    payoutAddresses: { client: addresses[0], maker: addresses[1] },
    refundHeight: height.toString(), feeCapSats: cap.toString(), redeemScriptBytes: contract.bytesize,
    redeemScriptSha256: createHash('sha256').update(Buffer.from(contract.bytecode, 'hex')).digest('hex'),
  };
  return { summary, contract, provider, publicKeys, height, cap, scripts };
}

export function transactionPlan(input: Record<string, unknown>) {
  const { summary, scripts, cap, height } = contractTerms(input);
  const action = String(input.action ?? 'approve');
  if (!['approve', 'cancel', 'refund', 'resolve'].includes(action)) throw new Error('Choose approve, cancel, refund, or resolve.');
  const amount = integer(input.inputSats, 'Escrow satoshis', 576n, 2100000000000000n);
  const fee = integer(input.feeSats ?? cap.toString(), 'Fee', 1n, cap);
  const remainder = amount - fee;
  const txid = String(input.txid ?? '').toLowerCase();
  if (txid && !/^[0-9a-f]{64}$/.test(txid)) throw new Error('Funding transaction ID must be 64 hex characters.');
  const vout = input.vout === '' || input.vout === undefined ? null : Number(integer(input.vout, 'Funding output index', 0n, 4294967295n));
  const currentHeight = input.currentHeight === '' || input.currentHeight === undefined ? null : integer(input.currentHeight, 'Current block', 0n, 499999999n);
  const outputs: Array<{ index: number; role: string; address: string; lockingBytecode: string; satoshis: string }> = [];
  const output = (role: 'client' | 'maker', sats: bigint) => {
    if (sats < 546n) throw new Error('Each P2PKH payout must contain at least 546 sats. Increase the input amount or adjust the split.');
    outputs.push({ index: outputs.length, role, address: summary.payoutAddresses[role], lockingBytecode: scripts[role === 'client' ? 0 : 1], satoshis: sats.toString() });
  };
  if (action === 'resolve') {
    const maker = integer(input.makerSats, 'Maker award', 546n, amount);
    output('maker', maker); output('client', remainder - maker);
  } else output(action === 'approve' ? 'maker' : 'client', remainder);
  const warnings = [
    'Offline plan only: funding existence, value, token status, unspent status, and chain height are unverified.',
    'Only plain BCH is supported. Token-bearing funding can become stuck.',
    'After the refund block, approval, mediator resolution and refund can compete for the same UTXO.',
    'The fixed fee must be compared with the final signed transaction size; the documented relay floor is 1 sat/byte.',
  ];
  if (!txid || vout === null) warnings.push('A funding transaction ID and output index are still required.');
  if (action === 'refund') warnings.push(currentHeight === null ? 'Refund eligibility needs an independently verified current block.' : currentHeight < height ? 'Refund is not final yet: BCH height locktime must be below the candidate block height.' : 'Entered tip permits the refund in a later candidate block, but was not verified against a node.');
  return {
    format: 'workorder-plan-v1', ...summary, action,
    input: { txid: txid || null, vout, satoshis: amount.toString(), sequence: 4294967294 },
    outputs, feeSats: fee.toString(), locktime: action === 'refund' ? Number(height) : 0,
    requiredSigners: ['approve', 'cancel'].includes(action) ? ['client', 'maker'] : [action === 'refund' ? 'client' : 'mediator'],
    currentBlockEntered: currentHeight?.toString() ?? null,
    fundingReferenceComplete: Boolean(txid && vout !== null), broadcast: false, warnings,
  };
}
