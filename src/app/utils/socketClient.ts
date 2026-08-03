// utils/socketClient.ts
import { io, Socket } from "socket.io-client";

async function fetchSocketToken(): Promise<string> {
  const res = await fetch("/api/socket-token");
  if (!res.ok) throw new Error(`Failed to fetch socket token (${res.status})`);
  const data = await res.json();
  return data.token;
}

class SocketManager {
  private static instance: SocketManager;
  private socket: Socket | null = null;
  private currentUserId: string | null = null;

  private constructor() {}

  static getInstance(): SocketManager {
    if (!SocketManager.instance) {
      SocketManager.instance = new SocketManager();
    }
    return SocketManager.instance;
  }

  // `username` param kept for call-site compatibility but is now unused —
  // /api/socket-token derives userName itself from the session server-side,
  // so there's no need to trust/pass a client-supplied value anymore.
  connect(
    userId: string,
    username: string,
    serverUrl: string = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || "http://localhost:3002"
  ): Socket {
    if (this.socket?.connected && this.currentUserId === userId) {
      console.log("⚠️ Socket already connected for user:", userId);
      return this.socket;
    }

    if (this.socket && this.currentUserId !== userId) {
      console.log("🔄 User changed, disconnecting old socket");
      this.disconnect();
    }

    console.log("🔌 Creating new socket connection for user:", userId);

    this.socket = io(serverUrl, {
      // Real fix: RealtimeGateway.handleConnection requires a signed
      // `token` in the handshake and disconnects anything without one.
      // The old `auth: { userId, username }` object never satisfied that,
      // so every connection was being silently killed right after opening.
      // Using a callback (rather than a static object) means this re-fetches
      // a fresh token before every reconnect attempt too, so the 5-minute
      // token TTL from /api/socket-token never causes a stale-token failure
      // on reconnect.
      auth: async (cb) => {
        try {
          const token = await fetchSocketToken();
          cb({ token });
        } catch (err) {
          console.error("❌ Failed to fetch socket auth token:", err);
          cb({});
        }
      },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    this.currentUserId = userId;

    this.socket.on("connect", () => {
      console.log("✅ Socket connected:", this.socket?.id);
    });

    this.socket.on("disconnect", (reason) => {
      console.log("🔌 Socket disconnected:", reason);
    });

    this.socket.on("connect_error", (error) => {
      console.error("❌ Socket connection error:", error.message);
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      console.log("🔌 Disconnecting socket");
      this.socket.disconnect();
      this.socket = null;
      this.currentUserId = null;
    }
  }

  getSocket(): Socket | null {
    return this.socket;
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }
}

export const socketManager = SocketManager.getInstance();