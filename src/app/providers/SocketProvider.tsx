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
    
    // ✅ CRITICAL FIX: Use environment variable with fallback
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || "http://localhost:3001";
    
    console.log("🔌 Connecting to socket server:", socketUrl);
    
    const s = io(socketUrl, {
      auth: { userId: user.id },
      transports: ["websocket", "polling"], // ✅ Add polling as fallback
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    s.on("connect", () => {
      console.log("✅ Socket connected successfully");
    });

    s.on("connect_error", (error) => {
      console.error("❌ Socket connection error:", error);
    });

    setSocket(s);

    return () => {
      console.log("🔴 Disconnecting socket");
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