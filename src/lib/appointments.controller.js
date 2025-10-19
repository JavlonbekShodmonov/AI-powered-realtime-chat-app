// appointments.controller.js
import Appointment from "..app/api/models/Appointment.js";


export const acceptAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      { status: "accepted" },
      { new: true }
    );

    if (!appointment) return res.status(404).json({ message: "Not found" });

    // ✅ Send ONLY to the appointment owner
    req.io.to(appointment.userId.toString()).emit("appointment:accepted", appointment);

    res.json(appointment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const denyAppointment = async (req, res) => {
  try {
    const appointment = await Appointment.findByIdAndUpdate(
      req.params.id,
      { status: "denied" },
      { new: true }
    );

    if (!appointment) return res.status(404).json({ message: "Not found" });

    // ✅ Send ONLY to the appointment owner
    req.io.to(appointment.userId.toString()).emit("appointment:denied", appointment);

    res.json(appointment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
