"use client";

import React, { useEffect, useState } from "react";
import { canEnterRoom } from "@/app/utils/roomApi";
import Chat from "./Chat";

export default function MeetingPage({ params }: { params: { id: string } }) {
  const appointmentId = params.id;
  const [status, setStatus] = useState<{ allowed: boolean; reason?: string }>({
    allowed: false,
  });

  useEffect(() => {
    async function check() {
      const res = await canEnterRoom(appointmentId);
      setStatus(res);
    }
    check();

    // poll every 2s until allowed
    const interval = setInterval(check, 2000);
    return () => clearInterval(interval);
  }, [appointmentId]);

  if (!status.allowed) {
    return (
      <div className="p-4 text-red-500">
        ❌ Access denied — {status.reason || "user is not online"}
      </div>
    );
  }

  return <div className="p-4">✅ Welcome to room {appointmentId}
  <Chat roomId={appointmentId} />
  </div>;
}
