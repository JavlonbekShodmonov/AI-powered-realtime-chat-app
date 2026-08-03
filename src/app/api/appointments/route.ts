import { NextResponse } from "next/server";
import dbConnect from "@/lib/dbConnect";
import Appointment from "../models/Appointment";
import { auth } from "../../../lib/auth";
import { User } from "../models/User";
import { notificationQueue } from "@/lib/queues";

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

    // Daily.co room pre-creation removed — SumMeet is becoming a plugin on
    // top of existing video-call platforms, so no room needs to be
    // provisioned here anymore.

    let creatorName = "Unknown";
    let withUserNames: string[] = [];

    try {
      const creator = await User.findById(userId).select("username email name");
      if (creator) {
        creatorName = creator.name || creator.username || creator.email;
      }

      if (Array.isArray(withUserId)) {
        const users = await User.find({ _id: { $in: withUserId } }).select(
          "username email name",
        );
        withUserNames = users.map((u: any) => u.name || u.username || u.email);
      }
    } catch (userError) {
      console.error("Error fetching user names:", userError);
    }

    const socketPayload = {
      _id: appointment._id.toString(),
      createdBy: appointment.createdBy.toString(),
      createdByName: creatorName,
      withUserId: Array.isArray(appointment.withUserId)
        ? appointment.withUserId.map((id: any) => id.toString())
        : [appointment.withUserId.toString()],
      withUserNames,
      scheduledAt: appointment.scheduledAt,
      status: appointment.status,
      date: appointment.date,
      time: appointment.time,
    };

    // Enqueues directly to the same 'notification-queue' realtime-service
    // consumes — no more HTTP call to the old socket server. This doesn't
    // block appointment creation on notification delivery succeeding.
    try {
      await notificationQueue.add("appointment-created", socketPayload);
    } catch (queueError) {
      console.error("Failed to enqueue appointment-created job:", queueError);
      // Don't fail appointment creation if the notification queue is down.
    }

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
      console.error("Error fetching user names:", userError);
    }

    const socketPayload = {
      _id: appointment._id.toString(),
      createdBy: appointment.createdBy.toString(),
      createdByName: creatorName,
      withUserId: Array.isArray(appointment.withUserId)
        ? appointment.withUserId.map((id: any) => id.toString())
        : [appointment.withUserId.toString()],
      withUserNames,
      scheduledAt: appointment.scheduledAt,
      status: appointment.status,
      date: appointment.date,
      time: appointment.time,
    };

    try {
      await notificationQueue.add("appointment-updated", socketPayload);
    } catch (queueError) {
      console.error("Failed to enqueue appointment-updated job:", queueError);
    }

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
