import { Server as HTTPServer } from "http";
import { Server as IOServer, Socket } from "socket.io";
import { NextApiRequest } from "next";
import { NextApiResponseServerIO } from "@/types/next"; // You’ll create this type below
import { getMessages, sendMessage, updateMessage, deleteMessage } from "@/lib/message.controller";

// Helper to group messages by date
const groupMessagesByDate = (messages: any[]) => {
  return messages.reduce((grouped: Record<string, any[]>, message) => {
    const dateKey = new Date(message.createdAt).toISOString().split("T")[0];
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(message);
    return grouped;
  }, {});
};

export default function handler(req: NextApiRequest, res: NextApiResponseServerIO) {
  if (!res.socket.server.io) {
    const httpServer: HTTPServer = res.socket.server as any;
    const io = new IOServer(httpServer, {
      path: "/api/socket_io",
    });

    res.socket.server.io = io;

    io.on("connection", (socket: Socket) => {
      console.log("Socket connected:", socket.id);

      socket.on("joinRoom", async (roomId: string) => {
        socket.join(roomId);
        const messages = await getMessages({roomId,  page: 1, limit: 50 });
        const grouped = groupMessagesByDate(messages);
        socket.emit("initialMessages", grouped);
      });

      socket.on("sendMessage", async (data) => {
        const messageId = await sendMessage(data);
        const messages = await getMessages(data.roomId, { page: 1, limit: 50 });
        const grouped = groupMessagesByDate(messages);
        io.to(data.roomId).emit("newMessage", grouped);
      });

      socket.on("editMessage", async (data) => {
        await updateMessage({
          messageId: data.messageId,
          senderId: data.senderId,
          newContent: data.newContent,
        });
        const messages = await getMessages(data.roomId, { page: 1, limit: 50 });
        const grouped = groupMessagesByDate(messages);
        io.to(data.roomId).emit("messageEdited", grouped);
      });

      socket.on("deleteMessage", async (data: { messageId: string; senderId: string; roomId: string }) => {
        await deleteMessage({ messageId: data.messageId, senderId: data.senderId });
        const messages = await getMessages(data.roomId, { page: 1, limit: 50 });
        const grouped = groupMessagesByDate(messages);
        io.to(data.roomId).emit("messageDeleted", grouped);
      });
    });

    console.log("✅ Socket.IO server started");
  } else {
    console.log("⚠️ Socket.IO already running");
  }

  res.end();
}
