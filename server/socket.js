const { Server } = require("socket.io");
const http = require("http");
const express = require("express");
const cors = require("cors");
const webpush = require("web-push");
const bodyParser = require("body-parser");

const app = express();

// ✅ Enable CORS and JSON parsing
app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://shadmanov.onrender.com"
    ],
    credentials: true,
  })
);

app.use(bodyParser.json());

// ✅ Configure VAPID keys for web push
webpush.setVapidDetails(
  'mailto:mohiiish.com@gmail.com',
  'BH3YqKWzhEAK_CEQyl1R8THZ1Pc0Ecjy35h60kJvhKms87LgwzeuWK1TEXzao4mibTjFmsoNI4BxypdpfKLEUUk',
  'D61NILDRRUUvq9NUd4ezNSdf33Oy5evFAIJplgPMzsI'
);

app.use(express.json());

const server = http.createServer(app);

// ✅ Track users, rooms, and subscriptions
const userSocketMap = {}; // userId -> [socketIds]
const onlineUsers = new Map(); // userId -> {socketId, name, subscription}
const roomUsers = {}; // roomId -> [userIds]
const roomMessages = {}; // roomId -> [{...message}]
const userSubscriptions = new Map(); // userId -> push subscription

const allowedOrigins = [
  "http://localhost:3000",
  "https://shadmanov.onrender.com"
];

const io = new Server(server, {
  path: "/socket.io",
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
});

// ✅ NEW: Endpoint to save push notification subscriptions
app.post("/api/subscribe-notifications", (req, res) => {
  const { subscription, userId } = req.body;
  
  console.log("📥 Received subscription request:", { 
    userId, 
    hasSubscription: !!subscription,
    endpoint: subscription?.endpoint?.substring(0, 50) + "..." 
  });
  
  if (!subscription || !userId) {
    console.error("❌ Missing subscription or userId");
    return res.status(400).json({ error: "Missing subscription or userId" });
  }

  console.log(`💾 Saving push subscription for user ${userId}`);
  userSubscriptions.set(userId, subscription);

  // Also update online user info if they're online
  if (onlineUsers.has(userId)) {
    const userInfo = onlineUsers.get(userId);
    onlineUsers.set(userId, { ...userInfo, subscription });
    console.log(`   ✅ Updated online user info for ${userId}`);
  } else {
    console.log(`   ℹ️ User ${userId} not currently online`);
  }

  console.log(`   📊 Total subscriptions: ${userSubscriptions.size}`);
  res.json({ success: true, message: "Subscription saved" });
});

// ✅ REST endpoints for presence
app.get("/api/presence/:userId", (req, res) => {
  const { userId } = req.params;
  const isOnline = onlineUsers.has(userId);
  
  console.log(`🔍 Presence check for ${userId}: ${isOnline ? "✅ ONLINE" : "❌ OFFLINE"}`);
  
  if (isOnline) {
    const userInfo = onlineUsers.get(userId);
    console.log(`   User info:`, userInfo);
  }
  
  console.log(`   Currently online users:`, Array.from(onlineUsers.keys()));
  
  res.json({ online: isOnline });
});

