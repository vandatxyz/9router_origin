"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, Button } from "@/shared/components";

const POLL_INTERVAL_MS = 3000;

function HealthBadge({ probe }) {
  if (!probe) return <span className="px-2 py-0.5 rounded bg-neutral-200 dark:bg-neutral-700 text-xs">unknown</span>;
  if (probe.ok) {
    return (
      <span className="px-2 py-0.5 rounded bg-green-500/20 text-green-700 dark:text-green-400 text-xs font-semibold">
        healthy
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded bg-red-500/20 text-red-700 dark:text-red-400 text-xs font-semibold" title={probe.error || `HTTP ${probe.status}`}>
      down
    </span>
  );
}

function InstanceCard({ name, isActive, isSelf, probe, onSwitch, switching, otherHealthy }) {
  const canSwitch = !isActive && !switching && otherHealthy !== false;
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${name === "blue" ? "bg-blue-500" : "bg-emerald-500"}`} />
          <h3 className="text-lg font-semibold capitalize">{name}</h3>
          {isSelf && (
            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-700 dark:text-amber-400 text-[10px] uppercase font-bold tracking-wider">
              self
            </span>
          )}
        </div>
        <HealthBadge probe={probe} />
      </div>

      <div className="space-y-1 text-xs text-text-muted font-mono">
        <div>port: 127.0.0.1:{name === "blue" ? "20131" : "20132"}</div>
        <div>image: vandatxyz/9router:{name}</div>
        <div>uptime: {probe?.uptimeMs ? `${Math.floor(probe.uptimeMs / 1000)}s` : "—"}</div>
        <div>db: {probe?.db || "—"}</div>
      </div>

      <div className="pt-2 mt-auto">
        {isActive ? (
          <div className="px-3 py-2 rounded bg-primary/10 text-primary text-center text-sm font-semibold">
            ✓ Currently serving traffic
          </div>
        ) : (
          <Button
            variant="primary"
            fullWidth
            disabled={!canSwitch}
            onClick={onSwitch}
            icon={switching ? "hourglass_empty" : "swap_horiz"}
          >
            {switching ? "Switching..." : `Switch to ${name}`}
          </Button>
        )}
      </div>
    </Card>
  );
}

export default function HaPageClient() {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [switching, setSwitching] = useState(null);
  const [error, setError] = useState(null);
  const [lastSwitch, setLastSwitch] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/ha/state", { cache: "no-store" });
      const data = await res.json();
      setState(data);
      setError(null);
    } catch (err) {
      setError(err?.message || "Failed to fetch HA state");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const handleSwitch = async (target, force = false) => {
    setSwitching(target);
    setError(null);
    try {
      const res = await fetch("/api/admin/ha/switch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, force }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && !force) {
          if (globalThis.confirm(`Target ${target} is not healthy:\n${data.details?.error || "unknown"}\n\nForce switch anyway?`)) {
            await handleSwitch(target, true);
          }
        } else {
          setError(data.error || `HTTP ${res.status}`);
        }
        return;
      }
      setLastSwitch({ at: Date.now(), ...data });
      await refresh();
    } catch (err) {
      setError(err?.message || "Switch failed");
    } finally {
      setSwitching(null);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-text-muted">Loading HA state...</div>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="p-6">
        <div className="text-red-500">Could not load HA state. {error}</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">High Availability</h1>
        <p className="text-text-muted text-sm">
          Blue/green deploy with manual switch. nginx host reverse-proxies port 20128 to the active instance.
        </p>
      </header>

      <Card className="p-4 flex items-center gap-4 bg-primary/5">
        <div className="size-10 rounded-full bg-primary/20 text-primary flex items-center justify-center">
          <span className="material-symbols-outlined">swap_horiz</span>
        </div>
        <div className="flex-1">
          <div className="text-sm text-text-muted">Currently active</div>
          <div className="text-xl font-semibold capitalize">{state.active}</div>
        </div>
        <div className="text-right text-xs text-text-muted">
          <div>You are: <span className="font-mono font-semibold">{state.instance}</span></div>
          <div>Standby: <span className="font-mono">{state.standby}</span></div>
        </div>
      </Card>

      {error && (
        <div className="p-3 rounded bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      {lastSwitch?.ok && (
        <div className="p-3 rounded bg-green-500/10 border border-green-500/30 text-green-700 dark:text-green-400 text-sm">
          {lastSwitch.message || `Switched to ${lastSwitch.active}`}{lastSwitch.forced ? " (forced)" : ""}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {state.targets.map((t) => (
          <InstanceCard
            key={t}
            name={t}
            isActive={state.active === t}
            isSelf={state.instance === t}
            probe={state.health[t]}
            switching={switching === t}
            otherHealthy={state.health[t]?.ok}
            onSwitch={() => handleSwitch(t)}
          />
        ))}
      </div>

      <Card className="p-4 space-y-2 text-sm">
        <div className="font-semibold flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">info</span>
          How HA switch works
        </div>
        <ol className="list-decimal list-inside space-y-1 text-text-muted text-xs ml-1">
          <li>Click <strong>Switch to {state.standby}</strong> — UI POSTs to <code>/api/admin/ha/switch</code>.</li>
          <li>Server health-probes the target. If healthy, writes <code>{state.instance === "blue" ? "blue" : "green"}</code> → <code>active.txt</code> in the shared volume.</li>
          <li>Host watcher (<code>9router-ha-watcher.service</code>) sees the file change, swaps nginx upstream symlink, runs <code>nginx -s reload</code>.</li>
          <li>nginx hot reload (~50ms): in-flight connections drain, new connections route to the target.</li>
        </ol>
      </Card>
    </div>
  );
}
