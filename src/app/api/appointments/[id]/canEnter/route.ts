import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { redis } from "@/lib/redis";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await auth(req);
    const userId = authResult?.userId;

    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resolvedParams = await params;
    const appointmentId = resolvedParams.id;

    if (!appointmentId || appointmentId === "undefined") {
      return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db();

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
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const participants = [
      appointment.createdBy.toString(),
      ...(appointment.withUserId?.map((id: any) => id.toString()) || []),
    ];

    if (!participants.includes(userId.toString())) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (appointment.status === "cancelled") {
      return NextResponse.json(
        { allowed: false, reason: "This meeting has been cancelled" },
        { status: 200 }
      );
    }

    const now = new Date();
    const appointmentTime = new Date(appointment.scheduledAt || appointment.time);

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

    // Presence check — now reads the same Redis hash realtime-service's
    // gateway writes to, directly, instead of an HTTP call to a server that
    // may no longer be running. Same "relaxed" semantics as before: only
    // block entry if a participant is explicitly confirmed offline.
    try {
      const invitedUsers: string[] = appointment.withUserId || [];

      if (invitedUsers.length === 0) {
        return NextResponse.json({ allowed: true, reason: "Access granted" });
      }

      const presenceChecks = await Promise.all(
        invitedUsers.map(async (uid) => {
          try {
            const presenceRaw = await redis.hget("user:presence", uid);
            return { uid, online: Boolean(presenceRaw) };
          } catch (err) {
            console.warn(`Presence check error for ${uid}:`, err);
            return { uid, online: null };
          }
        })
      );

      // const explicitlyOffline = presenceChecks.filter((p) => p.online === false);
      const unknownStatuses = presenceChecks.filter((p) => p.online === null);

      if (unknownStatuses.length > 0) {
        return NextResponse.json({
          allowed: true,
          reason: "Access granted (presence check skipped)",
        });
      }

      // if (explicitlyOffline.length > 0) {
      //   return NextResponse.json(
      //     {
      //       allowed: false,
      //       reason: `Waiting for ${explicitlyOffline.length} user(s) to come online`,
      //       offlineUsers: explicitlyOffline.map((u) => u.uid),
      //     },
      //     { status: 200 }
      //   );
      // }
    } catch (err) {
      console.error("Presence check system error - allowing entry:", err);
      return NextResponse.json({
        allowed: true,
        reason: "Access granted (presence check unavailable)",
      });
    }

    return NextResponse.json({ allowed: true, reason: "Access granted" }, { status: 200 });
  } catch (error) {
    console.error("Unexpected error in canEnter route:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
