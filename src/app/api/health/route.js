import { NextResponse } from "next/server";
import { getAdapter } from "@/lib/db/driver";

const startedAt = Date.now();

// Health endpoint used by nginx upstream check + HA dashboard.
// Lightweight: must succeed even when DB is busy. We surface DB status
// without throwing if the adapter cannot be reached.
export async function GET() {
  let dbStatus = "ok";
  let dbError = null;
  try {
    const db = await getAdapter();
    db.get(`SELECT 1 AS ok`);
  } catch (err) {
    dbStatus = "error";
    dbError = err?.message || String(err);
  }

  return NextResponse.json({
    ok: dbStatus === "ok",
    instance: process.env.INSTANCE_NAME || "default",
    uptimeMs: Date.now() - startedAt,
    db: dbStatus,
    dbError,
    time: new Date().toISOString(),
  });
}
