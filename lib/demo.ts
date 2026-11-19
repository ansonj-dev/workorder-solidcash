import { Contract, SignatureTemplate, TransactionBuilder } from '@solidcash/solidcash';
import { MockNetworkProvider } from '@solidcash/solidcash/network/mock';
import { decodeTransaction, hexToBin } from '@bitauth/libauth';
import { contractTerms, transactionPlan } from './plan.js';

// These public fixture scalars are never wallet secrets and never leave the local in-memory ledger.
export async function localLifecycle() {
  const signers = [1, 2, 3].map(n => new SignatureTemplate(Uint8Array.from({ length: 32 }, (_, i) => i === 31 ? n : 0)));
  const [client, maker, mediator] = signers;
  const terms = {
    network: 'chipnet', client: Buffer.from(client.publicKey).toString('hex'),
    maker: Buffer.from(maker.publicKey).toString('hex'), mediator: Buffer.from(mediator.publicKey).toString('hex'),
    refundHeight: '1000', feeCap: '1800', inputSats: '250000', feeSats: '1800', makerSats: '148920', currentHeight: '1100',
  };
  const paths = [];
  for (const action of ['approve', 'cancel', 'refund', 'resolve']) {
    const provider = new MockNetworkProvider({ profile: 'production', updateUtxoSet: true });
    provider.reset(); provider.setBlockHeight(1100);
    const compiled = contractTerms(terms);
    const contract = new Contract(compiled.contract.artifact, compiled.contract.constructorArgs, { provider });
    const coin = await provider.seedUtxo(contract.address, { txid: 'ab'.repeat(32), vout: 0, satoshis: 250000n });
    const plan = transactionPlan({ ...terms, action, txid: coin.txid, vout: String(coin.vout) });
    const builder = new TransactionBuilder({ provider });
    if (action === 'approve') builder.addInput(coin, contract.unlock.approve(client, maker));
    else if (action === 'cancel') builder.addInput(coin, contract.unlock.cancel(client, maker));
    else if (action === 'refund') builder.addInput(coin, contract.unlock.refund(client), { sequence: 0xfffffffe }).setLocktime(1000);
    else builder.addInput(coin, contract.unlock.resolve(mediator, 148920n));
    for (const output of plan.outputs) builder.addOutput({ to: output.address, amount: BigInt(output.satoshis) });
    const result = await builder.send();
    const decoded = decodeTransaction(hexToBin(result.hex));
    if (typeof decoded === 'string') throw new Error(decoded);
    const remainingEscrowOutputs = (await contract.getUtxos()).length;
    const payouts = [];
    for (const output of plan.outputs) {
      const received = await provider.getUtxos(output.address);
      payouts.push({ role: output.role, satoshis: received.reduce((sum, coin) => sum + coin.satoshis, 0n).toString() });
    }
    paths.push({ action, vmAccepted: true, remainingEscrowOutputs, payouts, transactionBytes: result.hex.length / 2, unlockingBytes: decoded.inputs[0].unlockingBytecode.length, feeSats: '1800' });
  }
  return { mode: 'in-memory BCH VM only', publicFixtureKeys: true, chainBroadcast: false, mainnetExecuted: false, limitsProfile: 'production', finalityCaveat: 'Mock VM omits the node chain-tip finality gate; node-level finality still needs regtest or Chipnet.', paths };
}
