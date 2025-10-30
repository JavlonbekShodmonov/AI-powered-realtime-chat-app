"use client";

import { useEffect, useRef, useState } from "react";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import io, { Socket } from "socket.io-client";

type ChatProps = {
  roomId: string;
  targetUserId?: string;
};

export default function Chat({ roomId, targetUserId }: ChatProps) {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [summary, setSummary] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [roomUsers, setRoomUsers] = useState<string[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<{ id: string; name: string }[]>(
    []
  );
  const socketRef = useRef<Socket | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- Auto-scroll if near bottom when messages update ---
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 100) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // --- Socket setup ---
  useEffect(() => {
    if (!isLoaded || !user) return;
    if (socketRef.current) return;

    const base =
      process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || "http://localhost:3001";

    const socket = io(base, {
      path: "/socket.io",
      transports: ["websocket"],
      auth: {
        userId: user.id,
        userName: user.fullName || user.firstName || "Anonymous",
      },
    });

  socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("identify", {
        userId: user.id,
        userName: user.fullName || user.firstName || "Anonymous",
      });
      socket.emit("joinRoom", {
        roomId,
        userId: user.id,
        userName: user.fullName || user.firstName || "Anonymous",
      });
    });

    socket.on("roomUsers", (users: string[]) => setRoomUsers(users));

    socket.on("initialMessages", (grouped: Record<string, any[]>) => {
      const flat = Object.values(grouped).flat();
      setMessages(flat);
      setTimeout(
        () => messagesEndRef.current?.scrollIntoView({ behavior: "auto" }),
        50
      );
    });

    socket.on("newMessage", (message) => {
      const normalized = {
        ...message,
        _id: message._id?.toString?.() || String(message._id),
      };
      setMessages((prev) =>
        prev.some((m) => m._id === normalized._id)
          ? prev
          : [...prev, normalized]
      );
    });

    socket.on("onlineUsersWithNames", (list) => setOnlineUsers(list));

    socket.on("messageEdited", (updated) => {
      setMessages((prev) =>
        prev.map((m) => (m._id === updated._id ? { ...m, ...updated } : m))
      );
    });

    socket.on("messageDeleted", (id: string) => {
      setMessages((prev) => prev.filter((m) => m._id !== id && m.id !== id));
    });

    socket.on("user-left", () => alert("The other user has left the chat"));

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [isLoaded, user, roomId]);

  // --- Online user updates ---
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    socket.on("getOnlineUsers", (users) => setOnlineUsers(users));
    socket.on("user:online", (user) =>
      setOnlineUsers((prev) =>
        prev.some((u) => u.id === user.id) ? prev : [...prev, user]
      )
    );
    socket.on("user:offline", (id) =>
      setOnlineUsers((prev) => prev.filter((u) => u.id !== id))
    );

    return () => {
      socket.off("getOnlineUsers");
      socket.off("user:online");
      socket.off("user:offline");
    };
  }, [socketRef.current]);

  const handleExit = () => {
    if (socketRef.current) {
      socketRef.current.emit("leaveMeeting", { meetingId: roomId });
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    router.push("/schedule");
  };

  const handleSend = () => {
    if (!newMessage.trim() || !socketRef.current || !user) return;

    socketRef.current.emit("sendMessage", {
      roomId,
      senderId: user.id,
      senderName: user.fullName || user.firstName || "Anonymous",
      content: newMessage.trim(),
      createdAt: new Date(),
    });

    setNewMessage("");
  };

  const handleUpdate = (id: string) => {
    const newText = prompt("Enter updated message:");
    if (!newText || !socketRef.current) return;

    socketRef.current.emit("editMessage", {
      roomId,
      messageId: String(id),
      senderId: user?.id,
      newContent: newText,
    });

    setMessages((prev) =>
      prev.map((m) => (m._id === id ? { ...m, content: newText } : m))
    );
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this message?") || !socketRef.current) return;

    socketRef.current.emit("deleteMessage", {
      roomId,
      messageId: id,
      senderId: user?.id,
    });
  };

  const handleSummarize = async () => {
    setLoadingSummary(true);
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: messages.map((m) => m.content).join("\n"),
        }),
      });
      const data = await res.json();
      setSummary(data.summary || "No summary available.");
    } catch {
      setSummary("Failed to summarize chat.");
    } finally {
      setLoadingSummary(false);
    }
  };

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-xl">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 via-indigo-50 to-slate-100 flex justify-center items-center font-sans text-gray-800">
      <main className="flex flex-col lg:flex-row justify-center items-center lg:items-center gap-8 p-8 w-full max-w-7xl">

        {/* LEFT COLUMN */}
        <div className="flex flex-col items-center space-y-6 border-4 border-black rounded-3xl p-6 bg-white/80 shadow-xl backdrop-blur-sm hover:shadow-2xl transition-all duration-300">
          <button
            onClick={handleExit}
            className="px-6 py-3 border-2 border-indigo-500 text-indigo-600 rounded-3xl hover:bg-indigo-600 hover:text-white transition-all duration-300 font-semibold shadow-sm"
          >
            Exit
          </button>
        </div>

        {/* MIDDLE CHAT COLUMN */}
        <div className="flex-1 relative border-4 border-black bg-white/90 backdrop-blur-md rounded-3xl shadow-2xl p-6 w-full max-w-3xl transition-all duration-300 hover:shadow-indigo-200">

          {/* Online Users */}
          <div className="flex flex-wrap gap-2 mb-3 text-sm font-medium">
            {onlineUsers.length === 0 ? (
              <span className="text-gray-400 italic">No one online</span>
            ) : (
              onlineUsers.map((u) => (
                <span
                  key={u.id}
                  className="px-3 py-1 rounded-full bg-green-100 text-green-700 border border-green-300 shadow-sm"
                >
                  {u.name || "Unknown"}
                </span>
              ))
            )}
          </div>

          {/* Messages */}
          <div
            ref={containerRef}
            className="flex-1 space-y-4 overflow-y-auto mb-4 border border-gray-300 rounded-2xl p-4 bg-gradient-to-b from-white to-slate-100 shadow-inner scroll-smooth"
            style={{ wordBreak: "break-word", maxHeight: "60vh" }}
          >
            {messages.map((msg) => (
              <div
                key={msg._id}
                className={`p-3 rounded-xl shadow-sm flex flex-col justify-between transition-all duration-200 ${
                  msg.senderId === user?.id
                    ? "bg-gradient-to-r from-blue-100 to-blue-50 border border-blue-300"
                    : "bg-white border border-gray-300 hover:border-blue-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`font-semibold ${
                      msg.senderId === user?.id
                        ? "text-blue-600"
                        : "text-slate-700"
                    }`}
                  >
                    {msg.sender?.name ?? "Guest"}
                  </span>

                  {msg.senderId === user?.id && (
                    <div className="space-x-2 flex items-center">
                      <button
                        onClick={() => handleUpdate(String(msg._id))}
                        className="px-2 py-1 text-sm rounded-md bg-gradient-to-r from-yellow-300 to-yellow-400 hover:from-yellow-400 hover:to-yellow-500 text-slate-800 font-medium shadow-sm"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(String(msg._id))}
                        className="px-2 py-1 text-sm rounded-md bg-gradient-to-r from-red-400 to-red-500 hover:from-red-500 hover:to-red-600 text-white font-medium shadow-sm"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>

                <span className="mt-2 whitespace-pre-wrap break-words leading-relaxed text-slate-800">
                  {msg.content}
                </span>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="flex gap-2">
            <input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Type your message..."
              className="flex-1 p-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all duration-200"
            />
            <button
              onClick={handleSend}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 text-white hover:opacity-90 transition-all duration-200 shadow-md font-semibold"
            >
              Send
            </button>
          </div>

          {/* Summary */}
          {summary && (
            <div className="mt-6 p-4 border border-indigo-200 rounded-xl bg-indigo-50 text-left shadow-sm">
              <h3 className="font-semibold mb-2 text-indigo-700">
                Chat Summary:
              </h3>
              <p className="whitespace-pre-wrap text-slate-800">{summary}</p>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div className="flex flex-col items-center justify-center space-y-4 border-4 border-black rounded-3xl p-6 bg-white/80 shadow-xl backdrop-blur-sm hover:shadow-2xl transition-all duration-300">
          <button
            onClick={handleSummarize}
            disabled={loadingSummary}
            className="px-6 py-3 border-2 border-indigo-500 text-indigo-600 rounded-full uppercase text-lg font-semibold hover:bg-indigo-600 hover:text-white transition-all duration-300 shadow-sm"
          >
            {loadingSummary ? "Summarizing..." : "Summarize"}
          </button>

          <div className="w-0 h-0 border-l-[10px] border-r-[10px] border-b-[10px] border-l-transparent border-r-transparent border-b-indigo-500"></div>

          <h2 className="font-light text-lg text-slate-600 text-center">
            Click to summarize your chat
          </h2>
        </div>
      </main>
    </div>
  );
}
