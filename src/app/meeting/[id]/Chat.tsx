"use client";

import { useState, useEffect, useRef } from "react";
import { Send } from "lucide-react";

interface Message {
  _id?: string;
  id?: string;
  content?: string;
  text?: string;
  senderId: string;
  senderName?: string;
  sender?: { name: string };
  createdAt?: Date | number;
  timestamp?: number;
  type?: string;
}

interface ChatProps {
  meetingId: string;
  userId: string;
  userName: string;
  socket: any;
}

export default function Chat({ meetingId, userId, userName, socket }: ChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Normalize message shape regardless of source
  function normalize(msg: Message) {
    return {
      id: msg._id || msg.id || Math.random().toString(36).slice(2),
      senderId: msg.senderId,
      senderName: msg.senderName || msg.sender?.name || "Anonymous",
      text: msg.content || msg.text || "",
      timestamp: msg.createdAt
        ? typeof msg.createdAt === "number"
          ? msg.createdAt
          : new Date(msg.createdAt).getTime()
        : msg.timestamp || Date.now(),
    };
  }

  useEffect(() => {
    if (!socket) return;

    // Load initial messages when joining room
    socket.on("initialMessages", (msgs: Message[]) => {
      setMessages(msgs.map(normalize));
    });

    // New message from any user in the room
    socket.on("newMessage", (msg: Message) => {
      setMessages((prev) => {
        const normalized = normalize(msg);
        // Avoid duplicates (optimistic update already added it)
        const exists = prev.some((m) => m.id === normalized.id);
        return exists ? prev : [...prev, normalized];
      });
    });

    socket.on("messageEdited", (msg: Message) => {
      setMessages((prev) =>
        prev.map((m) => {
          const id = msg._id || msg.id;
          return m.id === id ? { ...m, text: msg.content || msg.text || m.text } : m;
        })
      );
    });

    socket.on("messageDeleted", (messageId: string) => {
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    });

    return () => {
      socket.off("initialMessages");
      socket.off("newMessage");
      socket.off("messageEdited");
      socket.off("messageDeleted");
    };
  }, [socket]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSendMessage = () => {
    if (!inputMessage.trim() || !socket) return;

    // Optimistic update
    const optimistic = {
      id: `temp-${Date.now()}`,
      senderId: userId,
      senderName: userName,
      text: inputMessage.trim(),
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, optimistic]);

    socket.emit("sendMessage", {
      roomId: meetingId,
      senderId: userId,
      content: inputMessage.trim(),
    });

    setInputMessage("");
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-gray-900">

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            Meeting Chat
          </h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Room: {meetingId}
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 py-16 text-sm">
            No messages yet. Start the conversation.
          </div>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${
              msg.senderId === userId ? "items-end" : "items-start"
            }`}
          >
            <div className="flex items-center gap-2 mb-1 text-xs text-gray-500 dark:text-gray-400">
              <span className="font-semibold">{msg.senderName}</span>
              <span>•</span>
              <span>
                {new Date(msg.timestamp!).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <div
              className={`max-w-[70%] rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                msg.senderId === userId
                  ? "bg-blue-600 text-white rounded-tr-none"
                  : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-tl-none border border-gray-200 dark:border-gray-700"
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex gap-3">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
          placeholder="Type a message..."
          className="flex-1 px-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleSendMessage}
          disabled={!inputMessage.trim()}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-medium rounded-xl text-sm transition-colors flex items-center gap-2"
        >
          <Send size={16} />
          Send
        </button>
      </div>
    </div>
  );
}