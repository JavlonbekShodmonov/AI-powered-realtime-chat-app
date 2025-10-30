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
  const base = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || "http://localhost:3001";
  console.log("SocketProvider - Clerk userId:", user?.id);
  const s = io(base, {
    auth: { userId: user.id, userName: user.fullName || user.firstName || "Anonymous" },
    transports: ["websocket", "polling"]
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