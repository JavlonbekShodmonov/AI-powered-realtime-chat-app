const { Server } = require("socket.io");
const http = require("http");
const express = require("express");
const cors = require("cors");

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

app.use(express.json());

const server = http.createServer(app);

// ✅ Track users and rooms
const userSocketMap = {}; // userId -> [socketIds]
const onlineUsers = new Map(); // userId -> {socketId, name}
const roomUsers = {}; // roomId -> [userIds]
const roomMessages = {}; // roomId -> [{...message}]

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


// ✅ REST endpoints for presence and appointments
app.get("/api/presence/:userId", (req, res) => {
  const { userId } = req.params;
  const isOnline = onlineUsers.has(userId);
  
  // ✅ Enhanced logging
  console.log(`🔍 Presence check for ${userId}: ${isOnline ? "✅ ONLINE" : "❌ OFFLINE"}`);
  
  if (isOnline) {
    const userInfo = onlineUsers.get(userId);
    console.log(`   User info:`, userInfo);
  }
  
  console.log(`   Currently online users:`, Array.from(onlineUsers.keys()));
  
  res.json({ online: isOnline });
});

app.post("/api/emit-appointment", (req, res) => {
  const appointment = req.body;
  console.log("📅 Emitting new appointment:", appointment._id);
  io.emit("newAppointment", appointment);
  res.json({ success: true });
});

app.post("/api/emit-appointment-update", (req, res) => {
  const appointment = req.body;
  console.log("📝 Emitting appointment update:", appointment._id);
  io.emit("appointment:updated", appointment);
  res.json({ success: true });
});

// ✅ Health check endpoint
app.get("/", (req, res) => {
  res.json({ 
    status: "ok", 
    onlineUsers: Array.from(onlineUsers.keys()),
    totalConnections: Object.keys(userSocketMap).length
  });
});

io.on("connection", (socket) => {
  console.log("🔌 New socket connected:", socket.id);

  const { userId, userName } = socket.handshake.auth || {};

  // ✅ Enhanced logging for debugging
  console.log("   Auth data:", { userId, userName });

  if (userId) {
    // Track online users
    if (!userSocketMap[userId]) userSocketMap[userId] = [];
    userSocketMap[userId].push(socket.id);

    onlineUsers.set(userId, {
      socketId: socket.id,
      name: userName || "Anonymous",
    });

    console.log(`✅ User ${userName || userId} is now ONLINE`);
    console.log(`   Total online users: ${onlineUsers.size}`);

    // Emit presence updates
    io.emit("user:online", { id: userId, name: userName || "Anonymous" });

    // ✅ FIXED: Emit with consistent event names
    const allOnline = Object.keys(userSocketMap).map((id) => ({
      id,
      name: onlineUsers.get(id)?.name || "Anonymous",
    }));
    
    // Emit BOTH event names for compatibility
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
    
    // ✅ NEW: Send current online users when joining room
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

    // ✅ FIXED: Emit updated online users list with BOTH event names
    const allOnline = Object.keys(userSocketMap).map((id) => ({
      id,
      name: onlineUsers.get(id)?.name || "Anonymous",
    }));
    
    io.emit("getOnlineUsers", allOnline);
    io.emit("onlineUsersWithNames", allOnline);
    
    console.log(`   Broadcasting updated online users:`, allOnline);
  });
});

server.listen(3001, () => {
  console.log("✅ Socket.IO server running at http://localhost:3001");
  console.log("📊 Endpoints:");
  console.log("   GET  /api/presence/:userId");
  console.log("   POST /api/emit-appointment");
  console.log("   POST /api/emit-appointment-update");
  console.log("   GET  / (health check)");
});