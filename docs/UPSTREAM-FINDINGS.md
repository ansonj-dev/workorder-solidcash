# SolidCash / SolidHat observations

These are local findings, not submitted upstream issues or PRs. No compiler defect was observed in WorkOrder: compilation and all tested signature/covenant paths behave as expected.

## SC-WIN-01: Windows test launcher does not start Vitest

Observed on Node v24.21.0, Windows, `@solidcash/testing` / `@solidcash/solidhat` 0.51.1.

`packages/testing/src/builtin-tasks.ts` invokes `spawnSync('npx', ['vitest', 'run', ...])` without Windows command resolution and does not report `res.error`. In this environment the exact diagnostic is:

```js
import { spawnSync } from 'node:child_process';
const result = spawnSync('npx', ['--version']);
console.log(result.status, result.error?.code); // null, ENOENT
```

The original `solidhat test` compiles successfully, exits 1 and prints no Vitest output. `npx.cmd vitest run --config vitest.solidhat.config.ts` starts the same suite correctly.

Local fix: a Windows-only task override in `scripts/windows-test-task.ts` resolves the installed Vitest manifest, launches its `vitest.mjs` entry with `process.execPath`, preserves configured test paths/network, and surfaces process creation errors. It retains SolidHat's normal compile and HRE flow, plus the official SolidHat preset. No dependency files were edited.

Candidate upstream change: replace the package-runner process with the installed Vitest entrypoint and explicitly throw `res.error`. See `solidcash-windows-launcher.patch`. This candidate was not applied to upstream, and its full upstream regression suite was not run. The equivalent project workaround passed the 20-test WorkOrder suite.

## SC-MOCK-02: height finality is not established by the production-limit mock

Reproduction is retained in `test/workorder.test.ts`, named "documents mock finality limitation and rejects early refund in the shared client preflight".

1. Create `MockNetworkProvider({ profile: 'production', updateUtxoSet: true })`.
2. Seed a plain BCH WorkOrder fixture and set mock tip to 900.
3. Encode a correctly signed refund with contract refund height 1000, transaction locktime 1000 and sequence `0xfffffffe`.
4. `TransactionBuilder.send()` accepts it in this local mock.

The script's CLTV lower-bound rule is satisfied, while a real node's separate transaction-finality check should refuse inclusion before the required candidate height. An invalid encoded locktime of 999 and final input sequence are both rejected by the script as expected. No on-chain bypass or compiler fault is being claimed.

The CLI calls the tested shared `assertRefundHeight` guard using the provider's current chain tip. Public plans warn that entered heights are unverified. The local VM demo discloses this mock limitation in its returned report. A real-node finality check remains a manual gate. A complete upstream fix needs owner review of the mock/indexer finality boundary and both height/MTP semantics; no speculative dependency patch is included.

