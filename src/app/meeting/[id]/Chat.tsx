"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import io, { Socket } from "socket.io-client";
import { useSession } from "next-auth/react";
import "next-auth";
import AISuggestionsPanel from "../../components/ui/AISuggestionsPanel";
import React from "react";
import { useLocale } from "../../components/provider/locale-provider";
import VideoChatButton from "../../components/VideoChatButton";
import CallNotification from "../../components/CallNotification";
import VideoCallWithTranscription from "@/app/components/VideoCallWithTranscription";
import DailyIframe from "@daily-co/daily-js";

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
};

interface IncomingCall {
  callerName: string;
  meetingId: string;
}

export default function Chat({ roomId }: ChatProps) {
  const { data: session, status } = useSession();
  const { locale } = useLocale();
  const router = useRouter();
  const [showAIHelper, setShowAIHelper] = useState(true);
  const [showEmbeddedCall, setShowEmbeddedCall] = useState(false);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [summary, setSummary] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<
    { id: string; name: string }[]
  >([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [isSummaryPanelOpen, setIsSummaryPanelOpen] = useState(false);
  const [summaryPanelWidth, setSummaryPanelWidth] = useState(320);
  const socketRef = useRef<Socket | null>(null);
  const currentRoomRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<HTMLDivElement>(null);

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
        userId: session.user.id.toString(),
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
          m._id === updated._id ? { ...m, ...updated } : m,
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

    // 🎥 VIDEO CALL LISTENERS
    const handleIncomingCall = (data: {
      callerName: string;
      callerId: string;
      meetingId: string;
    }) => {
      console.log("📞 Incoming call:", data);
      // Don't show notification if you're the caller
      if (data.callerId !== session.user.id) {
        setIncomingCall({
          callerName: data.callerName,
          meetingId: data.meetingId,
        });
      }
    };

    const handleCallEnded = (data: {
      callerName: string;
      duration: number;
    }) => {
      console.log("📞 Call ended:", data);
      // This message is already sent by the caller, so we just listen for it
    };

    // ✅ Attach listeners
    socket.on("initialMessages", handleInitialMessages);
    socket.on("newMessage", handleNewMessage);
    socket.on("onlineUsersWithNames", handleOnlineUsers);
    socket.on("messageEdited", handleMessageEdited);
    socket.on("messageDeleted", handleMessageDeleted);
    socket.on("user-left", handleUserLeft);
    socket.on("incoming-call", handleIncomingCall);
    socket.on("call-ended", handleCallEnded);

    // ✅ Cleanup listeners when room changes or component unmounts
    return () => {
      console.log("🧹 Cleaning up room listeners for:", roomId);
      socket.off("initialMessages", handleInitialMessages);
      socket.off("newMessage", handleNewMessage);
      socket.off("onlineUsersWithNames", handleOnlineUsers);
      socket.off("messageEdited", handleMessageEdited);
      socket.off("messageDeleted", handleMessageDeleted);
      socket.off("user-left", handleUserLeft);
      socket.off("incoming-call", handleIncomingCall);
      socket.off("call-ended", handleCallEnded);

      // Leave room on cleanup
      if (currentRoomRef.current === roomId) {
        console.log("👋 Leaving room on cleanup:", roomId);
        socket.emit("leaveRoom", { roomId, userId: session.user.id });
        currentRoomRef.current = null;
      }
    };
  }, [roomId, session?.user?.id, session?.user?.name]);

  // Resizable panel logic
  useEffect(() => {
    if (!isSummaryPanelOpen) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth >= 280 && newWidth <= 600) {
        setSummaryPanelWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "default";
      document.body.style.userSelect = "auto";
    };

    const handleMouseDown = () => {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
    };

    const resizeHandle = resizeRef.current;
    if (resizeHandle) {
      resizeHandle.addEventListener("mousedown", handleMouseDown);
    }

    return () => {
      if (resizeHandle) {
        resizeHandle.removeEventListener("mousedown", handleMouseDown);
      }
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isSummaryPanelOpen]);

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
        : prev,
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

  // 🎥 VIDEO CALL HANDLERS
  const handleCallStart = (callData: {
    meetingId: string;
    callerName: string;
    timestamp: number;
  }) => {
    console.log("📞 Broadcasting call start:", callData);

    // Broadcast to other users in the room
    if (socketRef.current) {
      socketRef.current.emit("call-started", {
        roomId,
        callerId: session?.user?.id,
        callerName: callData.callerName,
        meetingId: callData.meetingId,
        timestamp: callData.timestamp,
      });
    }
  };

  const handleCallEnd = (callData: {
    meetingId: string;
    callerName: string;
    duration: number;
    timestamp: number;
  }) => {
    console.log("📞 Broadcasting call end:", callData);

    // Broadcast to other users
    if (socketRef.current) {
      socketRef.current.emit("call-ended", {
        roomId,
        callerId: session?.user?.id,
        callerName: callData.callerName,
        duration: callData.duration,
        timestamp: callData.timestamp,
      });
    }
  };

  const handleSendCallMessage = (msg: string) => {
    // Send as a system message
    if (socketRef.current) {
      socketRef.current.emit("sendMessage", {
        roomId,
        senderId: "system",
        senderName: "System",
        content: msg,
        type: "system",
        createdAt: new Date(),
      });
    }
  };

  // Inside your main file
  const [callToken, setCallToken] = useState<string | null>(null);

  const handleAcceptCall = async () => {
    if (!incomingCall) return;

    try {
      // 1. Fetch the token from your new API (Invisible login)
      const res = await fetch("/api/videocall/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomName: roomId }),
      });
      // In Chat.tsx handleAcceptCall
      const data = await res.json();
      if (data.token && typeof data.token === "string") {
        setCallToken(data.token);
        setShowEmbeddedCall(true);
      } else {
        console.error("Token received is not a string:", data.token);
      }
      setCallStartTime(Date.now());
      handleSendCallMessage(
        locale === "ru"
          ? `📞 ${session?.user?.name} присоединился к звонку`
          : `📞 ${session?.user?.name} joined the video call`,
      );
      setIncomingCall(null);
    } catch (error) {
      console.error("Failed to join call:", error);
      alert("Failed to join call. Please try again.");
    }
  };

  const handleCloseEmbeddedCall = () => {
    console.log("📞 Closing embedded video call");

    if (callStartTime) {
      const duration = Math.floor((Date.now() - callStartTime) / 1000);

      // Broadcast call end to other users
      if (socketRef.current) {
        socketRef.current.emit("call-ended", {
          roomId,
          callerId: session?.user?.id,
          callerName: session?.user?.name || "Guest",
          duration,
          timestamp: Date.now(),
        });
      }

      // Send leave message
      const minutes = Math.floor(duration / 60);
      const seconds = duration % 60;
      const durationText =
        minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
      handleSendCallMessage(
        locale === "ru"
          ? `📞 ${session?.user?.name} покинул звонок • Длительность: ${durationText}`
          : `📞 ${session?.user?.name} left the call • Duration: ${durationText}`,
      );

      setCallStartTime(null);
    }

    setShowEmbeddedCall(false);
  };

  const handleDeclineCall = () => {
    setIncomingCall(null);
  };

  const handleSummarize = async () => {
    if (messages.length === 0) {
      alert(
        locale === "ru"
          ? "Нет сообщений для суммирования"
          : "No messages to summarize",
      );
      return;
    }

    setLoadingSummary(true);
    setIsSummaryPanelOpen(true);
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
        }`,
      );
    } finally {
      setLoadingSummary(false);
    }
  };

  // ✅ Render embedded video call if active
  if (showEmbeddedCall && session?.user) {
    const [callToken, setCallToken] = useState<string | null>(null);
    return (
      <div className="fixed inset-0 z-50 bg-gray-900">
        <VideoCallWithTranscription
          roomName={roomId}
          displayName={session.user.name || "Guest"}
          userId={session.user.id!}
          onClose={handleCloseEmbeddedCall}
          token={callToken}
        />
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center h-screen bg-gradient-to-br from-slate-50 via-indigo-50 to-slate-100">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xl text-slate-700 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    router.push("/api/auth/signin");
    return null;
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 via-indigo-50 to-slate-100 flex flex-col font-sans text-gray-800 overflow-hidden">
      {/* 🎥 CALL NOTIFICATION OVERLAY */}
      {incomingCall && (
        <CallNotification
          callerName={incomingCall.callerName}
          meetingId={incomingCall.meetingId}
          onAccept={handleAcceptCall}
          onDecline={handleDeclineCall}
        />
      )}

      {/* Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b-2 border-indigo-200 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                <h1 className="text-lg sm:text-xl font-bold text-slate-800">
                  {locale === "ru" ? "Комната встречи" : "Meeting Room"}
                </h1>
              </div>
              <span className="hidden sm:inline-block px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm font-medium">
                {roomId}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Online Users Count */}
              <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg border border-green-200">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm font-medium text-green-700">
                  {onlineUsers.length} {locale === "ru" ? "онлайн" : "online"}
                </span>
              </div>

              {/* Summary Toggle */}
              <button
                onClick={() => setIsSummaryPanelOpen(!isSummaryPanelOpen)}
                className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-all duration-200 font-medium text-sm shadow-md hover:shadow-lg flex items-center gap-2"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <span className="hidden sm:inline">
                  {locale === "ru" ? "Суммаризация" : "Summary"}
                </span>
              </button>

              <button
                onClick={handleExit}
                className="px-4 py-2 bg-white border-2 border-red-400 text-red-600 rounded-lg hover:bg-red-500 hover:text-white hover:border-red-500 transition-all duration-200 font-medium text-sm shadow-sm"
              >
                {locale === "ru" ? "Выйти" : "Exit"}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex overflow-hidden relative">
        {/* Chat Area */}
        <div
          className="flex-1 flex flex-col overflow-hidden"
          style={{
            width: isSummaryPanelOpen
              ? `calc(100% - ${summaryPanelWidth}px)`
              : "100%",
            transition: "width 0.3s ease",
          }}
        >
          <div className="flex-1 max-w-5xl mx-auto w-full px-4 py-6 flex flex-col gap-4 overflow-hidden">
            {/* Online Users Bar */}
            <div className="bg-white/90 backdrop-blur-sm rounded-2xl p-4 shadow-md border border-indigo-100">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <svg
                    className="w-5 h-5 text-indigo-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                    />
                  </svg>
                  <span className="text-sm font-medium text-slate-600">
                    {locale === "ru" ? "В комнате:" : "In room:"}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {onlineUsers.length === 0 ? (
                    <span className="text-sm text-slate-400 italic">
                      {locale === "ru"
                        ? "Нет пользователей"
                        : "No users online"}
                    </span>
                  ) : (
                    onlineUsers.map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 shadow-sm"
                      >
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-sm font-medium text-slate-700">
                          {u.name ||
                            (locale === "ru" ? "Анонимный" : "Anonymous")}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Messages Container */}
            <div className="flex-1 bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg border-2 border-indigo-100 overflow-hidden flex flex-col">
              <div
                ref={containerRef}
                className="flex-1 overflow-y-auto p-4 space-y-3 scroll-smooth"
                style={{ minHeight: 0 }}
              >
                {Array.isArray(messages) && messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center text-slate-400">
                      <svg
                        className="w-16 h-16 mx-auto mb-4 opacity-50"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                        />
                      </svg>
                      <p className="text-lg font-medium">
                        {locale === "ru" ? "Нет сообщений" : "No messages yet"}
                      </p>
                      <p className="text-sm mt-2">
                        {locale === "ru"
                          ? "Начните разговор!"
                          : "Start the conversation!"}
                      </p>
                    </div>
                  </div>
                ) : (
                  Array.isArray(messages) &&
                  messages.map((msg) => (
                    <div key={msg._id}>
                      {msg.senderId === "system" || msg.type === "system" ? (
                        // System Message
                        <div className="flex justify-center my-3">
                          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-2 rounded-full border border-blue-200 shadow-sm">
                            <p className="text-sm text-blue-700 font-medium">
                              {msg.content}
                            </p>
                          </div>
                        </div>
                      ) : (
                        // Regular Message
                        <div
                          className={`flex ${
                            msg.senderId === session?.user?.id
                              ? "justify-end"
                              : "justify-start"
                          }`}
                        >
                          <div
                            className={`max-w-[75%] sm:max-w-[70%] rounded-2xl p-3 shadow-md transition-all duration-200 hover:shadow-lg ${
                              msg.senderId === session?.user?.id
                                ? "bg-gradient-to-br from-indigo-500 to-blue-500 text-white"
                                : "bg-white border border-slate-200 text-slate-800"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3 mb-1">
                              <span
                                className={`font-semibold text-xs ${
                                  msg.senderId === session?.user?.id
                                    ? "text-indigo-100"
                                    : "text-slate-600"
                                }`}
                              >
                                {msg.sender?.name ||
                                  (locale === "ru" ? "Гость" : "Guest")}
                              </span>

                              {msg.senderId === session?.user?.id && (
                                <div className="flex items-center gap-1.5">
                                  <button
                                    onClick={() =>
                                      handleUpdate(String(msg._id))
                                    }
                                    className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-all duration-200"
                                    title={
                                      locale === "ru" ? "Редактировать" : "Edit"
                                    }
                                  >
                                    <svg
                                      className="w-3.5 h-3.5"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                                      />
                                    </svg>
                                  </button>
                                  <button
                                    onClick={() =>
                                      handleDelete(String(msg._id))
                                    }
                                    className="p-1.5 rounded-lg bg-white/20 hover:bg-red-400 transition-all duration-200"
                                    title={
                                      locale === "ru" ? "Удалить" : "Delete"
                                    }
                                  >
                                    <svg
                                      className="w-3.5 h-3.5"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                      />
                                    </svg>
                                  </button>
                                </div>
                              )}
                            </div>

                            <p className="whitespace-pre-wrap break-words leading-relaxed text-sm">
                              {msg.content}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message Input */}
              <div className="p-4 bg-gradient-to-r from-slate-50 to-indigo-50 border-t-2 border-indigo-100">
                <div className="flex gap-2">
                  <input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) =>
                      e.key === "Enter" && !e.shiftKey && handleSend()
                    }
                    placeholder={
                      locale === "ru"
                        ? "Введите сообщение..."
                        : "Type your message..."
                    }
                    className="flex-1 px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-indigo-400 focus:outline-none transition-all duration-200 bg-white shadow-sm"
                  />
                  <button
                    onClick={handleSend}
                    disabled={!newMessage.trim()}
                    className="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-blue-500 text-white font-medium hover:from-indigo-600 hover:to-blue-600 transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                      />
                    </svg>
                    <span className="hidden sm:inline">
                      {locale === "ru" ? "Отправить" : "Send"}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom Action Bar */}
            <div className="flex justify-center items-center gap-4 py-2">
              {showAIHelper && session?.user && (
                <AISuggestionsPanel
                  roomId={roomId}
                  userId={session.user.id!}
                  userName={session.user.name || "User"}
                  onSelectSuggestion={handleSelectSuggestion}
                  locale={locale}
                />
              )}

              <VideoChatButton
                meetingId={roomId}
                userId={session?.user?.id || ""}
                userName={session?.user?.name || "Guest"}
                variant="icon"
                onCallStart={handleCallStart}
                onCallEnd={handleCallEnd}
                onSendMessage={handleSendCallMessage}
              />
            </div>
          </div>
        </div>

        {/* Collapsible Summary Panel */}
        <div
          className={`fixed top-0 right-0 h-full bg-white border-l-2 border-indigo-200 shadow-2xl transform transition-transform duration-300 ease-in-out z-40 ${
            isSummaryPanelOpen ? "translate-x-0" : "translate-x-full"
          }`}
          style={{ width: `${summaryPanelWidth}px` }}
        >
          {/* Resize Handle */}
          <div
            ref={resizeRef}
            className="absolute left-0 top-0 w-1 h-full cursor-ew-resize hover:bg-indigo-400 bg-indigo-200 transition-colors duration-200"
            style={{ marginLeft: "-4px", width: "8px" }}
          />

          <div className="h-full flex flex-col">
            {/* Panel Header */}
            <div className="p-4 border-b-2 border-indigo-100 bg-gradient-to-r from-indigo-50 to-blue-50 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-indigo-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                {locale === "ru" ? "Суммаризация" : "Chat Summary"}
              </h2>
              <button
                onClick={() => setIsSummaryPanelOpen(false)}
                className="p-2 hover:bg-indigo-100 rounded-lg transition-colors duration-200"
              >
                <svg
                  className="w-5 h-5 text-slate-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Panel Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* User Selection */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-700">
                  {locale === "ru" ? "Суммировать для:" : "Summarize for:"}
                </label>
                <select
                  value={selectedUserId || ""}
                  onChange={(e) => setSelectedUserId(e.target.value || null)}
                  className="w-full px-3 py-2 border-2 border-slate-200 rounded-lg focus:border-indigo-400 focus:outline-none transition-all duration-200 bg-white"
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

              {/* Summarize Button */}
              <button
                onClick={handleSummarize}
                disabled={loadingSummary || messages.length === 0}
                className="w-full px-4 py-3 bg-gradient-to-r from-indigo-500 to-blue-500 text-white rounded-lg font-medium hover:from-indigo-600 hover:to-blue-600 transition-all duration-200 shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loadingSummary ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>
                      {locale === "ru" ? "Суммируется..." : "Summarizing..."}
                    </span>
                  </>
                ) : (
                  <>
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                    <span>
                      {locale === "ru" ? "Суммировать" : "Summarize Chat"}
                    </span>
                  </>
                )}
              </button>

              {/* Summary Display */}
              {summary && (
                <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl p-4 border-2 border-indigo-200 shadow-sm">
                  <div className="flex items-start gap-2 mb-3">
                    <svg
                      className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                      />
                    </svg>
                    <div className="flex-1">
                      <h3 className="font-semibold text-indigo-700 mb-2">
                        {locale === "ru" ? "Резюме:" : "Summary:"}
                      </h3>
                      <div className="prose prose-sm max-w-none">
                        <p className="text-slate-700 whitespace-pre-wrap leading-relaxed">
                          {summary}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {!summary && !loadingSummary && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <svg
                    className="w-16 h-16 text-slate-300 mb-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <p className="text-slate-400 text-sm">
                    {locale === "ru"
                      ? "Нажмите кнопку выше, чтобы создать суммаризацию"
                      : "Click the button above to generate a summary"}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white/80 backdrop-blur-sm border-t border-slate-200 py-3 px-4 text-center">
        <p className="text-sm text-slate-500">
          {locale === "ru"
            ? "© 2026 СумМит. Все права защищены."
            : "© 2026 SumMeet. All rights reserved."}
        </p>
      </footer>
    </div>
  );
}
