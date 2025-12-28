import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Auth check - properly await auth()
    const authResult = await auth(req);
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
      appointment.createdBy.toString(),
      ...(appointment.withUserId?.map((id: any) => id.toString()) || []),
    ];

    if (!participants.includes(userId.toString())) {
      console.error("❌ User not a participant:", userId);
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 5. Check if meeting is cancelled
    if (appointment.status === "cancelled") {
      return NextResponse.json(
        {
          allowed: false,
          reason: "This meeting has been cancelled",
        },
        { status: 200 }
      );
    }

    // 6. Check scheduled time
    const now = new Date();
    const appointmentTime = new Date(
      appointment.scheduledAt || appointment.time
    );

    if (appointmentTime > now) {
      const timeRemaining = Math.ceil(
        (appointmentTime.getTime() - now.getTime()) / 1000 / 60
      );
      return NextResponse.json(
        {
          allowed: false,
          reason: `Appointment starts in ${timeRemaining} minutes`,
          startsAt: appointmentTime.toISOString(),
        },
        { status: 200 }
      );
    }

    // ✅ 7. RELAXED presence check - only block if explicitly offline
    // This prevents the refresh issue where socket hasn't connected yet
    try {
      const invitedUsers: string[] = appointment.withUserId || [];
      
      // ✅ Skip presence check if no invited users
      if (invitedUsers.length === 0) {
        console.log("✅ No invited users to check - allowing entry");
        return NextResponse.json({
          allowed: true,
          reason: "Access granted",
        });
      }

      console.log("🔍 Checking presence for users:", invitedUsers);
      
      const socketUrl =
        process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || "http://localhost:3001";

      const presenceChecks = await Promise.all(
        invitedUsers.map(async (uid) => {
          try {
            const res = await fetch(`${socketUrl}/api/presence/${uid}`, {
              method: "GET",
              cache: "no-store",
              credentials: "include",
              signal: AbortSignal.timeout(2000), // ✅ Reduced timeout
            });

            if (!res.ok) {
              console.warn(`⚠️ Presence check failed for ${uid}: HTTP ${res.status}`);
              // ✅ Treat failed checks as "unknown" not "offline"
              return { uid, online: null };
            }

            const data = await res.json();
            console.log(`📊 User ${uid}: online=${data.online}`);
            return { uid, online: data.online === true };
          } catch (err) {
            console.warn(`⚠️ Presence timeout for ${uid}`);
            // ✅ Network errors = unknown status, not offline
            return { uid, online: null };
          }
        })
      );

      // ✅ Only count explicitly offline users (not unknown/null)
      const explicitlyOffline = presenceChecks.filter(
        (p) => p.online === false
      );

      // ✅ If there are unknown statuses, allow entry (socket might be connecting)
      const unknownStatuses = presenceChecks.filter((p) => p.online === null);
      
      if (unknownStatuses.length > 0) {
        console.log(
          `⚠️ ${unknownStatuses.length} user(s) have unknown status - allowing entry`
        );
        return NextResponse.json({
          allowed: true,
          reason: "Access granted (presence check skipped)",
        });
      }

      // ✅ Only block if users are explicitly confirmed offline
      if (explicitlyOffline.length > 0) {
        console.warn("❌ Explicitly offline users:", explicitlyOffline.map((u) => u.uid));
        return NextResponse.json(
          {
            allowed: false,
            reason: `Waiting for ${explicitlyOffline.length} user(s) to come online`,
            offlineUsers: explicitlyOffline.map((u) => u.uid),
          },
          { status: 200 }
        );
      }

      console.log("✅ All users are online!");
    } catch (err) {
      // ✅ On presence check system error, allow entry anyway
      console.error("⚠️ Presence check system error - allowing entry:", err);
      return NextResponse.json({
        allowed: true,
        reason: "Access granted (presence check unavailable)",
      });
    }

    // 8. Success
    return NextResponse.json(
      {
        allowed: true,
        reason: "Access granted",
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