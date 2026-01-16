import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
import { Server, Socket } from "socket.io";
import http from "http";
import express from "express";
import cors from "cors";
import webpush from "web-push";
import bodyParser from "body-parser";
import { getMessagesForRoom } from "../src/lib/getMessagesForRoom";
import {
  sendMessage,
  updateMessage,
  deleteMessage,
} from "../src/lib/message.controller";

const app = express();

app.use(
  cors({
    origin: ["http://localhost:3000", "https://shadmanov.onrender.com"],
    credentials: true,
  })
);

app.use(bodyParser.json());
app.use(express.json());

// Configure VAPID keys for web push
webpush.setVapidDetails(
  "mailto:mohiiish.com@gmail.com",
  "BH3YqKWzhEAK_CEQyl1R8THZ1Pc0Ecjy35h60kJvhKms87LgwzeuWK1TEXzao4mibTjFmsoNI4BxypdpfKLEUUk",
  "D61NILDRRUUvq9NUd4ezNSdf33Oy5evFAIJplgPMzsI"
);

const server = http.createServer(app);

// ✅ TypeScript-friendly tracking structures
interface UserInfo {
  socketId: string;
  name: string;
  subscription: any | null;
}

const userSocketMap = new Map<string, string[]>(); // userId -> [socketIds]
const onlineUsers = new Map<string, UserInfo>(); // userId -> UserInfo
const chatRoomUsers: Record<string, Set<string>> = {};
const meetingRoomUsers: Record<string, Set<string>> = {};
const userSubscriptions = new Map<string, any>(); // userId -> push subscription

const allowedOrigins = [
  "http://localhost:3000",
  "https://shadmanov.onrender.com",
];

