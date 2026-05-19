import fs from "node:fs";
import path from "node:path";

// HA active marker.
// Active instance name is persisted in DATA_DIR/ha/active.txt (shared volume).
// A host-side watcher (`9router-ha-watcher.service`) detects changes and
// rewrites nginx upstream symlink. Both instances share this volume, so any
// reader can see the current target.

const DATA_DIR = process.env.DATA_DIR || "/app/data";
const HA_DIR = path.join(DATA_DIR, "ha");
const ACTIVE_FILE = path.join(HA_DIR, "active.txt");
const VALID_TARGETS = new Set(["blue", "green"]);
const DEFAULT_ACTIVE = "blue";

function ensureDir() {
  try { fs.mkdirSync(HA_DIR, { recursive: true }); } catch { /* ignore */ }
}

export function getInstanceName() {
  return process.env.INSTANCE_NAME || "default";
}

export function getActiveTarget() {
  try {
    const raw = fs.readFileSync(ACTIVE_FILE, "utf8").trim();
    if (VALID_TARGETS.has(raw)) return raw;
  } catch { /* file missing → use default */ }
  return DEFAULT_ACTIVE;
}

export function setActiveTarget(target) {
  if (!VALID_TARGETS.has(target)) {
    throw new Error(`Invalid HA target "${target}". Must be one of: ${[...VALID_TARGETS].join(", ")}`);
  }
  ensureDir();
  // Atomic write: tmp file + rename so the host watcher only sees fully-written state.
  const tmp = `${ACTIVE_FILE}.tmp`;
  fs.writeFileSync(tmp, `${target}\n`, "utf8");
  fs.renameSync(tmp, ACTIVE_FILE);
  return target;
}

export function getStandbyTarget(active = getActiveTarget()) {
  return active === "blue" ? "green" : "blue";
}

export function listTargets() {
  return [...VALID_TARGETS];
}

// Probe peer instance.
// Containers attach to a shared docker network and resolve each other by
// container name (`9router-blue`, `9router-green`). Inside-container internal
// port is fixed at 20128. Host port mappings (127.0.0.1:20131/20132) are only
// for nginx-on-host to reach — not for peer probing.
const INTERNAL_PORT = Number(process.env.HA_INTERNAL_PORT) || 20128;
const HOST_MAP = {
  blue: process.env.HA_BLUE_HOST || "9router-blue",
  green: process.env.HA_GREEN_HOST || "9router-green",
};

export async function probeInstance(target, { timeoutMs = 1500 } = {}) {
  const host = HOST_MAP[target];
  if (!host) return { ok: false, error: "no host mapping" };
  const url = `http://${host}:${INTERNAL_PORT}/api/health`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return { ok: false, status: res.status };
    const body = await res.json();
    return { ok: true, status: res.status, ...body };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  } finally {
    clearTimeout(timer);
  }
}
