io.on("connection", (socket) => {
  socket.on("join-room", ({ meetingId }) => {
    socket.join(meetingId);
  });

  socket.on("leave-room", ({ meetingId }) => {
    socket.leave(meetingId);
    console.log(`User left meeting ${meetingId}`);

    // Optional: Notify the other participant
    socket.to(meetingId).emit("user-left", { meetingId });
  });

  // Optional: handle full disconnect
  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});
