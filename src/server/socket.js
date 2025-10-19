const { Server } = require("socket.io");
const http = require("http");
const express = require("express");
const cors = require("cors");

const app = express();

// ✅ Enable CORS and JSON parsing
app.use(cors({
  origin: "http://localhost:3000",
  credentials: true
}));
app.use(express.json());

const server = http.createServer(app);

// ✅ Track users (support multiple sockets per user)
const userSocketMap = {}; // userId -> [socketIds]
const onlineUsers = new Map(); // userId -> socketId (last active)

// Create Socket.IO server
const io = new Server(server, {
  cors: { origin: ["http://localhost:3000"], credentials: true },
});

// ✅ Presence REST API (shared state with sockets)
app.get("/api/presence/:userId", (req, res) => {
  const { userId } = req.params;
  const isOnline = onlineUsers.has(userId);
  console.log(`🔍 Presence check for ${userId}: ${isOnline ? 'ONLINE ✅' : 'OFFLINE ❌'}`);
  res.json({ online: isOnline, userId });
});

// ✅ Emit new appointment endpoint
app.post("/api/emit-appointment", (req, res) => {
  const appointment = req.body;
  console.log("📤 Emitting new appointment:", appointment._id);
  
  io.emit("newAppointment", appointment);
  
  res.json({ success: true });
});

// ✅ Emit appointment update endpoint
app.post("/api/emit-appointment-update", (req, res) => {
  const appointment = req.body;
  console.log("📤 Emitting appointment update:", appointment._id);
  
  io.emit("appointment:updated", appointment);
  
  res.json({ success: true });
});

// ✅ Debug endpoint to see all online users
app.get("/api/presence", (req, res) => {
  const allOnline = Array.from(onlineUsers.keys());
  res.json({ 
    count: allOnline.length,
    users: allOnline 
  });
});

io.on("connection", (socket) => {
  console.log("🔌 New socket connected:", socket.id);
  console.log("Handshake auth:", socket.handshake.auth);

  const userId = socket.handshake.auth?.userId;

  if (userId) {
    // Save user -> socket mapping
    if (!userSocketMap[userId]) {
      userSocketMap[userId] = [];
    }
    userSocketMap[userId].push(socket.id);

    onlineUsers.set(userId, socket.id);

    console.log("✅ User connected:", userId);
    console.log("📊 Online users:", Array.from(onlineUsers.keys()));

    io.emit("user:online", userId);
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  } else {
    console.warn("⚠️ Socket connected without userId!");
  }

  socket.on("disconnect", () => {
    console.log("❌ Socket disconnected:", socket.id);

    if (userId) {
      // Remove socket from user's list
      userSocketMap[userId] = (userSocketMap[userId] || []).filter(
        (id) => id !== socket.id
      );

      // If no sockets left → user offline
      if (userSocketMap[userId].length === 0) {
        delete userSocketMap[userId];
        onlineUsers.delete(userId);

        console.log(`🚪 User ${userId} went offline`);
        console.log("📊 Remaining online users:", Array.from(onlineUsers.keys()));
        
        io.emit("user:offline", userId);
      }

      io.emit("getOnlineUsers", Object.keys(userSocketMap));
    }
  });
});

// Utility to check if user is online
function isUserOnline(userId) {
  return onlineUsers.has(userId);
}

server.listen(3001, () => {
  console.log("✅ Socket.IO + Presence API running on http://localhost:3001");
  console.log("✅ Presence endpoint: http://localhost:3001/api/presence/:userId");
  console.log("✅ Appointment emit: http://localhost:3001/api/emit-appointment");
});

// ⚠️ Do NOT import this file into Next.js routes (causes ESM issues).
// Keep it standalone.
module.exports = { io, server, userSocketMap, app, isUserOnline };