// src/app/api/presence/[userId]/route.ts
import { NextResponse } from "next/server";
import { onlineUsers } from "../../../../pages/api/socket"; // make sure this export exists

export async function GET(
  req: Request,
  { params }: { params: { userId: string } }
) {
  const { userId } = params;
  const online = onlineUsers.has(userId);
  return NextResponse.json({ online });
}
