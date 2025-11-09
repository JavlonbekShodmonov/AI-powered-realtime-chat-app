"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import io, { Socket } from "socket.io-client";
import { useSession } from "next-auth/react";
import 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id?: string
      name?: string | null
      email?: string | null
      image?: string | null
    }
  }
}

type ChatProps = {
  roomId: string;
  targetUserId?: string;
};

export default function Chat({ roomId, targetUserId }: ChatProps) {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [summary, setSummary] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [roomUsers, setRoomUsers] = useState<string[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<{ id: string; name: string }[]>([]);

  const socketRef = useRef<Socket | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll when messages update
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 100) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Socket setup
  useEffect(() => {
    if (status !== "authenticated" || !session?.user) return;
    if (socketRef.current) return;

    const base = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || "http://localhost:3001";
    const socket = io(base, {
      path: "/socket.io",
      transports: ["websocket"],
      auth: {
        userId: session.user.id,
        userName: session.user.name || "Anonymous",
      },
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      console.log("🔌 Chat socket connected:", socket.id);
      
      socket.emit("identify", {
        userId: session.user.id,
        userName: session.user.name || "Anonymous",
      });
      
      socket.emit("joinRoom", {
        roomId,
        userId: session.user.id,
        userName: session.user.name || "Anonymous",
      });
    });

    socket.on("roomUsers", (users: string[]) => {
      console.log("👥 Room users updated:", users);
      setRoomUsers(users);
    });

    socket.on("initialMessages", (grouped: Record<string, any[]>) => {
      const flat = Object.values(grouped).flat();
      console.log("📨 Initial messages received:", flat.length);
      setMessages(flat);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "auto" }), 50);
    });

    socket.on("newMessage", (message) => {
      console.log("💬 New message:", message);
      const normalized = {
        ...message,
        _id: message._id?.toString?.() || String(message._id),
      };
      setMessages((prev) =>
        prev.some((m) => m._id === normalized._id) ? prev : [...prev, normalized]
      );
    });

    // ✅ Listen for BOTH event names
    socket.on("onlineUsersWithNames", (list) => {
      console.log("✅ Online users received (onlineUsersWithNames):", list);
      setOnlineUsers(list);
    });

    socket.on("getOnlineUsers", (list) => {
      console.log("✅ Online users received (getOnlineUsers):", list);
      setOnlineUsers(list);
    });

    socket.on("user:online", (user) => {
      console.log("👤 User came online:", user);
      setOnlineUsers((prev) => {
        const exists = prev.some((u) => u.id === user.id);
        if (exists) return prev;
        return [...prev, user];
      });
    });

    socket.on("user:offline", (userId) => {
      console.log("👤 User went offline:", userId);
      setOnlineUsers((prev) => prev.filter((u) => u.id !== userId));
    });

    socket.on("messageEdited", (updated) => {
      console.log("✏️ Message edited:", updated);
      setMessages((prev) =>
        prev.map((m) => (m._id === updated._id ? { ...m, ...updated } : m))
      );
    });

    socket.on("messageDeleted", (id: string) => {
      console.log("🗑️ Message deleted:", id);
      setMessages((prev) => prev.filter((m) => m._id !== id && m.id !== id));
    });

    socket.on("user-left", () => {
      console.log("👋 User left the chat");
      alert("The other user has left the chat");
    });

    return () => {
      console.log("🔌 Disconnecting chat socket");
      socket.disconnect();
      socketRef.current = null;
    };
  }, [status, session, roomId]);

  const handleExit = () => {
    if (socketRef.current) {
      socketRef.current.emit("leaveMeeting", { meetingId: roomId });
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    router.push("/schedule");
  };

  const handleSend = () => {
    if (!newMessage.trim() || !socketRef.current || !session?.user) return;
    socketRef.current.emit("sendMessage", {
      roomId,
      senderId: session.user.id,
      senderName: session.user.name || "Anonymous",
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
      senderId: session?.user.id,
      newContent: newText,
    });
    setMessages((prev) => prev.map((m) => (m._id === id ? { ...m, content: newText } : m)));
  };

  const handleDelete = (id: string) => {
    if (!confirm("Delete this message?") || !socketRef.current) return;
    socketRef.current.emit("deleteMessage", {
      roomId,
      messageId: id,
      senderId: session?.user.id,
    });
  };

  const handleSummarize = async () => {
    setLoadingSummary(true);
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: messages.map((m) => m.content).join("\n") }),
      });
      const data = await res.json();
      setSummary(data.summary || "No summary available.");
    } catch {
      setSummary("Failed to summarize chat.");
    } finally {
      setLoadingSummary(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-xl">Loading...</p>
      </div>
    );
  }

  if (status === "unauthenticated") {
    router.push("/api/auth/signin");
    return null;
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
        <div className="relative border-4 border-black bg-white/90 backdrop-blur-md rounded-3xl shadow-2xl p-6 w-full max-w-3xl h-[85vh] flex flex-col transition-all duration-300 hover:shadow-indigo-200 overflow-hidden">
          {/* Online Users */}
          <div className="mb-3">
            <div className="text-xs text-gray-500 mb-1">
              Online Users ({onlineUsers.length}):
            </div>
            <div className="flex flex-wrap gap-2 text-sm font-medium">
              {onlineUsers.length === 0 ? (
                <span className="text-gray-400 italic">Loading online users...</span>
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
          </div>

          {/* Messages */}
          <div
            ref={containerRef}
            className="flex-1 space-y-4 overflow-y-auto mb-4 border border-gray-300 rounded-2xl p-4 bg-gradient-to-b from-white to-slate-100 shadow-inner scroll-smooth"
            style={{
              wordBreak: "break-word",
              height: "100%",
              maxHeight: "100%",
            }}
          >
            {messages.map((msg) => (
              <div
                key={msg._id}
                className={`p-3 rounded-xl shadow-sm flex flex-col justify-between transition-all duration-200 ${
                  msg.senderId === session?.user?.id
                    ? "bg-gradient-to-r from-blue-100 to-blue-50 border border-blue-300"
                    : "bg-white border border-gray-300 hover:border-blue-200"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`font-semibold ${
                      msg.senderId === session?.user?.id
                        ? "text-blue-600"
                        : "text-slate-700"
                    }`}
                  >
                    {msg.sender?.name ?? "Guest"}
                  </span>

                  {msg.senderId === session?.user?.id && (
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
        <footer className="fixed select-none bottom-0 right-0 text-gray-400">
        <p>
          @ 2025 Shadmanov. All Rights Reserved.
        </p>
      </footer>
      </main>
    </div>
  );
}