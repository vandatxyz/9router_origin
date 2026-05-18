const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");

const RESTART_DELAYS_MS = [1000, 3000, 5000, 10000, 15000];
const RESET_AFTER_MS = 60000;
const SERVER_ENTRY = path.join(__dirname, "src", "mitm", "server.js");

let child = null;
let shuttingDown = false;
let restartCount = 0;
let lastStartAt = 0;

function log(message) {
  process.stdout.write(`[MITM-STANDALONE] ${message}\n`);
}

function fail(message) {
  process.stderr.write(`[MITM-STANDALONE] ${message}\n`);
}

function ensurePrerequisites() {
  if (!process.env.MITM_ROUTER_BASE) {
    process.env.MITM_ROUTER_BASE = "http://127.0.0.1:20128";
  }
  process.env.MITM_STANDALONE = "1";

  if (!fs.existsSync(SERVER_ENTRY)) {
    throw new Error(`MITM server entry not found: ${SERVER_ENTRY}`);
  }
}

function startChild() {
  ensurePrerequisites();

  const aliveMs = Date.now() - lastStartAt;
  if (aliveMs >= RESET_AFTER_MS) restartCount = 0;
  lastStartAt = Date.now();

  log(`Starting MITM child (router: ${process.env.MITM_ROUTER_BASE})`);
  child = spawn(process.execPath, [SERVER_ENTRY], {
    stdio: "inherit",
    env: {
      ...process.env,
      MITM_STANDALONE: "1",
    },
  });

  child.on("exit", (code, signal) => {
    const exitLabel = signal ? `signal ${signal}` : `code ${code}`;
    child = null;

    if (shuttingDown) {
      log(`MITM child exited during shutdown (${exitLabel})`);
      process.exit(code || 0);
      return;
    }

    fail(`MITM child exited unexpectedly (${exitLabel})`);
    scheduleRestart();
  });
}

function scheduleRestart() {
  const delay = RESTART_DELAYS_MS[Math.min(restartCount, RESTART_DELAYS_MS.length - 1)];
  restartCount += 1;
  log(`Restarting MITM in ${delay}ms (attempt ${restartCount})`);
  setTimeout(() => {
    if (!shuttingDown) startChild();
  }, delay);
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log(`Received ${signal}, shutting down`);

  if (child && !child.killed) {
    child.kill(signal === "SIGINT" ? "SIGINT" : "SIGTERM");
    setTimeout(() => {
      if (child && !child.killed) child.kill("SIGKILL");
    }, 1500).unref?.();
    return;
  }

  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
if (process.platform === "win32") process.on("SIGBREAK", () => shutdown("SIGBREAK"));

try {
  startChild();
} catch (error) {
  fail(error.message || String(error));
  process.exit(1);
}
