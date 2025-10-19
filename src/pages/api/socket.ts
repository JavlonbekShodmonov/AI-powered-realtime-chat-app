import { Server as HTTPServer } from "http";
import { Server as IOServer, Socket } from "socket.io";
import type { NextApiRequest } from "next";
import type { NextApiResponseServerIO } from "@/types/next";
import {
  getMessages,
  sendMessage,
  updateMessage,
  deleteMessage,
} from "@/lib/message.controller";
import { clerkClient } from "@clerk/nextjs/server";

const userSocketMap: Record<string, string[]> = {};
export const onlineUsers = new Map<string, string>();

function groupMessagesByDate(messages: any[]) {
  return messages.reduce((acc: Record<string, any[]>, m) => {
    const key = new Date(m.createdAt).toISOString().split("T")[0];
    (acc[key] ||= []).push(m);
    return acc;
  }, {});
}

// 🔑 NEW: Helper to populate sender info for messages
async function populateMessageSenders(messages: any[]) {
  return Promise.all(
    messages.map(async (msg) => {
      // If sender info already exists and has a name, keep it
      if (msg.sender?.name && msg.sender.name !== "Guest") {
        return msg;
      }

      // Otherwise, fetch from Clerk
      if (msg.senderId) {
        try {
          const client = await clerkClient();
          const user = await client.users.getUser(msg.senderId);
          return {
            ...msg,
            sender: {
              id: user.id,
              name: user.fullName || user.firstName || "No name",
              email: user.emailAddresses[0]?.emailAddress || "",
            },
          };
        } catch (err) {
          console.warn(`Failed to fetch user ${msg.senderId}:`, err);
          return {
            ...msg,
            sender: {
              id: msg.senderId,
              name: "Unknown User",
            },
          };
        }
      }

      return msg;
    })
  );
}

export default function handler(
  req: NextApiRequest,
  res: NextApiResponseServerIO
) {
  if (!res.socket.server.io) {
    const httpServer: HTTPServer = res.socket.server as any;
    const io = new IOServer(httpServer, {
      path: "/api/socket",
      cors: { origin: ["http://localhost:3000"], credentials: true },
    });

    res.socket.server.io = io;

    io.on("connection", (socket: Socket) => {
      // 🟢 Presence
      const userId = socket.handshake.auth?.userId;
      console.log("🔌 Socket connected:", socket.id, "User:", userId);

      if (userId) {
        if (!userSocketMap[userId]) userSocketMap[userId] = [];
        userSocketMap[userId].push(socket.id);
        onlineUsers.set(userId, socket.id);

        io.emit("user:online", userId);

        // Send full list with names
        broadcastOnlineUsers(io).catch(console.error);
      }

      // 💬 Chat rooms
      socket.on(
        "joinRoom",
        async ({ roomId, userId }: { roomId: string; userId: string }) => {
          console.log("👋 User joining room:", userId, roomId);
          socket.join(roomId);
          socket.to(roomId).emit("user-joined", { userId });

          // 🔑 FIX: Populate sender info for initial messages
          const msgs = await getMessages({ roomId, page: 1, limit: 50 });
          const populatedMsgs = await populateMessageSenders(msgs);
          
          socket.emit("initialMessages", groupMessagesByDate(populatedMsgs));

          io.to(roomId).emit(
            "roomUsers",
            Array.from(io.sockets.adapter.rooms.get(roomId) || [])
          );
        }
      );

      socket.on("sendMessage", async (data) => {
        console.log("📤 Sending message from:", data.senderId);
        const newMsg = await sendMessage(data);

        let sender = null;
        try {
          const client = await clerkClient();
          const u = await client.users.getUser(data.senderId);
          sender = {
            id: u.id,
            name: u.fullName || u.firstName || "No name",
            email: u.emailAddresses[0]?.emailAddress || "",
          };
          console.log("✅ Sender info:", sender);
        } catch (err) {
          console.warn("Failed to fetch Clerk user", err);
          sender = {
            id: data.senderId,
            name: data.senderName || "Unknown User",
          };
        }

        io.to(data.roomId).emit("newMessage", {
          ...newMsg,
          sender,
        });
      });

      socket.on("editMessage", async (data) => {
        console.log("✏️ EditMessage received server-side:", data);
        try {
          const updated = await updateMessage({
            messageId: data.messageId,
            senderId: data.senderId,
            text: data.newContent,
          });
          
          // 🔑 FIX: Populate sender info for edited message
          const populated = await populateMessageSenders([updated]);
          io.to(data.roomId).emit("messageEdited", populated[0]);
        } catch (err) {
          console.error("Error in editMessage handler:", err);
          const errorMessage =
            typeof err === "object" && err !== null && "message" in err
              ? (err as { message: string }).message
              : "Unknown error";
          socket.emit("editMessageError", { error: errorMessage });
        }
      });

      socket.on("deleteMessage", async (data) => {
        console.log("🗑️ Deleting message:", data.messageId);
        await deleteMessage({
          messageId: data.messageId,
          senderId: data.senderId,
        });
        io.to(data.roomId).emit("messageDeleted", data.messageId);
      });

      socket.on("disconnecting", () => {
        for (const roomId of socket.rooms) {
          if (roomId !== socket.id) {
            socket.to(roomId).emit("user-left", { userId });
          }
        }
      });

      // 🔴 Disconnect
      socket.on("disconnect", () => {
        console.log("❌ Socket disconnected:", socket.id);
        if (!userId) return;
        userSocketMap[userId] = (userSocketMap[userId] || []).filter(
          (id) => id !== socket.id
        );
        if (userSocketMap[userId].length === 0) {
          delete userSocketMap[userId];
          onlineUsers.delete(userId);
          io.emit("user:offline", userId);
        }
        broadcastOnlineUsers(io).catch(console.error);
      });
    });
  }

  res.end();
}

/**
 * 🔑 Helper: emits a full array of {id,name}
 * for all currently connected users
 */
async function broadcastOnlineUsers(io: IOServer) {
  const ids = Object.keys(userSocketMap);
  const users = await Promise.all(
    ids.map(async (id) => {
      try {
        const client = await clerkClient();
        const u = await client.users.getUser(id);
        return {
          id,
          name: u.fullName || u.firstName || "No name",
        };
      } catch {
        return { id, name: "Unknown" };
      }
    })
  );
  io.emit("onlineUsersWithNames", users);
}