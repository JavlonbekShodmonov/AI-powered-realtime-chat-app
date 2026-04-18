// utils/socketClient.ts
import { io, Socket } from "socket.io-client";

/**
 * Singleton socket manager to prevent duplicate connections
 * Especially useful during development with Fast Refresh
 */
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

  connect(userId: string, username: string, serverUrl: string = "http://localhost:3001"): Socket {
    // If already connected to the same user, return existing socket
    if (this.socket?.connected && this.currentUserId === userId) {
      console.log("⚠️ Socket already connected for user:", userId);
      return this.socket;
    }

    // Disconnect old socket if user changed
    if (this.socket && this.currentUserId !== userId) {
      console.log("🔄 User changed, disconnecting old socket");
      this.disconnect();
    }

    console.log("🔌 Creating new socket connection for user:", userId);
    
    this.socket = io(serverUrl, {
      auth: { userId, username },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    this.currentUserId = userId;
    console.log("Connecting socket with:", { id: userId, name: username });
    
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