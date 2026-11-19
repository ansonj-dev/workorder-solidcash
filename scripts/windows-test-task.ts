import { task } from '@solidcash/testing';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// @solidcash/testing 0.51.1 launches `npx` without a Windows-compatible command resolver.
// Keep SolidHat's normal compile/HRE/preset flow and launch the installed Vitest entry with Node.
if (process.platform === 'win32') {
  task('test').setAction(async (args, hre) => {
    const require = createRequire(import.meta.url);
    const vitest = resolve(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
    const config = resolve('vitest.solidhat.config.ts');
    const result = spawnSync(process.execPath, [vitest, 'run', '--config', config, '--root', process.cwd(), ...(args.paths ?? [])], {
      stdio: 'inherit', env: { ...process.env, SOLIDCASH_NETWORK: hre.network.name },
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exitCode = result.status ?? 1;
    return { status: result.status };
  });
}