// ✅ FIXED: Send push notifications to ALL affected users
app.post("/api/emit-appointment", async (req, res) => {
  const appointment = req.body;
  console.log("📅 Emitting new appointment:", appointment._id);
  console.log("   Created by:", appointment.createdByName || appointment.createdBy);
  console.log("   With users:", appointment.withUserNames || appointment.withUserId);
  
  // Emit to all connected sockets
  io.emit("newAppointment", appointment);

  // ✅ Send push notifications to all users involved in the appointment
  const usersToNotify = new Set([
    appointment.createdBy,
    ...(appointment.withUserId || [])
  ]);

  console.log(`   🔔 Users to notify:`, Array.from(usersToNotify));
  console.log(`   📊 Available subscriptions:`, Array.from(userSubscriptions.keys()));

  const results = [];
  const creatorName = appointment.createdByName || "Someone";

  for (const userId of usersToNotify) {
    // Get subscription from storage
    const subscription = userSubscriptions.get(userId);
    
    if (!subscription) {
      console.log(`   ⚠️ No subscription found for user ${userId}`);
      results.push({ userId, status: 'no_subscription' });
      continue;
    }

    console.log(`   📤 Attempting to send notification to user ${userId}`);

    try {
      const payload = JSON.stringify({
        title: "New Appointment",
        body: `${creatorName} scheduled an appointment at ${new Date(appointment.scheduledAt).toLocaleString()}`,
        icon: "/favicon.avif",
        data: { 
          appointmentId: appointment._id,
          url: `/meeting/${appointment._id}`
        }
      });

      const sendResult = await webpush.sendNotification(subscription, payload);
      console.log(`   ✅ Notification sent to user ${userId}`, sendResult.statusCode);
      results.push({ userId, status: 'sent', statusCode: sendResult.statusCode });
    } catch (err) {
      console.error(`   ❌ Failed to send notification to user ${userId}:`, err.message);
      console.error(`      Status code:`, err.statusCode);
      console.error(`      Body:`, err.body);
      
      results.push({ userId, status: 'error', error: err.message });
      
      // If subscription is invalid, remove it
      if (err.statusCode === 410 || err.statusCode === 404) {
        console.log(`   🗑️ Removing invalid subscription for user ${userId}`);
        userSubscriptions.delete(userId);
      }
    }
  }

  res.json({ success: true, notifiedUsers: Array.from(usersToNotify), results });
});

// ✅ FIXED: Send push notifications for appointment updates
app.post("/api/emit-appointment-update", async (req, res) => {
  const appointment = req.body;
  console.log("📝 Emitting appointment update:", appointment._id);
  console.log("   Status:", appointment.status);
  console.log("   Created by:", appointment.createdByName || appointment.createdBy);
  
  // Emit to all connected sockets
  io.emit("appointment:updated", appointment);

  // ✅ Send push notifications to affected users
  const usersToNotify = new Set([
    appointment.createdBy,
    ...(appointment.withUserId || [])
  ]);

  console.log(`   🔔 Sending update notifications to users:`, Array.from(usersToNotify));

  const results = [];
  const creatorName = appointment.createdByName || "Someone";

  for (const userId of usersToNotify) {
    const subscription = userSubscriptions.get(userId);
    
    if (!subscription) {
      console.log(`   ⚠️ No subscription found for user ${userId}`);
      results.push({ userId, status: 'no_subscription' });
      continue;
    }

    try {
      const payload = JSON.stringify({
        title: "Appointment Updated",
        body: `${creatorName}'s appointment is now ${appointment.status}`,
        icon: "/favicon.avif",
        data: { 
          appointmentId: appointment._id,
          url: `/meeting/${appointment._id}`
        }
      });

      const sendResult = await webpush.sendNotification(subscription, payload);
      console.log(`   ✅ Update notification sent to user ${userId}`, sendResult.statusCode);
      results.push({ userId, status: 'sent', statusCode: sendResult.statusCode });
    } catch (err) {
      console.error(`   ❌ Failed to send update notification to user ${userId}:`, err.message);
      
      results.push({ userId, status: 'error', error: err.message });
      
      if (err.statusCode === 410 || err.statusCode === 404) {
        userSubscriptions.delete(userId);
      }
    }
  }

  res.json({ success: true, notifiedUsers: Array.from(usersToNotify), results });
});

// ✅ Health check endpoint
app.get("/", (req, res) => {
  res.json({ 
    status: "ok", 
    onlineUsers: Array.from(onlineUsers.keys()),
    totalConnections: Object.keys(userSocketMap).length,
    subscribedUsers: Array.from(userSubscriptions.keys()).length
  });
});

