"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import io, { Socket } from "socket.io-client";
import { useSession } from "next-auth/react";
import "next-auth";
import AISuggestionsPanel from "../../components/ui/AISuggestionsPanel";
import React from "react";
import { useLocale } from "../../components/provider/locale-provider";

declare module "next-auth" {
  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

type ChatProps = {
  roomId: string;
  targetUserId?: string;
};

export default function Chat({ roomId, targetUserId }: ChatProps) {
  const { data: session, status } = useSession();
  const { locale } = useLocale();
  const router = useRouter();
  const [showAIHelper, setShowAIHelper] = useState(true);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [summary, setSummary] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [roomUsers, setRoomUsers] = useState<string[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<
    { id: string; name: string }[]
  >([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const currentRoomRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  console.log("RENDER TYPES", {
  messages: Array.isArray(messages),
  onlineUsers: Array.isArray(onlineUsers),
});

  // Auto-scroll when messages update
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceFromBottom < 100) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // ✅ Socket initialization (only once)
  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) return;

    // Only create socket once
    if (socketRef.current?.connected) {
      console.log("✅ Socket already exists and connected");
      return;
    }

    const base =
      process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || "http://localhost:3001";

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
      console.log("🔌 Socket connected:", socket.id);
    });

    socket.on("disconnect", () => {
      console.log("❌ Socket disconnected");
    });

    return () => {
      console.log("🧹 Disconnecting socket on unmount");
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [status, session?.user?.id, session?.user?.name]);

