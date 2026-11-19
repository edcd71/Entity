import assert from 'node:assert/strict';
import http from 'node:http';
import {execFile} from 'node:child_process';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {promisify} from 'node:util';
import {ensureServer} from './launch-entity.mjs';

const run = promisify(execFile);
const runtime = await mkdtemp(path.join(tmpdir(), 'entity-launcher-'));
const placeholder = http.createServer((req, res) => res.end('Another app'));
const listen = () => new Promise(resolve => placeholder.listen(0, '127.0.0.1', resolve));
const close = () => new Promise(resolve => placeholder.close(resolve));
let ownedPid;
try {
  await listen();
  const port = placeholder.address().port;
  await assert.rejects(ensureServer({port, runtime}), /something other than this Entity project/);
  assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(), 'Another app');
  await close();

  // Separate launcher processes must coordinate and leave one detached server alive.
  const script = `import {ensureServer} from ${JSON.stringify(new URL('./launch-entity.mjs', import.meta.url).href)};
    console.log(JSON.stringify(await ensureServer(${JSON.stringify({port, runtime})})));`;
  const launch = () => run(process.execPath, ['--input-type=module', '-e', script], {timeout: 15000});
  const results = (await Promise.all([launch(), launch()])).map(result => JSON.parse(result.stdout));
  const started = results.filter(result => result.started);
  // Record owned children before assertions so failures still clean them up.
  ownedPid = started[0]?.pid;
  assert.equal(started.length, 1, 'Only one server should start for concurrent launches');
  process.kill(ownedPid, 0);
  assert.equal(await (await fetch(results[0].url)).text(), await (await fetch(results[1].url)).text());
  assert.equal((await fetch(`http://127.0.0.1:${port}/app/grid.js`)).status, 200);
  assert.equal((await fetch(`http://127.0.0.1:${port}/media/grid/index.json`)).status, 200);
  const reused = await ensureServer({port, runtime});
  assert.equal(reused.started, false);
  assert.equal(reused.url, `http://127.0.0.1:${port}/app/grid.html`);
  console.log('Passed: cold start, concurrent launches, detached server survival, repeat-launch reuse, grid assets, and occupied-port protection.');
} finally {
  if (ownedPid) {try {process.kill(ownedPid, 'SIGTERM');} catch {}}
  if (placeholder.listening) await close();
  await rm(runtime, {recursive: true, force: true});
}
