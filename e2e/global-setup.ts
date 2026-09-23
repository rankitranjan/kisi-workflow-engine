import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const repoRoot = path.resolve(import.meta.dirname, "..");
const apiRoot = path.join(repoRoot, "apps/api");
const databaseUrl = "postgresql://kisi:kisi@127.0.0.1:5433/workflow_engine_e2e";

const psql = ["compose", "exec", "-T", "postgres", "psql", "-U", "kisi", "-d", "postgres"] as const;

export default async function globalSetup(): Promise<void> {
  await execFileAsync(
    "docker",
    ["compose", "-f", "docker-compose.yml", "-f", "e2e/postgres-port.yml", "up", "-d", "--wait"],
    { cwd: repoRoot },
  );
  await ensureE2eDatabase();
  await migrateE2eDatabase();
}

async function ensureE2eDatabase(): Promise<void> {
  const existing = await execFileAsync(
    "docker",
    [
      ...psql,
      "-tAc",
      "SELECT 1 FROM pg_database WHERE datname = 'workflow_engine_e2e'",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  if (existing.stdout.trim() === "1") {
    return;
  }
  await execFileAsync(
    "docker",
    [...psql, "-c", "CREATE DATABASE workflow_engine_e2e"],
    { cwd: repoRoot, encoding: "utf8" },
  );
}

async function migrateE2eDatabase(): Promise<void> {
  await execFileAsync(path.join(repoRoot, "node_modules/.bin/prisma"), ["migrate", "deploy"], {
    cwd: apiRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
  });
}
