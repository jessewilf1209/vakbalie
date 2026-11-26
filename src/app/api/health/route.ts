import { NextResponse } from "next/server";

// Healthcheck voor CI en Vercel. Niet cachen: moet altijd de live status geven.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ status: "ok" });
}
