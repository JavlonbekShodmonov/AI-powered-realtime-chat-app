import type { Server as SocketIOServer } from "socket.io";

declare global {
  // Extend globalThis with io
  var io: SocketIOServer | undefined;
}

export {};
