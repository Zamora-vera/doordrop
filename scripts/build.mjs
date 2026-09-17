import { cpSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function runNode(script, args) {
  execFileSync(process.execPath, [resolve(root, script), ...args], {
    cwd: root,
    stdio: 'inherit'
  });
}

// Keep the source entrypoint as the canonical template while preserving the
// existing deployment contract: the generated dist files are also published
// at the application root for the production container.
const sourceIndex = resolve(root, 'index.source.html');
const index = resolve(root, 'index.html');
if (existsSync(sourceIndex)) cpSync(sourceIndex, index, { force: true });

runNode('node_modules/vite/bin/vite.js', ['build']);
runNode('node_modules/esbuild/bin/esbuild', ['server.ts', '--bundle', '--platform=node', '--format=cjs', '--packages=external', '--sourcemap', '--outfile=dist/server.cjs']);

const dist = resolve(root, 'dist');
if (existsSync(dist)) {
  for (const entry of readdirSync(dist)) {
    cpSync(resolve(dist, entry), resolve(root, entry), { recursive: true, force: true });
  }
}
if (existsSync(sourceIndex)) cpSync(sourceIndex, index, { force: true });
