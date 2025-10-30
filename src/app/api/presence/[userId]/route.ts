// src/app/api/presence/[userId]/route.ts
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const { userId } = params;

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || "http://localhost:3001";
    const res = await fetch(`${socketUrl}/api/presence/${encodeURIComponent(userId)}`, {
      method: "GET",
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json({ online: false }, { status: 200 });
    }

    const data = await res.json();
    return NextResponse.json({ online: Boolean(data.online) }, { status: 200 });
  } catch (err) {
    console.error("Presence route error:", err);
    return NextResponse.json({ online: false }, { status: 200 });
  }
}
