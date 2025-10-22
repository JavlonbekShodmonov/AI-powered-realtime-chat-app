"use client";

import { io } from "socket.io-client";
import React, { createContext, useContext, useEffect, useState } from "react";
import { useUser } from "@clerk/nextjs";

const SocketContext = createContext<any>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const [socket, setSocket] = useState<any>(null);

  useEffect(() => {
    if (!user?.id) return;
    console.log("SocketProvider - Clerk userId:", user?.id);
    // connect once, and keep alive while the app is open
    const s = io("http://localhost:3001", {
      auth: { userId: user.id },
      transports: ["websocket"],
    });

    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, [user?.id]);

  return (
    <SocketContext.Provider value={socket}>
        {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}