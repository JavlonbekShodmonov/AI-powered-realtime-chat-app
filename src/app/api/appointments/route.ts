import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import dbConnect from "@/lib/dbConnect";
import Appointment from "../models/Appointment";

// CREATE appointment
export async function POST(req: Request) {
  try {
    const { withUserId, scheduledAt } = await req.json();
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    await dbConnect();

    const appointment = new Appointment({
      createdBy: userId,
      withUserId,
      scheduledAt,
    });

    await appointment.save();

    // ✅ Emit to socket server on port 3001 for real-time updates
    try {
      const socketUrl = process.env.SOCKET_SERVER_URL || 'http://localhost:3001';
      const response = await fetch(`${socketUrl}/api/emit-appointment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _id: appointment._id.toString(),
          createdBy: appointment.createdBy,
          withUserId: appointment.withUserId,
          scheduledAt: appointment.scheduledAt,
          status: appointment.status,
          date: appointment.date,
          time: appointment.time,
        }),
      });
      
      if (response.ok) {
        console.log('✅ Appointment emitted to socket server');
      } else {
        console.warn('⚠️ Socket server returned non-OK status:', response.status);
      }
    } catch (emitError) {
      console.error('❌ Failed to emit appointment to socket:', emitError);
    }

    return NextResponse.json(appointment, { status: 201 });
  } catch (error) {
    console.error(error);
    return new NextResponse("Failed to create appointment", { status: 500 });
  }
}

// GET all appointments for logged-in user
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    await dbConnect();

    const appointments = await Appointment.find({
      $or: [
        { createdBy: userId }, // appointments I created
        { withUserId: { $in:[userId] } }, // appointments made with me
      ],
    })
      .populate("createdBy", "username email") // optional
      .populate("withUserId", "username email");

    return NextResponse.json(appointments, { status: 200 });
  } catch (error) {
    console.error(error);
    return new NextResponse("Failed to fetch appointments", { status: 500 });
  }
}

// UPDATE appointment
export async function PATCH(req: Request) {
  try {
    const { appointmentId, status, date, time } = await req.json();
    const { userId } = await auth();
    if (!userId) return new NextResponse("Unauthorized", { status: 401 });

    await dbConnect();

    const appointment = await Appointment.findById(appointmentId);
    if (!appointment) return new NextResponse("Not found", { status: 404 });

    if (status) appointment.status = status;
    if (date) appointment.date = date;
    if (time) appointment.time = time;

    await appointment.save();

    // ✅ Emit update to socket server
    try {
      const socketUrl = process.env.SOCKET_SERVER_URL || 'http://localhost:3001';
      await fetch(`${socketUrl}/api/emit-appointment-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _id: appointment._id.toString(),
          createdBy: appointment.createdBy,
          withUserId: appointment.withUserId,
          scheduledAt: appointment.scheduledAt,
          status: appointment.status,
          date: appointment.date,
          time: appointment.time,
        }),
      });
    } catch (emitError) {
      console.error('❌ Failed to emit update to socket:', emitError);
    }

    return NextResponse.json(appointment, { status: 200 });
  } catch (error) {
    console.error(error);
    return new NextResponse("Failed to update appointment", { status: 500 });
  }
}

// DELETE appointment
export async function DELETE(req: Request) {
  try {
    const { appointmentId } = await req.json();
    const { userId } = await auth();
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
    console.error(error);
    return new NextResponse("Failed to delete appointment", { status: 500 });
  }
}