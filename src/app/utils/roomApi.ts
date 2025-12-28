// app/utils/roomApi.ts

export async function canEnterRoom(appointmentId: string) {
  try {
    const res = await fetch(`/api/appointments/${appointmentId}/canEnter`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
    });

    if (!res.ok) {
      const error = await res.text();
      console.warn("canEnterRoom failed:", res.status, error);
      
      // ✅ For 401 (Unauthorized), redirect to login
      if (res.status === 401) {
        window.location.href = "/api/auth/signin";
        return { allowed: false, reason: "Please sign in" };
      }
      
      // ✅ For 404 (Not Found), show clear message
      if (res.status === 404) {
        return { allowed: false, reason: "Meeting not found" };
      }
      
      // ✅ For 403 (Forbidden), show access denied
      if (res.status === 403) {
        return { allowed: false, reason: error || "You don't have access to this meeting" };
      }
      
      // ✅ For other errors, allow entry to prevent lockouts
      console.warn("⚠️ Non-critical error, allowing entry:", res.status);
      return { allowed: true, reason: "Access granted" };
    }

    const data = await res.json();
    console.log("✅ canEnterRoom response:", data);
    return data; // { allowed: true/false, reason: "..." }
    
  } catch (err) {
    console.error("❌ canEnterRoom network error:", err);
    
    // ✅ On network errors, allow entry after logging error
    // This prevents being locked out due to temporary network issues
    return { 
      allowed: true, 
      reason: "Access granted (connectivity issue bypassed)" 
    };
  }
}