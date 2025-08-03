import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getAuth } from "@clerk/nextjs/server";

const meetings: any[] = []; // Replace with DB later

export async function POST(req: NextRequest) {
  const { userId } = getAuth(req);
  const body = await req.json();
  const { userA, userB } = body;
  if (userId !== userA && userId !== userB) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const meetingId = uuidv4();
  const meetingLink = `${process.env.NEXT_PUBLIC_BASE_URL}/meeting/${meetingId}`;

  meetings.push({
    meetingId,
    participants: [userA, userB],
    createdAt: new Date(),
  });

  return NextResponse.json({ meetingLink });
}
