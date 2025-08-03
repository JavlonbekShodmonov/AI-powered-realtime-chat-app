import { Server } from "socket.io";
import http from "http";
import express from "express";
import { getAuth } from "@clerk/nextjs/server";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:3000"],
  },
});

export default function getReceiverSocketId(req, res) {
    const {userId} = getAuth(req);

    if(!userId) {
        return res.status(401).json({ error: "Not authenticated" });
    }
    res.status(200).json({message:`Your user ID is ${userId}`})
}

io.on("connection", (socket) => {
    const {userId} = getAuth(req);
  console.log("A user connected", socket.id);
    // Store the user's socket ID
    userSocketMap[userId] = socket.id;
    

  // io.emit() is used to send events to all the connected clients
  io.emit("getOnlineUsers", Object.keys(userSocketMap));

  socket.on("disconnect", () => {
    console.log("A user disconnected", socket.id);
    delete userSocketMap[userId];
    io.emit("getOnlineUsers", Object.keys(userSocketMap));
  });
});

export { io, app, server };
