import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Appointment from "../models/Appointment";
import { auth } from "../../../lib/auth";
import { User } from "../models/User";

// CREATE appointment
export async function POST(req: Request) {
  try {
    const { withUserId, scheduledAt } = await req.json();
    const { userId } = await auth(req);
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    await dbConnect();

    const appointment = new Appointment({
      createdBy: userId,
      withUserId,
      scheduledAt,
    });

    await appointment.save();

    const DAILY_API_KEY = process.env.DAILY_API_KEY;
    const dailyRoomName = `summeet-${appointment._id}`; // Unique name based on DB ID

    try {
      const dailyResponse = await fetch("https://api.daily.co/v1/rooms", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${DAILY_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: dailyRoomName,
          properties: {
            // Set expiry to 24 hours after the scheduled time (safety first!)
            exp: Math.floor(new Date(scheduledAt).getTime() / 1000) + 86400,
            eject_at_room_exp: true,
            enable_chat: true,
          },
        }),
      });

      if (dailyResponse.ok) {
        console.log("✅ Daily Room Created:", dailyRoomName);
      }
    } catch (dailyError) {
      console.error("⚠️ Failed to pre-create Daily room:", dailyError);
      // We don't crash the whole request if Daily is slow,
      // but it's good to have it ready.
    }

    console.log("📅 Appointment created:", appointment._id);

    // ✅ Fetch creator info separately to avoid serialization issues
    let creatorName = "Unknown";
    let withUserNames: string[] = [];

    try {
      // Get creator info
      const creator = await User.findById(userId).select("username email name");
      if (creator) {
        creatorName = creator.name || creator.username || creator.email;
      }

      // Get participant names
      if (Array.isArray(withUserId)) {
        const users = await User.find({ _id: { $in: withUserId } }).select(
          "username email name",
        );
        withUserNames = users.map((u: any) => u.name || u.username || u.email);
      }
    } catch (userError) {
      console.error("⚠️ Error fetching user names:", userError);
    }

    console.log("   Creator:", creatorName);
    console.log("   Participants:", withUserNames);

    // ✅ Emit to socket server with creator name
    try {
      const socketUrl =
        process.env.SOCKET_SERVER_URL || "http://localhost:3001";
      console.log(`🔌 Sending appointment to socket server: ${socketUrl}`);

      const socketPayload = {
        _id: appointment._id.toString(),
        createdBy: appointment.createdBy.toString(),
        createdByName: creatorName,
        withUserId: Array.isArray(appointment.withUserId)
          ? appointment.withUserId.map((id: any) => id.toString())
          : [appointment.withUserId.toString()],
        withUserNames: withUserNames,
        scheduledAt: appointment.scheduledAt,
        status: appointment.status,
        date: appointment.date,
        time: appointment.time,
      };

      console.log("   Payload:", JSON.stringify(socketPayload, null, 2));

      const response = await fetch(`${socketUrl}/api/emit-appointment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(socketPayload),
      });

      if (response.ok) {
        const result = await response.json();
        console.log("✅ Appointment emitted to socket server:", result);
      } else {
        const errorText = await response.text();
        console.error(
          "❌ Socket server returned error:",
          response.status,
          errorText,
        );
      }
    } catch (emitError) {
      console.error("❌ Failed to emit appointment to socket:", emitError);
      // Don't fail the appointment creation if notification fails
    }
    await appointment.save();
    // Return populated appointment for the response
    await appointment.populate("createdBy", "username email name");
    await appointment.populate("withUserId", "username email name");

    const appointmentObj = appointment.toObject();
    return NextResponse.json(appointmentObj, { status: 201 });
  } catch (error) {
    console.error("Error creating appointment:", error);
    return new NextResponse("Failed to create appointment", { status: 500 });
  }
}

// GET all appointments for logged-in user
export async function GET(req: Request) {
  try {
    const { userId } = await auth(req);
    console.log("Auth debug: ", { userId });
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    await dbConnect();
    const appointments = await Appointment.find({
      $or: [{ createdBy: userId }, { withUserId: { $in: [userId] } }],
    })
      .populate("createdBy", "name username email")
      .populate("withUserId", "name username email");

    return NextResponse.json(
      appointments.map((a) => a.toObject()),
      { status: 200 },
    );
  } catch (error) {
    console.error("Error fetching appointments:", error);
    return new NextResponse("Failed to fetch appointments", { status: 500 });
  }
}

// UPDATE appointment
export async function PATCH(req: Request) {
  try {
    const { appointmentId, status, date, time } = await req.json();
    const { userId } = await auth(req);
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    await dbConnect();

    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) return new NextResponse("Not found", { status: 404 });

    if (status) appointment.status = status;
    if (date) appointment.date = date;
    if (time) appointment.time = time;

    await appointment.save();

    console.log("📝 Appointment updated:", appointmentId, "->", status);

    // ✅ Fetch user info separately
    let creatorName = "Unknown";
    let withUserNames: string[] = [];

    try {
      const creator = await User.findById(appointment.createdBy).select(
        "username email name",
      );
      if (creator) {
        creatorName = creator.name || creator.username || creator.email;
      }

      if (Array.isArray(appointment.withUserId)) {
        const users = await User.find({
          _id: { $in: appointment.withUserId },
        }).select("username email name");
        withUserNames = users.map((u: any) => u.name || u.username || u.email);
      }
    } catch (userError) {
      console.error("⚠️ Error fetching user names:", userError);
    }

    // ✅ Emit update to socket server with names
    try {
      const socketUrl =
        process.env.SOCKET_SERVER_URL || "http://localhost:3001";
      console.log(
        `🔌 Sending appointment update to socket server: ${socketUrl}`,
      );

      const socketPayload = {
        _id: appointment._id.toString(),
        createdBy: appointment.createdBy.toString(),
        createdByName: creatorName,
        withUserId: Array.isArray(appointment.withUserId)
          ? appointment.withUserId.map((id: any) => id.toString())
          : [appointment.withUserId.toString()],
        withUserNames: withUserNames,
        scheduledAt: appointment.scheduledAt,
        status: appointment.status,
        date: appointment.date,
        time: appointment.time,
      };

      const response = await fetch(`${socketUrl}/api/emit-appointment-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(socketPayload),
      });

      if (response.ok) {
        const result = await response.json();
        console.log("✅ Appointment update emitted to socket server:", result);
      } else {
        const errorText = await response.text();
        console.error(
          "❌ Socket server returned error:",
          response.status,
          errorText,
        );
      }
    } catch (emitError) {
      console.error("❌ Failed to emit update to socket:", emitError);
      // Don't fail the update if notification fails
    }

    // Populate for response
    await appointment.populate("createdBy", "name username email");
    await appointment.populate("withUserId", "name username email");

    return NextResponse.json(appointment, { status: 200 });
  } catch (error) {
    console.error("Error updating appointment:", error);
    return new NextResponse("Failed to update appointment", { status: 500 });
  }
}

// DELETE appointment
export async function DELETE(req: Request) {
  try {
    const { appointmentId } = await req.json();
    const { userId } = await auth(req);
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    await dbConnect();

    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) return new NextResponse("Not found", { status: 404 });

    // Only creator (userA) can delete
    if (appointment.createdBy.toString() !== userId) {
      return new NextResponse("Forbidden", { status: 403 });
    }

    await appointment.deleteOne();
    return new NextResponse("Deleted", { status: 200 });
  } catch (error) {
    console.error("Error deleting appointment:", error);
    return new NextResponse("Failed to delete appointment", { status: 500 });
  }
}
