export async function canEnterRoom(appointmentId: string) {
  try {
    const res = await fetch(`/api/appointments/${appointmentId}/canEnter`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include", // 👈 ensures Clerk session is sent
    });

    if (!res.ok) {
      const error = await res.text();
      console.warn("canEnterRoom failed:", res.status, error);
      return { allowed: false, reason: error || "Unknown error" };
    }

    const data = await res.json();
    return data; // { allowed: true/false, reason: "..."}
  } catch (err) {
    console.error("canEnterRoom error:", err);
    return { allowed: false, reason: "Network error" };
  }
}
