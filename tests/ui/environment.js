import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startTestEnvironment } from '../../backend/e2e/harness.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const backendDir = path.join(rootDir, 'backend');
const storefrontDir = path.join(rootDir, 'storefront');
const tempDir = path.join(backendDir, '.tmp');
const environmentPath = path.join(tempDir, 'ui-test-env.json');
const storefrontPort = Number(process.env.UI_PORT || 3100);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let active = null;

function captureLogs(child, logs) {
  const capture = (chunk) => {
    logs.push(chunk.toString());
    if (logs.length > 500) logs.shift();
  };
  child.stdout.on('data', capture);
  child.stderr.on('data', capture);
}

async function waitForStorefront(url, logs, shouldAbort, timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (shouldAbort()) {
      throw new Error(`Storefront exited before becoming ready.\n${logs.join('')}`);
    }
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status === 200) return;
    } catch {
      // The dev server is still starting.
    }
    await delay(500);
  }
  throw new Error(`Storefront did not become ready in ${timeoutMs}ms.\n${logs.join('')}`);
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;
  const exited = new Promise((resolve) => child.once('exit', resolve));
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    // The process may already be gone.
  }
  await Promise.race([exited, delay(5000)]);
  if (child.exitCode === null) {
    try {
      child.kill('SIGKILL');
    } catch {
      // Already terminated.
    }
  }
}

export async function startUiEnvironment() {
  if (active) return active.info;

  fs.mkdirSync(tempDir, { recursive: true });
  const api = await startTestEnvironment();
  const logs = [];
  let storefront = null;
  let storefrontExit = null;

  try {
    fs.rmSync(path.join(storefrontDir, '.next-ui'), { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
    storefront = spawn(
      process.execPath,
      [path.join(storefrontDir, 'node_modules', 'next', 'dist', 'bin', 'next'), 'dev', '-p', String(storefrontPort)],
      {
        cwd: storefrontDir,
        env: {
          ...process.env,
          INTERNAL_API_URL: api.baseUrl,
          NEXT_PUBLIC_API_URL: api.baseUrl,
          STORE_DOMAIN: 'localhost',
          NEXT_DIST_DIR: '.next-ui',
          NEXT_TELEMETRY_DISABLED: '1',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    captureLogs(storefront, logs);
    storefront.on('error', (error) => {
      storefrontExit = error.message;
      logs.push(`Storefront spawn error: ${error.message}\n`);
    });
    storefront.on('exit', (code, signal) => {
      storefrontExit = `code=${code ?? 'null'} signal=${signal ?? 'none'}`;
    });

    const storefrontUrl = `http://127.0.0.1:${storefrontPort}`;
    await waitForStorefront(`${storefrontUrl}/account/login`, logs, () => storefrontExit !== null);

    const info = { apiUrl: api.baseUrl, storefrontUrl };
    fs.writeFileSync(environmentPath, `${JSON.stringify(info, null, 2)}\n`);
    active = { api, storefront, logs, info };
    return info;
  } catch (error) {
    await stopProcess(storefront);
    await api.stop();
    fs.rmSync(environmentPath, { force: true });
    error.message = `${error.message}\n\nStorefront output:\n${logs.join('')}`;
    throw error;
  }
}

export async function stopUiEnvironment() {
  if (!active) return;
  const { api, storefront, logs } = active;
  active = null;
  try {
    fs.writeFileSync(path.join(tempDir, 'ui-storefront.log'), logs.join(''));
  } catch {
    // Best-effort diagnostics only.
  }
  await stopProcess(storefront);
  await api.stop();
  fs.rmSync(environmentPath, { force: true });
}

export function readUiEnvironment() {
  return JSON.parse(fs.readFileSync(environmentPath, 'utf8'));
}
