const { Server } = require("socket.io");
const http = require("http");
const express = require("express");
const cors = require("cors");

const app = express();

// ✅ Enable CORS and JSON parsing
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());

const server = http.createServer(app);

// ✅ Track users and rooms
const userSocketMap = {}; // userId -> [socketIds]
const onlineUsers = new Map(); // userId -> socketId
const roomUsers = {}; // roomId -> [userIds]
const roomMessages = {}; // roomId -> [{...message}]

// ✅ NEW: Store user info (to show names)
const userInfoMap = {}; // userId -> { userName }

const io = new Server(server, {
  cors: { origin: ["http://localhost:3000"], credentials: true },
});

// ✅ REST endpoints for presence and appointments
app.get("/api/presence/:userId", (req, res) => {
  const { userId } = req.params;
  res.json({ online: onlineUsers.has(userId) });
});

app.post("/api/emit-appointment", (req, res) => {
  const appointment = req.body;
  io.emit("newAppointment", appointment);
  res.json({ success: true });
});

app.post("/api/emit-appointment-update", (req, res) => {
  const appointment = req.body;
  io.emit("appointment:updated", appointment);
  res.json({ success: true });
});

io.on("connection", (socket) => {
  console.log("🔌 New socket connected:", socket.id);

  const { userId, userName } = socket.handshake.auth || {};

  if (userId) {
    // Track online users
    if (!userSocketMap[userId]) userSocketMap[userId] = [];
    userSocketMap[userId].push(socket.id);
    onlineUsers.set(userId, {
      socketId: socket.id,
      name: userName || "Anonymous",
    });

    // Emit presence updates
    io.emit("user:online", { id: userId, name: userName || "Anonymous" });

    // Emit full list of users with names
    const allOnline = Object.keys(userSocketMap).map((id) => ({
      id,
      name: onlineUsers.get(id)?.name || "Anonymous",
    }));
    io.emit("getOnlineUsers", allOnline);

    console.log(`✅ User ${userName || userId} connected`);
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

    console.log(`❌ ${userName || userId} disconnected`);

    userSocketMap[userId] = (userSocketMap[userId] || []).filter(
      (id) => id !== socket.id
    );

    if (userSocketMap[userId].length === 0) {
      delete userSocketMap[userId];
      onlineUsers.delete(userId);

      // ✅ NEW: Remove from userInfoMap
      delete userInfoMap[userId];

      io.emit("user:offline", userId);
    }

    // ✅ UPDATED: Emit full list with names
    const allOnline = Object.keys(userSocketMap).map((id) => ({
      id,
      name: onlineUsers.get(id)?.name || "Anonymous",
    }));
    io.emit("getOnlineUsers", allOnline);
  });
});

server.listen(3001, () => {
  console.log(
    "✅ Socket.IO + Chat + Presence running at http://localhost:3001"
  );
});