const io = new Server(server, {
  path: "/socket.io",
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

// Make io globally accessible
(globalThis as any).io = io;

// ✅ Endpoint to save push notification subscriptions
app.post("/api/subscribe-notifications", (req, res) => {
  const { subscription, userId } = req.body;

  console.log("📥 Received subscription request:", {
    userId,
    hasSubscription: !!subscription,
    endpoint: subscription?.endpoint?.substring(0, 50) + "...",
  });

  if (!subscription || !userId) {
    console.error("❌ Missing subscription or userId");
    return res.status(400).json({ error: "Missing subscription or userId" });
  }

  console.log(`💾 Saving push subscription for user ${userId}`);
  userSubscriptions.set(userId, subscription);

  if (onlineUsers.has(userId)) {
    const userInfo = onlineUsers.get(userId)!;
    onlineUsers.set(userId, { ...userInfo, subscription });
    console.log(`   ✅ Updated online user info for ${userId}`);
  }

  console.log(`   📊 Total subscriptions: ${userSubscriptions.size}`);
  res.json({ success: true, message: "Subscription saved" });
});

// ✅ REST endpoints for presence
app.get("/api/presence/:userId", (req, res) => {
  const { userId } = req.params;
  const isOnline = onlineUsers.has(userId);

  console.log(
    `🔍 Presence check for ${userId}: ${isOnline ? "✅ ONLINE" : "❌ OFFLINE"}`
  );

  if (isOnline) {
    const userInfo = onlineUsers.get(userId);
    console.log(`   User info:`, userInfo);
  }

  res.json({ online: isOnline });
});

// ✅ Send push notifications to ALL affected users
app.post("/api/emit-appointment", async (req, res) => {
  const appointment = req.body;
  console.log("📅 Emitting new appointment:", appointment._id);

  io.emit("newAppointment", appointment);

  const usersToNotify = new Set([
    appointment.createdBy,
    ...(appointment.withUserId || []),
  ]);

  console.log(`   🔔 Users to notify:`, Array.from(usersToNotify));

  const results = [];
  const creatorName = appointment.createdByName || "Someone";

  for (const userId of usersToNotify) {
    const subscription = userSubscriptions.get(userId);

    if (!subscription) {
      console.log(`   ⚠️ No subscription found for user ${userId}`);
      results.push({ userId, status: "no_subscription" });
      continue;
    }

    try {
      const payload = JSON.stringify({
        title: "New Appointment",
        body: `${creatorName} scheduled an appointment at ${new Date(
          appointment.scheduledAt
        ).toLocaleString()}`,
        icon: "/favicon.avif",
        data: {
          appointmentId: appointment._id,
          url: `/meeting/${appointment._id}`,
        },
      });

      const sendResult = await webpush.sendNotification(subscription, payload);
      console.log(`   ✅ Notification sent to user ${userId}`);
      results.push({
        userId,
        status: "sent",
        statusCode: sendResult.statusCode,
      });
    } catch (err: any) {
      console.error(
        `   ❌ Failed to send notification to user ${userId}:`,
        err.message
      );
      results.push({ userId, status: "error", error: err.message });

      if (err.statusCode === 410 || err.statusCode === 404) {
        userSubscriptions.delete(userId);
      }
    }
  }

  res.json({
    success: true,
    notifiedUsers: Array.from(usersToNotify),
    results,
  });
});

// ✅ Send push notifications for appointment updates
app.post("/api/emit-appointment-update", async (req, res) => {
  const appointment = req.body;
  console.log("📝 Emitting appointment update:", appointment._id);

  io.emit("appointment:updated", appointment);

  const usersToNotify = new Set([
    appointment.createdBy,
    ...(appointment.withUserId || []),
  ]);

  const results = [];
  const creatorName = appointment.createdByName || "Someone";

  for (const userId of usersToNotify) {
    const subscription = userSubscriptions.get(userId);

    if (!subscription) {
      results.push({ userId, status: "no_subscription" });
      continue;
    }

    try {
      const payload = JSON.stringify({
        title: "Appointment Updated",
        body: `${creatorName}'s appointment is now ${appointment.status}`,
        icon: "/favicon.avif",
        data: {
          appointmentId: appointment._id,
          url: `/meeting/${appointment._id}`,
        },
      });

      const sendResult = await webpush.sendNotification(subscription, payload);
      results.push({
        userId,
        status: "sent",
        statusCode: sendResult.statusCode,
      });
    } catch (err: any) {
      results.push({ userId, status: "error", error: err.message });
      if (err.statusCode === 410 || err.statusCode === 404) {
        userSubscriptions.delete(userId);
      }
    }
  }

  res.json({
    success: true,
    notifiedUsers: Array.from(usersToNotify),
    results,
  });
});

// ✅ Health check endpoint
app.get("/", (req, res) => {
  res.json({
    status: "ok",
    onlineUsers: Array.from(onlineUsers.keys()),
    totalConnections: userSocketMap.size,
    subscribedUsers: userSubscriptions.size,
  });
});

// ✅ Helper function to broadcast online users in a room
function broadcastRoomUsers(roomId: string) {
  const usersInRoom = chatRoomUsers[roomId];
  if (!usersInRoom) {
    console.log(`   ⚠️ No users tracked for room ${roomId}`);
    return;
  }

  console.log(`   📊 All users in room ${roomId}:`, Array.from(usersInRoom));
  console.log(
    `   📊 All online users globally:`,
    Array.from(onlineUsers.keys())
  );

  // ✅ CRITICAL: Only include users who are BOTH in the room AND online
  const onlineInRoom = Array.from(usersInRoom)
    .filter((userId) => {
      const isOnline = onlineUsers.has(userId);
      console.log(`      User ${userId}: in room=${true}, online=${isOnline}`);
      return isOnline;
    })
    .map((userId) => ({
      id: userId,
      name: onlineUsers.get(userId)?.name || "Anonymous",
    }));

  console.log(
    `   ✅ Sending to room ${roomId} ONLY these users:`,
    onlineInRoom
  );

  // Only broadcast to users IN THIS ROOM
  io.to(roomId).emit("onlineUsersWithNames", onlineInRoom);
}

io.on("connection", (socket: Socket) => {
  console.log("🔌 New socket connected:", socket.id);

  const { userId, userName } = socket.handshake.auth || {};

  console.log("   Auth data:", { userId, userName });

  if (userId) {
    // Track sockets
    if (!userSocketMap.has(userId)) {
      userSocketMap.set(userId, []);
    }
    userSocketMap.get(userId)!.push(socket.id);

    const existing = onlineUsers.get(userId);
    const subscription = userSubscriptions.get(userId) || null;

    if (!existing) {
      // First time online
      onlineUsers.set(userId, {
        socketId: socket.id,
        name: userName || "Anonymous",
        subscription,
      });
    } else {
      // 🔥 IMPORTANT: update name if we get a better one
      if (userName && existing.name === "Anonymous") {
        existing.name = userName;
        onlineUsers.set(userId, existing);
      }
    }

    console.log(
      `✅ User ${userId} connected as ${onlineUsers.get(userId)?.name}`
    );
  }

  // ✅ SINGLE JOIN ROOM HANDLER - Room-specific online users
  socket.on("joinRoom", async ({ roomId, cursor, limit = 20 }) => {
    if (!userId) return;

    socket.join(roomId);

    if (!chatRoomUsers[roomId]) {
      chatRoomUsers[roomId] = new Set();
    }

    chatRoomUsers[roomId].add(userId);

    console.log(`🏠 User ${userId} joined room ${roomId}`);
    console.log(`   Users in room:`, Array.from(chatRoomUsers[roomId]));

    const messages = await getMessagesForRoom(roomId, cursor, limit);
    socket.emit("initialMessages", messages);

    await broadcastRoomUsers(roomId);
  });

  // ✅ Leave Room
  socket.on("leaveRoom", async ({ roomId }) => {
    if (!userId) return;

    socket.leave(roomId);

    const room = chatRoomUsers[roomId];
    if (!room) return;

    room.delete(userId);

    console.log(`🚪 User ${userId} left room ${roomId}`);
    console.log(`   Remaining users:`, Array.from(room));

    if (room.size === 0) {
      delete chatRoomUsers[roomId];
      return;
    }

    await broadcastRoomUsers(roomId);
  });

  // Send Message
  socket.on("sendMessage", async (data) => {
    const newMessage = await sendMessage({
      roomId: data.roomId,
      senderId: data.senderId,
      content: data.content,
    });

    const senderInfo = onlineUsers.get(data.senderId);
    const newMessageWithSenderId = {
      ...newMessage,
      sender: senderInfo ? { id: data.senderId, name: senderInfo.name } : null,
    };

    // ✅ Only send to users IN THIS ROOM
    io.to(data.roomId).emit("newMessage", newMessageWithSenderId);
  });

  // Edit Message
  socket.on(
    "editMessage",
    async ({ messageId, senderId, roomId, newContent }) => {
      const updatedMessage = await updateMessage({
        messageId,
        senderId,
        text: newContent,
      });
      io.to(roomId).emit("messageEdited", updatedMessage);
    }
  );

  // Delete Message
  socket.on("deleteMessage", async ({ messageId, senderId, roomId }) => {
    await deleteMessage({ messageId, senderId });
    io.to(roomId).emit("messageDeleted", messageId);
  });

  // ✅ Leave Meeting
  socket.on("leaveMeeting", ({ meetingId }) => {
    if (userId) {
      socket.leave(meetingId);
      io.to(meetingId).emit("user-left", { userId });

      if (!meetingRoomUsers[meetingId]) {
        meetingRoomUsers[meetingId] = new Set();
      }

      meetingRoomUsers[meetingId].delete(userId);

      // ❌ DO NOT call broadcastRoomUsers here
    }
  });

  // ✅ Disconnect
  socket.on("disconnect", () => {
    if (!userId) return;

    const sockets = userSocketMap.get(userId) || [];
    const remaining = sockets.filter((id) => id !== socket.id);

    if (remaining.length === 0) {
      userSocketMap.delete(userId);
      onlineUsers.delete(userId);

      console.log(`🔴 User ${userId} is now OFFLINE`);
    } else {
      userSocketMap.set(userId, remaining);
      console.log(
        `🟡 User ${userId} still online (${remaining.length} sockets)`
      );
    }
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`✅ Socket.IO server running at http://localhost:${PORT}`);
  console.log("📊 Endpoints:");
  console.log("   GET  /api/presence/:userId");
  console.log("   POST /api/subscribe-notifications");
  console.log("   POST /api/emit-appointment");
  console.log("   POST /api/emit-appointment-update");
  console.log("   GET  / (health check)");
});
