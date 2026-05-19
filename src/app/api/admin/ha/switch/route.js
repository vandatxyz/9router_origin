import { NextResponse } from "next/server";
import { setActiveTarget, getActiveTarget, probeInstance, listTargets } from "@/lib/ha";

// POST /api/admin/ha/switch
// Body: { target: "blue" | "green", force?: boolean }
// Verifies target instance is healthy before flipping the marker file.
// Host-side watcher then reloads nginx — usually <1s end to end.
export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const target = (body?.target || "").toString();
  const force = body?.force === true;

  if (!listTargets().includes(target)) {
    return NextResponse.json({
      error: `target must be one of ${listTargets().join(", ")}`,
    }, { status: 400 });
  }

  const current = getActiveTarget();
  if (current === target) {
    return NextResponse.json({
      ok: true,
      noop: true,
      active: current,
      message: `Already active: ${target}`,
    });
  }

  // Health probe target before switching unless force=true
  if (!force) {
    const health = await probeInstance(target);
    if (!health.ok) {
      return NextResponse.json({
        error: `Target "${target}" is not healthy`,
        details: health,
        hint: "Pass {force:true} to override (only do this if you know the upstream is fine).",
      }, { status: 409 });
    }
  }

  try {
    setActiveTarget(target);
  } catch (err) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    previous: current,
    active: target,
    forced: force,
    message: `Switched ${current} → ${target}. Host watcher will reload nginx.`,
  });
}
