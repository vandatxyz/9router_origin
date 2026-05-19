import { NextResponse } from "next/server";
import { getActiveTarget, getStandbyTarget, getInstanceName, listTargets, probeInstance } from "@/lib/ha";

// GET /api/admin/ha/state
// Returns current active target, standby, instance self, and health probes
// for all targets. Used by /dashboard/ha page.
export async function GET() {
  const active = getActiveTarget();
  const standby = getStandbyTarget(active);
  const targets = listTargets();

  // Probe peers in parallel (both blue + green) so UI shows full picture.
  const probes = await Promise.all(
    targets.map(async (t) => [t, await probeInstance(t)])
  );
  const health = Object.fromEntries(probes);

  return NextResponse.json({
    active,
    standby,
    instance: getInstanceName(),
    targets,
    health,
    time: new Date().toISOString(),
  });
}