  // ✅ Room management (handles room changes)
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket || !session?.user?.id || !roomId) return;

    console.log("🏠 Setting up room:", roomId);

    // ✅ Leave previous room if switching rooms
    if (currentRoomRef.current && currentRoomRef.current !== roomId) {
      console.log("👋 Leaving previous room:", currentRoomRef.current);
      socket.emit("leaveRoom", {
        roomId: currentRoomRef.current,
        userId: session.user.id,
      });

      // ✅ Clear state when switching rooms
      setMessages([]);
      setOnlineUsers([]);
    }

    currentRoomRef.current = roomId;

    // ✅ Join new room
    console.log("📥 Joining room:", roomId);
    socket.emit("joinRoom", {
      roomId,
      userId: session.user.id,
      userName: session.user.name || "Anonymous",
    });

    // ✅ Set up room-specific listeners
    const handleInitialMessages = (msgs: any) => {
      if (!Array.isArray(msgs)) {
        console.error("❌ initialMessages is not an array:", msgs);
        setMessages([]);
        return;
      }

      setMessages(msgs);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      }, 50);
    };

    const handleNewMessage = (message: any) => {
      console.log("💬 New message:", message);
      const normalized = {
        ...message,
        _id: message._id?.toString?.() || String(message._id),
      };
      setMessages((prev) => {
        const prevArray = Array.isArray(prev) ? prev : [];
        if (prevArray.some((m) => m._id === normalized._id)) {
          return prevArray;
        }
        return [...prevArray, normalized];
      });
    };

    const handleOnlineUsers = (list: any) => {
      if (!Array.isArray(list)) {
        console.error("❌ onlineUsersWithNames is not an array:", list);
        setOnlineUsers([]);
        return;
      }
      console.log("👥 Online users updated:", list);
      setOnlineUsers(list);
    };

    const handleMessageEdited = (updated: any) => {
      if (!updated || typeof updated !== "object") return;
      console.log("✏️ Message edited:", updated);
      setMessages((prev) => {
        if (!Array.isArray(prev)) return [];
        return prev.map((m) =>
          m._id === updated._id ? { ...m, ...updated } : m
        );
      });
    };

    const handleMessageDeleted = (id: string) => {
      console.log("🗑️ Message deleted:", id);
      setMessages((prev) => {
        const prevArray = Array.isArray(prev) ? prev : [];
        return prevArray.filter((m) => m._id !== id && m.id !== id);
      });
    };

    const handleUserLeft = () => {
      console.log("👋 User left the chat");
      alert("The other user has left the chat");
    };

    // ✅ Attach listeners
    socket.on("initialMessages", handleInitialMessages);
    socket.on("newMessage", handleNewMessage);
    socket.on("onlineUsersWithNames", handleOnlineUsers);
    socket.on("messageEdited", handleMessageEdited);
    socket.on("messageDeleted", handleMessageDeleted);
    socket.on("user-left", handleUserLeft);

    // ✅ Cleanup listeners when room changes or component unmounts
    return () => {
      console.log("🧹 Cleaning up room listeners for:", roomId);
      socket.off("initialMessages", handleInitialMessages);
      socket.off("newMessage", handleNewMessage);
      socket.off("onlineUsersWithNames", handleOnlineUsers);
      socket.off("messageEdited", handleMessageEdited);
      socket.off("messageDeleted", handleMessageDeleted);
      socket.off("user-left", handleUserLeft);

      // Leave room on cleanup
      if (currentRoomRef.current === roomId) {
        console.log("👋 Leaving room on cleanup:", roomId);
        socket.emit("leaveRoom", { roomId, userId: session.user.id });
        currentRoomRef.current = null;
      }
    };
  }, [roomId, session?.user?.id, session?.user?.name]);

  const handleExit = () => {
    if (socketRef.current && currentRoomRef.current) {
      socketRef.current.emit("leaveRoom", {
        roomId: currentRoomRef.current,
        userId: session?.user?.id,
      });
      currentRoomRef.current = null;
    }
    router.push("/schedule");
  };

  const handleSend = () => {
    if (!newMessage.trim() || !socketRef.current || !session?.user) return;

    console.log("📤 Sending message");

    socketRef.current.emit("sendMessage", {
      roomId,
      senderId: session.user.id,
      senderName: session.user.name || "Anonymous",
      content: newMessage.trim(),
      createdAt: new Date(),
    });
    setNewMessage("");
  };

  const handleSelectSuggestion = (suggestion: string) => {
    setNewMessage(suggestion);
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
    setMessages((prev) =>
      Array.isArray(prev)
        ? prev.map((m) => (m._id === id ? { ...m, content: newText } : m))
        : prev
    );
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
    if (messages.length === 0) {
      alert(
        locale === "ru"
          ? "Нет сообщений для суммирования"
          : "No messages to summarize"
      );
      return;
    }

    setLoadingSummary(true);
    const url = "/api/summarize";

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, userId: selectedUserId }),
      });

      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

      const data = await res.json();

      if (data.error) {
        setSummary(`Error: ${data.error}`);
      } else if (selectedUserId && data.userSummary) {
        setSummary(data.userSummary);
      } else if (data.fullSummary) {
        setSummary(data.fullSummary);
      } else {
        setSummary(JSON.stringify(data, null, 2) || "No summary available.");
      }
    } catch (error) {
      console.error("❌ Summarization error:", error);
      setSummary(
        `Failed to summarize: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
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
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 via-indigo-50 to-slate-100 flex flex-col font-sans text-gray-800">
      {/* Mobile Header */}
      <div className="lg:hidden sticky top-0 z-10 bg-white/90 backdrop-blur-md border-b-2 border-gray-200 shadow-sm px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-700">
          {locale === "ru" ? "Комната встречи" : "Meeting Room"} — {roomId}
        </h1>
        <button
          onClick={handleExit}
          className="px-3 py-2 text-sm border-2 border-indigo-500 text-indigo-600 rounded-lg hover:bg-indigo-600 hover:text-white transition-all duration-300 font-semibold"
        >
          {locale === "ru" ? "Выйти" : "Exit"}
        </button>
      </div>

      <main className="flex flex-col lg:flex-row justify-center items-center lg:items-center gap-4 lg:gap-8 p-2 sm:p-4 lg:p-8 w-full max-w-7xl mx-auto flex-1">
        {/* LEFT COLUMN */}
        <div className="hidden lg:flex flex-col items-center space-y-6 border-4 border-black rounded-3xl p-6 bg-white/80 shadow-xl backdrop-blur-sm hover:shadow-2xl transition-all duration-300">
          <button
            onClick={handleExit}
            className="px-6 py-3 border-2 border-indigo-500 text-indigo-600 rounded-3xl hover:bg-indigo-600 hover:text-white transition-all duration-300 font-semibold shadow-sm"
          >
            {locale === "ru" ? "Выйти из встречи" : "Exit Meeting"}
          </button>
        </div>

        {/* MIDDLE CHAT COLUMN */}
        <div
          className="relative border-2 lg:border-4 border-black bg-white/90 backdrop-blur-md rounded-2xl lg:rounded-3xl shadow-2xl p-3 sm:p-4 lg:p-6 w-full max-w-3xl flex flex-col transition-all duration-300 hover:shadow-indigo-200 overflow-hidden"
          style={{
            height: "calc(100vh - 80px)",
            maxHeight: "calc(100vh - 80px)",
          }}
        >
          {/* Online Users */}
          <div className="mb-3 flex-shrink-0">
            <div className="text-xs text-gray-500 mb-1">
              {locale === "ru" ? "Пользователи в сети" : "Online Users"} (
              {onlineUsers.length}):
            </div>
            <div className="flex flex-wrap gap-1 sm:gap-2 text-xs sm:text-sm font-medium">
              {onlineUsers.length === 0 ? (
                <span className="text-gray-400 italic">
                  {locale === "ru"
                    ? "Нет пользователей в сети"
                    : "No users online in this room"}
                </span>
              ) : (
                onlineUsers.map((u) => (
                  <span
                    key={u.id}
                    className="px-2 sm:px-3 py-1 rounded-full bg-green-100 text-green-700 border border-green-300 shadow-sm"
                  >
                    {u.name || (locale === "ru" ? "Анонимный" : "Anonymous")}
                  </span>
                ))
              )}
            </div>
          </div>

          {/* Messages */}
          <div
            ref={containerRef}
            className="flex-1 space-y-3 sm:space-y-4 overflow-y-auto mb-3 sm:mb-4 border border-gray-300 rounded-xl lg:rounded-2xl p-3 sm:p-4 bg-gradient-to-b from-white to-slate-100 shadow-inner scroll-smooth"
            style={{ wordBreak: "break-word", minHeight: 0 }}
          >
            {Array.isArray(messages) &&
              messages.map((msg) => (
                <div
                  key={msg._id}
                  className={`p-2 sm:p-3 rounded-lg sm:rounded-xl shadow-sm flex flex-col justify-between transition-all duration-200 ${
                    msg.senderId === session?.user?.id
                      ? "bg-gradient-to-r from-blue-100 to-blue-50 border border-blue-300"
                      : "bg-white border border-gray-300 hover:border-blue-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`font-semibold text-sm sm:text-base ${
                        msg.senderId === session?.user?.id
                          ? "text-blue-600"
                          : "text-slate-700"
                      }`}
                    >
                      {msg.sender?.name ||
                        (locale === "ru" ? "Гость" : "Guest")}
                    </span>

                    {msg.senderId === session?.user?.id && (
                      <div className="space-x-1 sm:space-x-2 flex items-center flex-shrink-0">
                        <button
                          onClick={() => handleUpdate(String(msg._id))}
                          className="px-2 py-1 text-xs sm:text-sm rounded-md bg-gradient-to-r from-yellow-300 to-yellow-400 hover:from-yellow-400 hover:to-yellow-500 text-slate-800 font-medium shadow-sm"
                        >
                          {locale === "ru" ? "Редактировать" : "Edit"}
                        </button>
                        <button
                          onClick={() => handleDelete(String(msg._id))}
                          className="px-2 py-1 text-xs sm:text-sm rounded-md bg-gradient-to-r from-red-400 to-red-500 hover:from-red-500 hover:to-red-600 text-white font-medium shadow-sm"
                        >
                          {locale === "ru" ? "Удалить" : "Delete"}
                        </button>
                      </div>
                    )}
                  </div>

                  <span className="mt-2 whitespace-pre-wrap break-words leading-relaxed text-slate-800 text-sm sm:text-base">
                    {msg.content}
                  </span>
                </div>
              ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="flex gap-2 flex-shrink-0">
            <input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Type your message..."
              className="flex-1 p-2 sm:p-3 text-sm sm:text-base border rounded-lg sm:rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all duration-200"
            />
            <button
              onClick={handleSend}
              className="px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base rounded-lg sm:rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 text-white hover:opacity-90 transition-all duration-200 shadow-md font-semibold"
            >
              {locale === "ru" ? "Отправить" : "Send"}
            </button>
          </div>

          {/* Summary */}
          {summary && (
            <div className="mt-3 sm:mt-6 p-3 sm:p-4 border border-indigo-200 rounded-xl bg-indigo-50 text-left shadow-sm flex-shrink-0">
              <h3 className="font-semibold mb-2 text-indigo-700 text-sm sm:text-base">
                {locale === "ru" ? "Суммаризация чата:" : "Chat Summary:"}
              </h3>
              <p className="whitespace-pre-wrap text-slate-800 text-xs sm:text-sm">
                {summary}
              </p>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div className="flex flex-col items-center justify-center space-y-3 sm:space-y-4 border-2 sm:border-3 lg:border-4 border-black rounded-2xl sm:rounded-3xl p-4 sm:p-5 lg:p-6 bg-white/80 shadow-xl backdrop-blur-sm hover:shadow-2xl transition-all duration-300 w-full lg:w-auto max-w-md lg:max-w-none">
          <div className="flex flex-col items-center space-y-2 w-full">
            <label className="font-medium text-xs sm:text-sm text-gray-700">
              {locale === "ru" ? "Суммировать для:" : "Summarize for:"}
            </label>
            <select
              value={selectedUserId || ""}
              onChange={(e) => setSelectedUserId(e.target.value || null)}
              className="w-full border rounded-lg p-2 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              <option value="">
                {locale === "ru" ? "Весь чат" : "Full Chat"}
              </option>
              {onlineUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || (locale === "ru" ? "Анонимный" : "Anonymous")}
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleSummarize}
            disabled={loadingSummary}
            className="px-4 sm:px-5 lg:px-6 py-2 sm:py-2.5 lg:py-3 border-2 border-indigo-500 text-indigo-600 rounded-full uppercase text-sm sm:text-base lg:text-lg font-semibold hover:bg-indigo-600 hover:text-white transition-all duration-300 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed w-full lg:w-auto"
          >
            {loadingSummary
              ? locale === "ru"
                ? "Суммируется..."
                : "Summarizing..."
              : locale === "ru"
              ? "Суммировать"
              : "Summarize"}
          </button>

          <div className="w-0 h-0 border-l-[8px] sm:border-l-[10px] border-r-[8px] sm:border-r-[10px] border-b-[8px] sm:border-b-[10px] border-l-transparent border-r-transparent border-b-indigo-500"></div>

          <h2 className="font-light text-sm sm:text-base lg:text-lg text-slate-600 text-center">
            {locale === "ru"
              ? "Получите краткое содержание выбранного пользователя или всего чата одним нажатием кнопки."
              : "Get a concise summary of the selected user or the entire chat with a single click."}
          </h2>
        </div>
      </main>

      {showAIHelper && session?.user && (
        <AISuggestionsPanel
          roomId={roomId}
          userId={session.user.id!}
          userName={session.user.name || "User"}
          onSelectSuggestion={handleSelectSuggestion}
          locale={locale}
        />
      )}

      <footer className="text-center lg:text-right py-2 px-4 text-xs sm:text-sm text-gray-400">
        <p>
          {locale === "ru"
            ? "© 2025 СумМит. Все права защищены."
            : "© 2025 SumMeet. All rights reserved."}
        </p>
      </footer>
    </div>
  );
}
