import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

export function commandInvocation(command, args, { nodePath = process.execPath,
  npmCli = process.env.npm_execpath } = {}) {
  if (command === 'node') return [nodePath, args];
  if (command !== 'npm') return [command, args];
  // npm.cmd cannot be spawned as a native executable on Windows. Invoke npm's
  // JavaScript entry with Node, without a shell or interpolation of arguments.
  const candidates = [npmCli,
    resolve(dirname(nodePath), 'node_modules/npm/bin/npm-cli.js'),
    resolve(dirname(nodePath), '../lib/node_modules/npm/bin/npm-cli.js'),
    resolve(dirname(nodePath), '../share/nodejs/npm/bin/npm-cli.js')];
  const cli = candidates.find(path => typeof path === 'string' && path.endsWith('npm-cli.js') &&
    (path === npmCli || existsSync(path)));
  if (!cli) throw new Error('NPM_CLI_UNAVAILABLE: run the tool through npm run.');
  return [nodePath, [cli, ...args]];
}

export function runCommand(command, args, options) {
  const [executable, argv] = commandInvocation(command, args);
  return spawnSync(executable, argv, { ...options, shell: false });
}
