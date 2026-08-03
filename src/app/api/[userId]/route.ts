// src/app/api/presence/[userId]/route.ts
import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;

    // realtime-service's gateway writes online users into the 'user:presence'
    // hash (see handleConnection in realtime.gateway.ts). Reading it directly
    // here removes an HTTP round-trip to a server that may not exist anymore.
    const presenceRaw = await redis.hget("user:presence", userId);
    return NextResponse.json({ online: Boolean(presenceRaw) }, { status: 200 });
  } catch (err) {
    console.error("Presence route error:", err);
    return NextResponse.json({ online: false }, { status: 200 });
  }
}
