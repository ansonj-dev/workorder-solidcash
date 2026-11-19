import { defineConfig } from '@solidcash/solidhat/config';
import './scripts/windows-test-task.ts';
export default defineConfig({
  paths: { contracts: 'contracts', artifacts: 'artifacts/solidcash', tests: 'test' },
  compiler: { evmCompat: true },
  mnemonic: process.env.SOLIDCASH_MNEMONIC,
  accounts: { count: 3, satoshis: 1000000n },
  networks: {
    mock: { type: 'mock', consensus: { maximumInputBytes: 10000, maximumNftCommitmentBytes: 128 }, policy: { enforceDust: true } },
    chipnet: { type: 'electrum', network: 'chipnet' },
    mainnet: { type: 'electrum', network: 'mainnet' },
  },
  defaultNetwork: 'mock',
});
