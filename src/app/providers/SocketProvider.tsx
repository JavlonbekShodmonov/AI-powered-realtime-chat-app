"use client";

import { io } from "socket.io-client";
import React, { createContext, useContext, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

const SocketContext = createContext<any>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const [socket, setSocket] = useState<any>(null);
  interface ExtendedUser {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  }

  interface ExtendedSession {
    user?: ExtendedUser;
  }

  const { data: session } = useSession() as { data: ExtendedSession | null };

  useEffect(() => {
    if (!session?.user?.id) return;

    const base =
      process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || "http://localhost:3001";

    console.log("SocketProvider - NextAuth userId:", session.user.id);

    const s = io(base, {
      auth: {
        userId: session.user.id,
        userName: session.user.name || "Anonymous",
      },
      transports: ["websocket", "polling"],
    });

    setSocket(s);

    return () => {
      s.disconnect();
    };
  }, [session?.user?.id]);

  return (
    <SocketContext.Provider value={socket}>{children}</SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
