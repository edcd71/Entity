import {execFile} from 'node:child_process';
import {access, mkdir, writeFile} from 'node:fs/promises';
import {homedir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';
import {applyLauncherIcon} from './apply-launcher-icon.mjs';

const run = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const runtime = path.join(root, '.entity-runtime');
const target = path.join(homedir(), 'Desktop', 'Entity.app');
const shellQuote = value => "'" + value.replaceAll("'", "'\\''") + "'";
const appleString = value => '"' + value.replaceAll('\\', '\\\\').replaceAll('"', '\\"') + '"';

try {
  await access(target);
  throw new Error(`${target} already exists. Move it aside before installing another launcher.`);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

await mkdir(runtime, {recursive: true});
const source = path.join(runtime, 'entity-launcher.applescript');
await writeFile(source, `on run
  try
    do shell script ${appleString('/bin/bash ' + shellQuote(path.join(root, 'scripts/launch-entity.sh')))}
  on error messageText
    display alert "Entity could not open" message messageText as critical buttons {"OK"} default button 1
  end try
end run
`);
await run('/usr/bin/osacompile', ['-o', target, source]);
const plist = path.join(target, 'Contents/Info.plist');
for (const [key, type, value] of [['CFBundleIdentifier', 'string', 'local.entity.launcher'], ['LSUIElement', 'bool', 'true']]) {
  try { await run('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plist]); }
  catch { await run('/usr/libexec/PlistBuddy', ['-c', `Add :${key} ${type} ${value}`, plist]); }
}
await applyLauncherIcon(target);
console.log(`Created ${target}`);
