import {spawn} from 'node:child_process';
import {open, readFile, mkdir, unlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));

// Match this checkout, so a different application on the same port is never reused.
async function probe(url, expected) {
  let response;
  try {
    response = await fetch(url, {signal: AbortSignal.timeout(1200), redirect: 'error'});
  } catch (error) {
    if (error.cause?.code === 'ECONNREFUSED') return false;
    throw new Error(`Cannot reach Entity at ${url}. Port ${new URL(url).port} may be in use.`, {cause: error});
  }
  if (response.status !== 200 || await response.text() !== expected) {
    throw new Error(`Port ${new URL(url).port} is serving something other than this Entity project. Close that server and try again.`);
  }
  return true;
}

function processExists(pid) {
  try { process.kill(pid, 0); return true; }
  catch (error) { return error.code !== 'ESRCH'; }
}

export async function ensureServer({port = 4173, runtime = path.join(root, '.entity-runtime')} = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid Entity port.');
  const url = `http://127.0.0.1:${port}/app/grid.html`;
  const expected = await readFile(path.join(root, 'app/grid.html'), 'utf8');
  if (await probe(url, expected)) return {url, started: false};

  await mkdir(runtime, {recursive: true});
  const lockPath = path.join(runtime, `launch-${port}.lock`);
  const deadline = Date.now() + 10000;
  let lock;
  // Coordinate simultaneous launches and recover a lock left by an interrupted launcher.
  while (!lock) {
    try {
      lock = await open(lockPath, 'wx', 0o600);
      await lock.writeFile(String(process.pid));
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const owner = Number(await readFile(lockPath, 'utf8').catch(() => ''));
      if (owner > 0 && !processExists(owner)) await unlink(lockPath).catch(() => {});
      if (await probe(url, expected)) return {url, started: false};
      if (Date.now() > deadline) throw new Error('Another Entity launch is still starting. Please try again.');
      await delay(100);
    }
  }

  try {
    if (await probe(url, expected)) return {url, started: false};
    const logPath = path.join(runtime, `server-${port}.log`);
    const log = await open(logPath, 'a', 0o600);
    let child;
    let failure;
    try {
      child = spawn(process.execPath, [path.join(root, 'scripts/serve.mjs')], {
        cwd: root,
        env: {...process.env, PORT: String(port)},
        detached: true,
        stdio: ['ignore', log.fd, log.fd],
      });
      child.on('error', error => { failure = error; });
      child.unref();
    } finally { await log.close(); }

    while (Date.now() < deadline) {
      if (await probe(url, expected)) return {url, started: true, pid: child.pid};
      if (failure || child.exitCode !== null) break;
      await delay(100);
    }
    // Only stop the process this launch created; never stop an existing server.
    if (child.pid && child.exitCode === null) child.kill();
    throw new Error(`Entity's server could not start. See ${logPath}${failure ? ': ' + failure.message : ''}`);
  } finally {
    await lock.close();
    await unlink(lockPath).catch(() => {});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const {url} = await ensureServer();
    // Chrome forwards this command to its existing process, creating a window
    // every time. Keep the applet alive until that handoff completes. A cold
    // Chrome process stays running, so release it after its startup interval.
    await new Promise((resolve, reject) => {
      const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', ['--new-window', url], {
        detached: true,
        stdio: 'ignore',
      });
      const startup = setTimeout(() => { chrome.unref(); resolve(); }, 5000);
      chrome.once('error', error => { clearTimeout(startup); reject(error); });
      chrome.once('exit', code => {
        clearTimeout(startup);
        if (code === 0) resolve();
        else reject(new Error(`Chrome could not open Entity (exit ${code}).`));
      });
    });
    console.log(`Entity is open in a new Chrome window: ${url}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
