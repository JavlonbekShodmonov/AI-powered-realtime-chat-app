import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { getServerSession } from "next-auth";
import { authOptions } from "../../lib/auth"; // we’ll create this next

const meetings: any[] = []; // still temporary
export async function GET() {
  return NextResponse.json({ 
    message: "Summarize API is accessible!",
    timestamp: new Date().toISOString() 
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !session.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const body = await req.json();
  const { userA, userB } = body;

  const meetingId = uuidv4();
  const meetingLink = `${process.env.NEXT_PUBLIC_BASE_URL}/meeting/${meetingId}`;

  meetings.push({
    meetingId,
    participants: [userA, userB],
    createdAt: new Date(),
  });

  return NextResponse.json({ meetingLink });
}
