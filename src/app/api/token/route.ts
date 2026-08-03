import { NextResponse } from "next/server";

// This endpoint has been removed.
// Video calling via Daily.co has been removed from Summeet.
// Summeet is now a meeting assistant plugin — it listens and summarizes,
// it does not host video calls.
export async function POST() {
  return NextResponse.json(
    { error: "Video calling has been removed from this app." },
    { status: 410 } // 410 Gone — intentionally removed
  );
}