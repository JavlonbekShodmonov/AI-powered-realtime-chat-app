// api/models/Appointment.js
import mongoose from "mongoose";

const AppointmentSchema = new mongoose.Schema(
  {
    createdBy: { type: String, required: true },       // creator's userId
    withUserId: { type: [String], required: true },    // array of invited userIds

    scheduledAt: { type: Date, required: true },

    status: {
      type: String,
      enum: ["pending", "accepted", "declined", "cancelled"],
      default: "pending",
    },
  },
  { timestamps: true }
);

export default mongoose.models.Appointment ||
  mongoose.model("Appointment", AppointmentSchema);
