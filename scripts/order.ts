import { SignatureTemplate, TransactionBuilder } from '@solidcash/solidcash';
import { decodeTransaction, hexToBin } from '@bitauth/libauth';
import { mkdirSync, writeFileSync } from 'node:fs';
import { assertRefundHeight, contractTerms, transactionPlan } from '../lib/plan';

const action = process.argv[2] ?? 'address';
if (!['address', 'plan', 'approve', 'cancel', 'refund', 'resolve'].includes(action)) {
  throw new Error('Use address, plan [approve|cancel|refund|resolve], approve, cancel, refund, or resolve.');
}
const input = {
  network: process.env.BCH_NETWORK ?? 'chipnet',
  client: process.env.CLIENT_PUBKEY, maker: process.env.MAKER_PUBKEY, mediator: process.env.MEDIATOR_PUBKEY,
  refundHeight: process.env.REFUND_HEIGHT, feeCap: process.env.FEE_CAP_SATS ?? '1800',
  inputSats: process.env.ORDER_SATS, feeSats: process.env.FEE_SATS ?? '1800',
  makerSats: process.env.MAKER_SATS, currentHeight: process.env.CURRENT_HEIGHT,
  txid: process.env.ORDER_TXID, vout: process.env.ORDER_VOUT,
  action: action === 'plan' ? process.argv[3] ?? 'approve' : action,
};

if (action === 'address') {
  console.log(JSON.stringify(contractTerms(input).summary, null, 2));
} else if (action === 'plan') {
  // Only public parameters are read. No connection, private key, signing or broadcasting.
  console.log(JSON.stringify(transactionPlan(input), null, 2));
} else {
  const { contract, provider, publicKeys, height, cap } = contractTerms(input);
  if (!/^[0-9a-fA-F]{64}$/.test(input.txid ?? '') || !/^(0|[1-9][0-9]*)$/.test(input.vout ?? '') || Number(input.vout) > 4294967295) {
    throw new Error('Set the exact ORDER_TXID (64 hex) and ORDER_VOUT (unsigned integer).');
  }
  let connected = false;
  try {
    await provider.connect(); connected = true;
    const utxo = (await contract.getUtxos()).find(u => u.txid === input.txid?.toLowerCase() && u.vout === Number(input.vout));
    if (!utxo) throw new Error('The selected escrow output is missing or already spent. Recheck network, terms, transaction ID and output index.');
    if (utxo.token) throw new Error('This output carries tokens. WorkOrder supports plain BCH only; refusing to build.');
    const currentHeight = await provider.getBlockHeight();
    if (action === 'refund') assertRefundHeight(currentHeight, height);
    const plan = transactionPlan({ ...input, inputSats: utxo.satoshis.toString(), currentHeight: String(currentHeight) });
    const signer = (role: string, key: Uint8Array) => {
      const secret = process.env[`${role}_WIF`];
      if (!secret) throw new Error(`Set ${role}_WIF in the local shell. Never enter a private key in the planner.`);
      const signer = new SignatureTemplate(secret);
      if (Buffer.from(signer.publicKey).toString('hex') !== Buffer.from(key).toString('hex')) throw new Error(`${role}_WIF does not match the agreed public key.`);
      return signer;
    };
    const builder = new TransactionBuilder({ provider, maximumFeeSatoshis: cap });
    if (action === 'approve') builder.addInput(utxo, contract.unlock.approve(signer('CLIENT', publicKeys[0]), signer('MAKER', publicKeys[1])));
    else if (action === 'cancel') builder.addInput(utxo, contract.unlock.cancel(signer('CLIENT', publicKeys[0]), signer('MAKER', publicKeys[1])));
    else if (action === 'refund') builder.addInput(utxo, contract.unlock.refund(signer('CLIENT', publicKeys[0])), { sequence: plan.input.sequence }).setLocktime(plan.locktime);
    else builder.addInput(utxo, contract.unlock.resolve(signer('MEDIATOR', publicKeys[2]), BigInt(plan.outputs[0].satoshis)));
    for (const output of plan.outputs) builder.addOutput({ to: output.address, amount: BigInt(output.satoshis) });
    const hex = await builder.build();
    const bytes = hexToBin(hex);
    const decoded = decodeTransaction(bytes);
    if (typeof decoded === 'string') throw new Error('Builder returned an invalid transaction encoding.');
    if (bytes.length > 100000 || decoded.inputs.some(i => i.unlockingBytecode.length > 10000)) throw new Error('Signed transaction exceeds documented BCH standard transaction or consensus input limits.');
    if (BigInt(plan.feeSats) < BigInt(bytes.length)) throw new Error(`Fee is below the documented 1 sat/byte relay floor: ${bytes.length} bytes, ${plan.feeSats} sats. Choose a higher fee within the agreed cap.`);
    mkdirSync('artifacts', { recursive: true });
    writeFileSync('artifacts/signed-review.hex', hex, { mode: 0o600 });
    writeFileSync('artifacts/transaction-review.json', JSON.stringify({ ...plan, byteLength: bytes.length, fundingCheckedAtHeight: currentHeight }, null, 2));
    console.log('Created artifacts/signed-review.hex and artifacts/transaction-review.json. Independently inspect both before broadcasting. No broadcast performed.');
  } finally { if (connected) await provider.disconnect(); }
}
