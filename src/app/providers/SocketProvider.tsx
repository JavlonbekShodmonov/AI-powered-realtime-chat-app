"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { io, Socket } from "socket.io-client";

const SocketContext = createContext<Socket | null>(null);

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }: { children: React.ReactNode }) => {
  const { status } = useSession();
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;

    let socketInstance: Socket | null = null;

    async function initSocket() {
      try {
        console.log("⏳ Fetching socket token...");
        const res = await fetch("/api/socket-token");
        if (!res.ok) throw new Error("Failed to fetch socket auth token");
        
        const { token } = await res.json();
        const socketUrl =
          process.env.NEXT_PUBLIC_REALTIME_SERVICE_URL ||
          process.env.NEXT_PUBLIC_SOCKET_SERVER_URL ||
          "https://summeet-live.onrender.com";
        
        console.log("🔌 Connecting to socket server at:", socketUrl);

        socketInstance = io(socketUrl, {
          auth: { token },
          transports: ["websocket"],
        });

        socketInstance.on("connect", () => {
          console.log("✅ Socket connected successfully! ID:", socketInstance?.id);
        });

        socketInstance.on("connect_error", (err) => {
          console.error("❌ Socket connection error:", err.message);
        });

        socketInstance.on("disconnect", (reason) => {
          console.warn("⚠️ Socket disconnected:", reason);
        });

        setSocket(socketInstance);
      } catch (err) {
        console.error("Socket authentication error:", err);
      }
    }

    initSocket();

    return () => {
      if (socketInstance) {
        socketInstance.disconnect();
      }
    };
  }, [status]);

  return (
    <SocketContext.Provider value={socket}>
      {children}
    </SocketContext.Provider>
  );
};