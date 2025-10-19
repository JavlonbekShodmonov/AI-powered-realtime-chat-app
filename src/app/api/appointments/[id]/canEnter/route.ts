import { auth } from "@clerk/nextjs/server";
import { clientPromise } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Auth check - properly await auth()
    const authResult = await auth();
    const userId = authResult?.userId;
    
    if (!userId) {
      console.error("❌ No userId found in auth");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Await params in Next.js 15+
    const resolvedParams = await params;
    const appointmentId = resolvedParams.id;

    if (!appointmentId || appointmentId === 'undefined') {
      console.error("❌ No appointmentId provided");
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db();

    // 3. Find appointment with proper ObjectId validation
    let appointment;
    try {
      if (!ObjectId.isValid(appointmentId)) {
        throw new Error("Invalid ObjectId format");
      }
      
      appointment = await db
        .collection("appointments")
        .findOne({ _id: new ObjectId(appointmentId) });
    } catch (err) {
      console.error("Invalid appointmentId:", appointmentId, err);
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    if (!appointment) {
      console.error("❌ Appointment not found:", appointmentId);
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // 4. Verify user is a participant
    const participants = [
      appointment.createdBy,
      ...(appointment.withUserId || []),
    ];
    
    if (!participants.includes(userId)) {
      console.error("❌ User not a participant:", userId);
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 5. Check scheduled time FIRST
    const now = new Date();
    const appointmentTime = new Date(
      appointment.scheduledAt || appointment.time
    );

    if (appointmentTime > now) {
      const timeRemaining = Math.ceil((appointmentTime.getTime() - now.getTime()) / 1000 / 60);
      return NextResponse.json(
        {
          allowed: false,
          reason: `Appointment starts in ${timeRemaining} minutes`,
          startsAt: appointmentTime.toISOString(),
        },
        { status: 200 }
      );
    }

    // 6. Check presence on port 3001 via HTTP
    try {
      const invitedUsers: string[] = appointment.withUserId || [];
      
      console.log('🔍 Checking presence for users:', invitedUsers);
      
      const socketUrl = process.env.SOCKET_SERVER_URL || 'http://localhost:3001';

      const presenceChecks = await Promise.all(
        invitedUsers.map(async (uid) => {
          try {
            const presenceUrl = `${socketUrl}/api/presence/${uid}`;
            console.log(`📡 Fetching: ${presenceUrl}`);
            
            const res = await fetch(presenceUrl, {
              cache: 'no-store',
              signal: AbortSignal.timeout(3000),
            });
            
            console.log(`📡 Response for ${uid}: ${res.status}`);
            
            if (!res.ok) {
              const errorText = await res.text();
              console.warn(`❌ Presence check failed for ${uid}: HTTP ${res.status} - ${errorText}`);
              return { uid, online: false };
            }
            
            const data = await res.json();
            console.log(`📊 User ${uid}: ${JSON.stringify(data)}`);
            
            return { uid, online: data.online === true };
          } catch (error) {
            console.error(`❌ Error checking ${uid}:`, error);
            return { uid, online: false };
          }
        })
      );

      const offlineUsers = presenceChecks.filter(p => !p.online);
      
      if (offlineUsers.length > 0) {
        console.warn('❌ Offline users:', offlineUsers.map(u => u.uid));
        return NextResponse.json(
          {
            allowed: false,
            reason: `Waiting for ${offlineUsers.length} user(s) to come online`,
            offlineUsers: offlineUsers.map(u => u.uid),
          },
          { status: 200 }
        );
      }
      
      console.log('✅ All users are online!');
    } catch (err) {
      console.error("❌ Presence check system error:", err);
      return NextResponse.json(
        { allowed: false, reason: "Presence check failed" },
        { status: 500 }
      );
    }

    // 7. Success
    return NextResponse.json(
      {
        allowed: true,
        reason: "All users online and appointment started",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("❌ Unexpected error in canEnter route:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}