import {execFile} from 'node:child_process';
import {copyFile, cp, mkdir, stat, utimes} from 'node:fs/promises';
import {homedir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const run = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const target = path.join(homedir(), 'Desktop', 'Entity.app');

export async function applyLauncherIcon(app) {
  const plist = path.join(app, 'Contents/Info.plist');
  const {stdout} = await run('/usr/libexec/PlistBuddy', ['-c', 'Print :CFBundleIdentifier', plist]);
  if (stdout.trim() !== 'local.entity.launcher') throw new Error('This app is not the Entity launcher.');
  await copyFile(path.join(root, 'assets/branding/entity.icns'), path.join(app, 'Contents/Resources/entity.icns'));
  await run('/usr/libexec/PlistBuddy', ['-c', 'Set :CFBundleIconFile entity.icns', plist]);
  await run('/usr/bin/codesign', ['--force', '--sign', '-', app]);
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
  const now = new Date();
  await utimes(app, now, now);
  await run('/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister', ['-f', app]);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const backup = path.join(root, '.entity-runtime/Entity-before-icon.app');
  await mkdir(path.dirname(backup), {recursive: true});
  if (!await stat(backup).catch(() => null)) await cp(target, backup, {recursive: true, errorOnExist: true, force: false});
  await applyLauncherIcon(target);
  console.log(`Applied Entity's tiled E icon to ${target}`);
}
