import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
import clientPromise from "../src/lib/mongodb";
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
    origin: [
      "http://localhost:3000",
      "https://shadmanov.onrender.com",
      "https://summeet.live",
      "https://summeet.vercel.app",
    ],
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

// ✅ CRITICAL: Helper to normalize userId (handles ObjectId, string, etc.)
function normalizeUserId(userId: any): string {
  if (!userId) return "";
  
  // Handle MongoDB ObjectId
  if (userId._id) return String(userId._id);
  if (userId.toString) return userId.toString();
  
  return String(userId);
}

const userSocketMap = new Map<string, string[]>(); // userId -> [socketIds]
const onlineUsers = new Map<string, UserInfo>(); // userId -> UserInfo
const chatRoomUsers: Record<string, Set<string>> = {};
const meetingRoomUsers: Record<string, Set<string>> = {};
const userSubscriptions = new Map<string, any>(); // userId -> push subscription

const allowedOrigins = [
  "http://localhost:3000",
  "https://summeet.live",
  "https://summeet.vercel.app",
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
  const { subscription, userId: rawUserId } = req.body;
  const userId = normalizeUserId(rawUserId);

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

// ✅ REST endpoints for presence - FIXED
app.get("/api/presence/:userId", (req, res) => {
  const userId = normalizeUserId(req.params.userId);
  const isOnline = onlineUsers.has(userId);

  console.log(
    `🔍 Presence check for ${userId}: ${isOnline ? "✅ ONLINE" : "❌ OFFLINE"}`
  );
  console.log(`   📊 All online users:`, Array.from(onlineUsers.keys()));

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
    normalizeUserId(appointment.createdBy),
    ...(appointment.withUserId || []).map(normalizeUserId),
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
    normalizeUserId(appointment.createdBy),
    ...(appointment.withUserId || []).map(normalizeUserId),
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
  if (!usersInRoom || usersInRoom.size === 0) {
    console.log(`   ⚠️ No users in room ${roomId}`);
    io.to(roomId).emit("onlineUsersWithNames", []);
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

  const { userId: rawUserId, userName } = socket.handshake.auth || {};
  
  // ✅ CRITICAL: Normalize userId immediately
  const userId = normalizeUserId(rawUserId);

  console.log("   Auth data:", { rawUserId, userId, userName });

  if (!userId) {
    console.error("❌ No valid userId provided in auth");
    return;
  }

  socket.on('call-started', async (data) => {
    const { roomId, callerId, callerName, meetingId, timestamp } = data;
    
    console.log('📞 Call started by:', callerName, 'in room:', roomId);
    
    // Broadcast to all other users in the room
    socket.to(roomId).emit('incoming-call', {
      callerId,
      callerName,
      meetingId,
      timestamp
    });
    
    // Save call start message to database
    try {
      const Message = require('./models/Message');
      await Message.create({
        roomId,
        senderId: 'system',
        senderName: 'System',
        content: `📞 ${callerName} started a video call`,
        type: 'system',
        createdAt: new Date(timestamp)
      });
    } catch (err) {
      console.error('Error saving call start message:', err);
    }
  });

  // 🎥 VIDEO CALL - When call ends
  socket.on('call-ended', async (data) => {
    const { roomId, callerId, callerName, duration, timestamp } = data;
    
    console.log('📞 Call ended by:', callerName, 'Duration:', duration);
    
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    const durationText = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    
    // Broadcast to all users in the room
    io.to(roomId).emit('call-ended', {
      callerId,
      callerName,
      duration,
      timestamp
    });
    
    // Save call end message to database
    try {
      const Message = require('./models/Message'); 
      await Message.create({
        roomId,
        senderId: 'system',
        senderName: 'System',
        content: `📞 Call ended • Duration: ${durationText}`,
        type: 'system',
        createdAt: new Date(timestamp)
      });
    } catch (err) {
      console.error('Error saving call end message:', err);
    }
  });

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
    console.log(`✅ User ${userId} connected as ${userName || "Anonymous"} (NEW)`);
  } else {
    // Update name if we get a better one
    if (userName && existing.name === "Anonymous") {
      existing.name = userName;
      onlineUsers.set(userId, existing);
    }
    console.log(`✅ User ${userId} reconnected (EXISTING)`);
  }

  console.log(`   📊 Total online users: ${onlineUsers.size}`);

  // ✅ Join Room
  socket.on("joinRoom", async ({ roomId, cursor, limit = 20 }) => {
    socket.join(roomId);

    if (!chatRoomUsers[roomId]) {
      chatRoomUsers[roomId] = new Set();
    }

    chatRoomUsers[roomId].add(userId);

    console.log(`🏠 User ${userId} joined room ${roomId}`);
    console.log(`   Users in room:`, Array.from(chatRoomUsers[roomId]));

    const messages = await getMessagesForRoom(roomId, cursor, limit);
    socket.emit("initialMessages", messages);

    broadcastRoomUsers(roomId);
  });

  socket.on('transcript:new', async (payload) => {
    const { roomId, senderId, content, type, timestamp } = payload;

    if (!roomId || !senderId || !content) return;

    const client = await clientPromise;
    const db = client.db();

    const transcript = {
      roomId,
      senderId,
      content,
      type,
      createdAt: timestamp ? new Date(timestamp) : new Date(),
    };

    const result = await db
      .collection('videocall_transcripts')
      .insertOne(transcript);

    io.to(roomId).emit('transcript:created', {
      ...transcript,
      _id: result.insertedId.toString(),
    });
  });

  // ✅ Leave Room
  socket.on("leaveRoom", ({ roomId }) => {
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

    broadcastRoomUsers(roomId);
  });

  // Send Message
  socket.on("sendMessage", async (data) => {
    const newMessage = await sendMessage({
      roomId: data.roomId,
      senderId: data.senderId,
      content: data.content,
    });

    const senderInfo = onlineUsers.get(userId);
    const newMessageWithSenderId = {
      ...newMessage,
      sender: senderInfo ? { id: userId, name: senderInfo.name } : null,
    };

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
    socket.leave(meetingId);
    io.to(meetingId).emit("user-left", { userId });

    if (!meetingRoomUsers[meetingId]) {
      meetingRoomUsers[meetingId] = new Set();
    }

    meetingRoomUsers[meetingId].delete(userId);
  });

  // ✅ Disconnect - FIXED
  socket.on("disconnect", () => {
    const sockets = userSocketMap.get(userId) || [];
    const remaining = sockets.filter((id) => id !== socket.id);

    if (remaining.length === 0) {
      // User is fully offline
      userSocketMap.delete(userId);
      onlineUsers.delete(userId);

      console.log(`🔴 User ${userId} is now OFFLINE`);

      // Remove from all chat rooms and broadcast updates
      for (const [roomId, usersSet] of Object.entries(chatRoomUsers)) {
        if (usersSet.has(userId)) {
          usersSet.delete(userId);
          console.log(`   🚪 Removing ${userId} from room ${roomId}`);
          broadcastRoomUsers(roomId);
        }
      }

      // Clean up meeting rooms
      for (const [meetingId, usersSet] of Object.entries(meetingRoomUsers)) {
        if (usersSet.has(userId)) {
          usersSet.delete(userId);
          io.to(meetingId).emit("user-left", { userId });
        }
      }
    } else {
      userSocketMap.set(userId, remaining);
      console.log(
        `🟡 User ${userId} still online (${remaining.length} sockets)`
      );
    }
  });
});

const PORT = process.env.PORT || 3002;

server.listen(PORT, () => {
  console.log(`✅ Socket.IO server running at http://localhost:${PORT}`);
  console.log("📊 Endpoints:");
  console.log("   GET  /api/presence/:userId");
  console.log("   POST /api/subscribe-notifications");
  console.log("   POST /api/emit-appointment");
  console.log("   POST /api/emit-appointment-update");
  console.log("   GET  / (health check)");
});