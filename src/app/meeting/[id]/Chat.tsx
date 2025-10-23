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
  const socketRef = useRef<Socket | null>(null);
  const [roomUsers, setRoomUsers] = useState<string[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<{ id: string; name: string }[]>(
    []
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // --- Auto-scroll behaviour:
  // If user is near the bottom when new messages arrive, scroll to bottom.
  // If they are reading older messages (scrolled up), do not yank them.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;

    // If user is within 100px of bottom, auto-scroll.
    if (distanceFromBottom < 100) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    // else leave their scroll position alone
  }, [messages]);

  // --- Setup socket connection ---
  // In your Chat.tsx, replace the socket connection code with:

useEffect(() => {
  if (!isLoaded || !user) return;

  console.log("🔵 Connecting with user:", user.id, user.fullName);

  // ✅ FIXED: Don't use custom path for standalone socket server
  const socket = io(process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || "http://localhost:3001", {
    auth: {
      userId: user.id,
      userName: user.fullName || user.firstName || "Anonymous",
    },
    transports: ["websocket", "polling"], // Add polling fallback
    reconnection: true,
  });

  socketRef.current = socket;

  socket.on("connect", () => {
    console.log("✅ Socket connected, identifying user:", user.id);
    socket.emit("identify", {
      userId: user.id,
      userName: user.fullName || user.firstName || "Anonymous",
    });

    // Join room after identifying
    socket.emit("joinRoom", {
      roomId,
      userId: user.id,
      userName: user.fullName || user.firstName || "Anonymous",
    });
  });

  // ... rest of your socket event handlers
}, [isLoaded, user, roomId]);

  const handleExit = () => {
    if (socketRef.current) {
      socketRef.current.emit("leaveMeeting", { meetingId: roomId });
      socketRef.current.disconnect();
    }
    router.push("/schedule");
  };

  const handleSend = () => {
    if (!newMessage.trim() || !socketRef.current || !user) return;

    console.log("📤 Sending message from:", user.id);
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

  // keep listening for server edit events (already wired above but this ensures local listeners too)
  useEffect(() => {
    if (!socketRef.current) return;

    const handleEdited = (updated: any) => {
      setMessages((prev) =>
        prev.map((m) => (m._id === updated._id ? updated : m))
      );
    };

    const handleEditError = (err: any) => {
      console.error("⚠️ editMessageError received:", err?.message || err);
      alert(`Failed to edit message: ${err?.message || "Unknown error"}`);
    };

    socketRef.current.on("messageEdited", handleEdited);
    socketRef.current.on("editMessageError", handleEditError);

    return () => {
      if (socketRef.current) {
        socketRef.current.off("messageEdited", handleEdited);
        socketRef.current.off("editMessageError", handleEditError);
      }
    };
  }, []);

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
    } catch (error) {
      console.error("Error summarizing chat:", error);
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
    <div className="block font-sans text-center font-light">
      <main className="flex flex-col lg:flex-row justify-center items-start lg:items-center">
        {/* Left column: exit */}
        <div className="flex flex-col space-y-8 mb-6 lg:mb-96 lg:mr-4">
          <button
            className="border-2 rounded-3xl hover:bg-black hover:text-white border-black pl-4 pr-4 pt-2 pb-2"
            onClick={handleExit}
          >
            exit
          </button>
        </div>

        {/* Main chat area. On mobile it becomes taller (vertical) and width is near-full */}
        <div className="w-full lg:w-[70%] relative bg-white border-2 border-black rounded-2xl mt-4 flex justify-center">
          <div className="w-[95%] md:w-[90%] lg:w-[85%] m-4 rounded-3xl border-2 border-black p-4 flex flex-col"
               style={{ minHeight: "72vh" }}>
            {/* online users */}
            <div className="online-users flex gap-2 items-start text-sm text-black mb-2 flex-wrap">
              {onlineUsers.length === 0 ? (
                <span>No one online</span>
              ) : (
                onlineUsers.map((u) => (
                  <span key={u.id} className="px-2 py-1 bg-green-100 rounded">
                    {u.name}
                  </span>
                ))
              )}
            </div>

            {/* messages container */}
            <div
              ref={containerRef}
              className="flex-1 space-y-4 overflow-y-auto mb-4"
              // allow long messages to wrap and not overflow
              style={{ wordBreak: "break-word" }}
            >
              {messages.map((msg) => (
                <div
                  key={msg._id}
                  className="p-3 border rounded shadow-sm flex items-stretch justify-between w-full text-start"
                >
                  <div className="flex items-start gap-6">
                    <span className="font-semibold text-blue-600">
                      {msg.sender?.name ?? "Guest"}
                    </span>
                    <span className="whitespace-pre-wrap break-words max-w-[65vw] sm:max-w-[60vw]">
                      {msg.content}
                    </span>
                  </div>

                  <div className="space-x-2 flex items-end justify-end">
                    {msg.senderId === user?.id && (
                      <>
                        <button
                          onClick={() => handleUpdate(String(msg._id))}
                          className="px-2 py-1 text-sm bg-yellow-300 rounded"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(String(msg._id))}
                          className="px-2 py-1 text-sm bg-red-400 text-white rounded"
                        >
                          Delete
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))}

              <div ref={messagesEndRef} />
            </div>

            {/* input */}
            <div className="flex gap-2 mb-2">
              <input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSend()}
                placeholder="Type your message..."
                className="flex-1 p-2 border rounded"
              />
              <button
                onClick={handleSend}
                className="px-4 py-2 rounded text-white bg-blue-500"
              >
                Send
              </button>
            </div>

            {/* summary */}
            {summary && (
              <div className="mt-6 p-4 border rounded bg-gray-100 text-left">
                <h3 className="font-semibold mb-2">Chat Summary:</h3>
                <p className="whitespace-pre-wrap">{summary}</p>
              </div>
            )}
          </div>
        </div>

        {/* Right column: Summarize button (on mobile it stacks below) */}
        <div className="mt-6 lg:mt-0 lg:ml-4 flex flex-col items-center justify-center">
          <button
            className="border-2 border-black pr-4 pl-4 rounded-full mt-4 text-center uppercase text-xl font-semibold"
            onClick={handleSummarize}
            disabled={loadingSummary}
          >
            {loadingSummary ? "Summarizing..." : "Summarize"}
          </button>
          <div className="block">
            <div className="w-0 h-0 border-l-[10px] border-r-[10px] border-b-[10px] border-l-transparent border-r-transparent border-b-black mt-2"></div>
          </div>
          <h2 className="font-light text-xl uppercase mt-2">
            click to summarize your chat
          </h2>
        </div>
      </main>
    </div>
  );
}
