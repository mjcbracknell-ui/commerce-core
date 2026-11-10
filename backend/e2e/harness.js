import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: backendDir,
    env,
    encoding: 'utf8',
    timeout: 120000,
  });
  if (result.status !== 0) {
    throw new Error(
      `Command failed (${result.status}): ${command} ${args.join(' ')}\n${result.stdout || ''}\n${result.stderr || ''}`,
    );
  }
  return result;
}

async function waitForHealth(baseUrl, logs, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // server is still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`API did not become healthy in ${timeoutMs}ms.\n${logs.join('')}`);
}

/**
 * Start a throwaway Postgres cluster, apply migrations, seed demo data, and
 * boot the real HTTP server against it.
 */
export async function startTestEnvironment() {
  const dbPort = await getFreePort();
  const apiPort = await getFreePort();
  const dataDir = path.join(backendDir, '.tmp', `pg-${process.pid}-${Date.now()}`);
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port: dbPort,
    persistent: false,
    // The Windows default locale would otherwise create a WIN1252 cluster,
    // which cannot store the UTF-8 content in the bundled theme.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
  });

  const logs = [];
  let server = null;

  const shutdownServer = async () => {
    if (!server) return;
    await new Promise((resolve) => {
      if (server.exitCode !== null) {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        try {
          server.kill('SIGKILL');
        } catch {
          // already gone
        }
        resolve();
      }, 5000);
      server.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      try {
        server.kill('SIGTERM');
      } catch {
        clearTimeout(timer);
        resolve();
      }
    });
  };

  const cleanup = async () => {
    await shutdownServer();
    try {
      await pg.stop();
    } catch (error) {
      logs.push(`postgres stop: ${error.message}\n`);
    }
    try {
      fs.rmSync(dataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
    } catch (error) {
      console.warn(`Could not remove disposable database directory: ${error.message}`);
    }
  };

  let baseUrl;
  try {
    await pg.initialise();
    await pg.start();

    const dbName = 'commercecore_test';
    await pg.createDatabase(dbName);

    const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${dbPort}/${dbName}`;
    const env = {
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_URL: databaseUrl,
      JWT_SECRET: 'e2e-test-secret',
      ALLOW_DEMO_LICENSE: 'true',
      // Keep tests offline and fast: no search cluster, no SMTP socket.
      MEILI_HOST: '',
      SMTP_HOST: '',
      CORS_ORIGINS: 'http://localhost:3000',
      // Fixed fake credentials: the webhook test signs its own payloads.
      STRIPE_SECRET_KEY: 'sk_test_e2e',
      STRIPE_WEBHOOK_SECRET: 'whsec_e2e',
    };

    run(process.execPath, [path.join(backendDir, 'node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'deploy'], env);
    run(process.execPath, [path.join(backendDir, 'scripts', 'seed.js')], env);

    server = spawn(process.execPath, [path.join(backendDir, 'src', 'server.js')], {
      cwd: backendDir,
      env: { ...env, PORT: String(apiPort) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const capture = (chunk) => {
      logs.push(chunk.toString());
      if (logs.length > 400) logs.shift();
    };
    server.stdout.on('data', capture);
    server.stderr.on('data', capture);

    baseUrl = `http://127.0.0.1:${apiPort}`;
    await waitForHealth(baseUrl, logs);
  } catch (error) {
    error.message = `${error.message}\n\nCaptured output:\n${logs.join('')}`;
    await cleanup();
    throw error;
  }

  let stopped = false;
  return {
    baseUrl,
    databaseUrl: `postgresql://postgres:postgres@127.0.0.1:${dbPort}/commercecore_test`,
    logs,
    async stop() {
      if (stopped) return;
      stopped = true;
      await cleanup();
    },
  };
}