io.on("connection", (socket) => {
  console.log("🔌 New socket connected:", socket.id);

  const { userId, userName } = socket.handshake.auth || {};

  console.log("   Auth data:", { userId, userName });

  if (userId) {
    // Track online users
    if (!userSocketMap[userId]) userSocketMap[userId] = [];
    userSocketMap[userId].push(socket.id);

    // Get existing subscription if available
    const subscription = userSubscriptions.get(userId);

    onlineUsers.set(userId, {
      socketId: socket.id,
      name: userName || "Anonymous",
      subscription: subscription || null
    });

    console.log(`✅ User ${userName || userId} is now ONLINE`);
    console.log(`   Total online users: ${onlineUsers.size}`);

    // Emit presence updates
    io.emit("user:online", { id: userId, name: userName || "Anonymous" });

    const allOnline = Object.keys(userSocketMap).map((id) => ({
      id,
      name: onlineUsers.get(id)?.name || "Anonymous",
    }));
    
    io.emit("getOnlineUsers", allOnline);
    io.emit("onlineUsersWithNames", allOnline);
    
    console.log(`   Broadcasting online users:`, allOnline);
  } else {
    console.warn("⚠️ Socket connected without userId in auth!");
  }

  // ✅ Join Room
  socket.on("joinRoom", ({ roomId, userId, userName }) => {
    socket.join(roomId);
    if (!roomUsers[roomId]) roomUsers[roomId] = new Set();
    roomUsers[roomId].add(userId);

    console.log(`🏠 ${userName} joined room ${roomId}`);
    io.to(roomId).emit("roomUsers", Array.from(roomUsers[roomId]));

    // Send existing messages
    const grouped = { today: roomMessages[roomId] || [] };
    socket.emit("initialMessages", grouped);
    
    const allOnline = Object.keys(userSocketMap).map((id) => ({
      id,
      name: onlineUsers.get(id)?.name || "Anonymous",
    }));
    socket.emit("onlineUsersWithNames", allOnline);
    console.log(`   Sent online users to ${userName}:`, allOnline);
  });

  // ✅ Send Message
  socket.on("sendMessage", (data) => {
    const message = {
      _id: Date.now().toString(),
      senderId: data.senderId,
      sender: { name: data.senderName },
      content: data.content,
      createdAt: data.createdAt || new Date(),
    };

    if (!roomMessages[data.roomId]) roomMessages[data.roomId] = [];
    roomMessages[data.roomId].push(message);

    console.log(`💬 Message in room ${data.roomId}: ${message.content}`);
    io.to(data.roomId).emit("newMessage", message);
  });

  // ✅ Edit Message
  socket.on("editMessage", ({ roomId, messageId, newContent }) => {
    const messages = roomMessages[roomId];
    if (!messages) return;

    const msg = messages.find((m) => m._id === messageId);
    if (msg) msg.content = newContent;

    io.to(roomId).emit("messageEdited", msg);
  });

  // ✅ Delete Message
  socket.on("deleteMessage", ({ roomId, messageId }) => {
    if (roomMessages[roomId]) {
      roomMessages[roomId] = roomMessages[roomId].filter(
        (m) => m._id !== messageId
      );
    }
    io.to(roomId).emit("messageDeleted", messageId);
  });

  // ✅ Leave Room
  socket.on("leaveMeeting", ({ meetingId }) => {
    socket.leave(meetingId);
    io.to(meetingId).emit("user-left", { userId });
  });

  // ✅ Disconnect
  socket.on("disconnect", () => {
    if (!userId) return;

    console.log(`❌ ${userName || userId} disconnecting...`);

    userSocketMap[userId] = (userSocketMap[userId] || []).filter(
      (id) => id !== socket.id
    );

    if (userSocketMap[userId].length === 0) {
      delete userSocketMap[userId];
      onlineUsers.delete(userId);

      console.log(`   User ${userId} is now OFFLINE`);
      console.log(`   Remaining online users: ${onlineUsers.size}`);

      io.emit("user:offline", userId);
    } else {
      console.log(`   User ${userId} still has ${userSocketMap[userId].length} connection(s)`);
    }

    const allOnline = Object.keys(userSocketMap).map((id) => ({
      id,
      name: onlineUsers.get(id)?.name || "Anonymous",
    }));
    
    io.emit("getOnlineUsers", allOnline);
    io.emit("onlineUsersWithNames", allOnline);
    
    console.log(`   Broadcasting updated online users:`, allOnline);
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