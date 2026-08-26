import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { cpSync, createReadStream, existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';

const appDir = resolve(import.meta.dirname, '..');
const local = process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? '', 'AppData', 'Local');
const sourceCandidate = join(local, 'GROVER', 'manager-inference');
const manifestCandidate = join(sourceCandidate, 'inference_manifest.json');
const stagingParent = resolve(appDir, '.package-staging');
const stagingRoot = join(stagingParent, 'manager-inference');

function inside(parent, child) {
  const path = relative(resolve(parent), resolve(child));
  return path === '' || (!path.startsWith('..') && !isAbsolute(path));
}

function sha256(path) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.once('error', reject);
    stream.once('end', () => resolveHash(hash.digest('hex').toUpperCase()));
  });
}

function runBuilder(args) {
  return new Promise((resolveRun, reject) => {
    const cli = join(appDir, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js');
    const child = spawn(process.execPath, [cli, ...args], { cwd: appDir, stdio: 'inherit', windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code) => code === 0 ? resolveRun() : reject(new Error(`electron-builder exited with code ${code}.`)));
  });
}

if (!inside(appDir, stagingParent) || stagingParent === appDir) throw new Error('Refused an unsafe package-staging path.');
if (!existsSync(manifestCandidate)) throw new Error('Prepare the local manager inference bundle before building GROVER.');
const sourceRoot = realpathSync(sourceCandidate);
const manifestPath = join(sourceRoot, 'inference_manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8').replace(/^\uFEFF/, ''));
if (manifest.schema_version !== '1.0' || manifest.runtime !== 'llama.cpp' || manifest.prompt_mode !== 'raw_qwen3') {
  throw new Error('The prepared manager manifest is incompatible with this GROVER build.');
}
const runtimeSource = realpathSync(join(sourceRoot, `llama-${manifest.runtime_version}`));
const configuredModel = isAbsolute(manifest.model) ? manifest.model : join(sourceRoot, manifest.model);
const modelSource = realpathSync(configuredModel);
if (!inside(sourceRoot, runtimeSource) || !inside(sourceRoot, modelSource)) {
  throw new Error('The prepared manager runtime leaves its approved local folder.');
}
const actualHash = await sha256(modelSource);
if (actualHash !== String(manifest.model_sha256).toUpperCase()) throw new Error('The manager model failed its package hash check.');

rmSync(stagingParent, { recursive: true, force: true });
try {
  mkdirSync(join(stagingRoot, 'models'), { recursive: true });
  cpSync(runtimeSource, join(stagingRoot, basename(runtimeSource)), { recursive: true, force: false, errorOnExist: true });
  const packagedModel = join(stagingRoot, 'models', basename(modelSource));
  cpSync(modelSource, packagedModel, { force: false, errorOnExist: true });
  const packagedManifest = { ...manifest, model: join('models', basename(modelSource)), packaged: true };
  writeFileSync(join(stagingRoot, 'inference_manifest.json'), JSON.stringify(packagedManifest, null, 2), 'utf8');
  const mode = process.argv.includes('--dir') ? ['--dir'] : ['--win', 'portable'];
  await runBuilder(mode);
} finally {
  if (!inside(appDir, stagingParent) || stagingParent === appDir) throw new Error('Refused an unsafe package cleanup path.');
  rmSync(stagingParent, { recursive: true, force: true });
}
