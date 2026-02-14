// components/EnhancedVideoChat.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import {
  Send,
  FileText,
  Sparkles,
  X,
  Loader2,
  Download,
  MessageCircle,
  Minimize,
  Mic,
  MicOff,
} from "lucide-react";
import { io } from "socket.io-client";

declare global {
  interface Window {
    JitsiMeetExternalAPI: any;
  }
}

interface Message {
  _id: string;
  content: string;
  senderId: string;
  sender: { name: string; avatar?: string };
  createdAt: Date;
  type: string;
}

interface EnhancedVideoChatProps {
  roomName: string;
  displayName?: string;
  userId: string;
  onClose?: () => void;
}

export default function EnhancedVideoChat({
  roomName,
  displayName = "Guest",
  userId,
  onClose,
}: EnhancedVideoChatProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [showChat, setShowChat] = useState(true);
  const [showSummary, setShowSummary] = useState(false);
  const [summary, setSummary] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [callStartTime] = useState(Date.now());
  const [isRecording, setIsRecording] = useState(false);
  const [transcriptionStatus, setTranscriptionStatus] = useState("Inactive");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const deepgramSocketRef = useRef<WebSocket | null>(null);

  // Create a unique room name from MongoDB ObjectId
  const cleanRoom = roomName;
  // Jitsi Meet URL - completely free, no time limits!
  const jitsiUrl = `https://meet.jit.si/${cleanRoom}#config.prejoinPageEnabled=false&userInfo.displayName="${encodeURIComponent(displayName)}"`;

  const base =
    process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || "http://localhost:3001";
  const socket = io(base);

  // Join room on mount
  useEffect(() => {
    socket.emit("join-room", roomName);
    return () => {
      socket.disconnect();
    };
  }, [roomName]);

  // Listen for new transcripts
  useEffect(() => {
    socket.on("transcript:created", (transcript) => {
      setMessages((prev) => [
        ...prev,
        {
          ...transcript,
          sender: {
            name: transcript.senderId === userId ? displayName : "Guest",
          },
        },
      ]);
    });

    return () => {
      socket.off("transcript:created");
    };
  }, [userId]);

  // Initialize Deepgram transcription
  const startDeepgramTranscription = async () => {
    try {
      setTranscriptionStatus("Connecting...");

      // Get Deepgram API key from server
      const keyResponse = await fetch("/api/videocall/deepgram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: "request" }),
      });

      if (!keyResponse.ok) {
        throw new Error("Failed to get Deepgram API key");
      }

      const { apiKey } = await keyResponse.json();

      // Connect to Deepgram WebSocket
      const deepgramSocket = new WebSocket(
        "wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=16000&language=en",
        ["token", apiKey],
      );

      deepgramSocket.onopen = () => {
        console.log("✅ Deepgram WebSocket connected");
        setTranscriptionStatus("Connected");
        startAudioCapture();
      };

      deepgramSocket.onmessage = async (message) => {
        const data = JSON.parse(message.data);
        const transcript = data.channel?.alternatives?.[0]?.transcript;

        if (transcript && data.is_final) {
          console.log("🎤 Deepgram transcript:", transcript);
          setTranscriptionStatus("Transcribing...");
          await saveSpeechTranscript(transcript);
          setTranscriptionStatus("Connected");
        }
      };

      deepgramSocket.onerror = (error) => {
        console.error("❌ Deepgram error:", error);
        setTranscriptionStatus("Error");
      };

      deepgramSocket.onclose = () => {
        console.log("🔌 Deepgram WebSocket closed");
        setTranscriptionStatus("Disconnected");
      };

      deepgramSocketRef.current = deepgramSocket;
    } catch (error) {
      console.error("Failed to start Deepgram:", error);
      setTranscriptionStatus("Error");
      alert(
        "Failed to start transcription. Please check your API key and try again.",
      );
    }
  };

  // Capture audio from microphone
  const startAudioCapture = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const audioContext = new AudioContext({ sampleRate: 16000 });
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);

    source.connect(processor);
    processor.connect(audioContext.destination);

    processor.onaudioprocess = (e) => {
      if (deepgramSocketRef.current?.readyState === WebSocket.OPEN) {
        const input = e.inputBuffer.getChannelData(0);
        const buffer = new ArrayBuffer(input.length * 2);
        const view = new DataView(buffer);

        let offset = 0;
        for (let i = 0; i < input.length; i++, offset += 2) {
          const s = Math.max(-1, Math.min(1, input[i]));
          view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
        }

        deepgramSocketRef.current.send(buffer);
      }
    };

    mediaRecorderRef.current = {
      stop: () => {
        processor.disconnect();
        source.disconnect();
        audioContext.close();
        stream.getTracks().forEach((t) => t.stop());
      },
    } as any;
  };

  // Stop transcription
  const stopDeepgramTranscription = () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream
        .getTracks()
        .forEach((track) => track.stop());
      mediaRecorderRef.current = null;
    }

    if (deepgramSocketRef.current) {
      deepgramSocketRef.current.close();
      deepgramSocketRef.current = null;
    }

    setTranscriptionStatus("Inactive");
    console.log("⏹️ Transcription stopped");
  };

  // Toggle transcription
  const toggleRecording = () => {
    if (isRecording) {
      stopDeepgramTranscription();
      setIsRecording(false);
    } else {
      startDeepgramTranscription();
      setIsRecording(true);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopDeepgramTranscription();
    };
  }, []);

  // Save speech transcript to database
  const saveSpeechTranscript = async (transcript: string) => {
    const clean = transcript.trim();
    if (!userId || !clean) return;

    try {
      const response = await fetch("/api/videocall/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: roomName,
          senderId: userId,
          content: transcript,
          type: "speech",
          timestamp: Date.now(),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setMessages((prev) => [
          ...prev,
          {
            ...data.transcript,
            _id: data.transcriptId,
            sender: { name: displayName },
          },
        ]);
      }
    } catch (error) {
      console.error("Failed to save speech transcript:", error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    loadTranscripts();
  }, [roomName]);

  const loadTranscripts = async () => {
    try {
      const response = await fetch(
        `/api/videocall/transcript?roomId=${encodeURIComponent(roomName)}&startTime=${callStartTime}`,
      );
      if (response.ok) {
        const data = await response.json();
        setMessages(data.transcripts || []);
      }
    } catch (error) {
      console.error("Failed to load transcripts:", error);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !newMessage.trim()) return;

    try {
      const response = await fetch("/api/videocall/transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: roomName,
          senderId: userId,
          content: newMessage.trim(),
          type: "chat",
          timestamp: Date.now(),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setMessages((prev) => [
          ...prev,
          {
            ...data.transcript,
            _id: data.transcriptId,
            sender: { name: displayName },
          },
        ]);
        setNewMessage("");
      }
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

  const generateSummary = async () => {
    setLoadingSummary(true);
    setSummary("");

    try {
      const response = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: roomName,
          userId: null,
          isVideoCall: true,
          callStartTime,
          callEndTime: Date.now(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate summary");
      }

      const data = await response.json();
      setSummary(data.fullSummary || "No summary available.");
    } catch (error: any) {
      setSummary(`Error: ${error.message}`);
    } finally {
      setLoadingSummary(false);
    }
  };

  const downloadSummary = () => {
    const blob = new Blob([summary], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `videocall-summary-${cleanRoom}-${new Date().toISOString().split("T")[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copySummary = () => {
    navigator.clipboard.writeText(summary);
    alert("Summary copied to clipboard!");
  };

  const getStatusColor = () => {
    switch (transcriptionStatus) {
      case "Connected":
        return "text-green-400";
      case "Transcribing...":
        return "text-blue-400";
      case "Connecting...":
        return "text-yellow-400";
      case "Error":
        return "text-red-400";
      default:
        return "text-gray-400";
    }
  };

  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://meet.jit.si/external_api.js";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  useEffect(() => {
    if (!window.JitsiMeetExternalAPI) return;

    const domain = "meet.jit.si";
    const options = {
      roomName: cleanRoom,
      parentNode: document.getElementById("jitsi-container"),
      userInfo: { displayName },
      configOverwrite: {
        prejoinPageEnabled: false,
        disableDeepLinking: true,
      },
    };

    const api = new window.JitsiMeetExternalAPI(domain, options);

    api.addListener("videoConferenceJoined", () => {
      setIsLoading(false);
    });

    return () => api.dispose();
  }, [cleanRoom]);

  return (
    <div className="relative w-full h-screen bg-gray-900 flex">
      <div className="flex-1 relative">
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 z-10">
            <div className="text-white text-center">
              <div className="mb-4">
                <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
              </div>
              <p className="text-xl mb-2">Connecting to video call...</p>
              <p className="text-sm text-gray-400">
                Please allow camera and microphone access
              </p>
            </div>
          </div>
        )}

        {/* Jitsi Meet Embed - Free & Unlimited! */}
        <div id="jitsi-container" className="w-full h-full" />

        <div className="absolute top-4 right-4 flex gap-2">
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={toggleRecording}
              className={`p-3 ${isRecording ? "bg-red-600 hover:bg-red-700 animate-pulse" : "bg-green-600 hover:bg-green-700"} text-white rounded-full shadow-lg transition-all`}
              title={
                isRecording
                  ? "Stop Live Transcription"
                  : "Start Live Transcription"
              }
            >
              {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            <span className={`text-xs font-semibold ${getStatusColor()}`}>
              {transcriptionStatus}
            </span>
          </div>
          <button
            onClick={() => setShowChat(!showChat)}
            className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-all"
            title="Toggle Chat"
          >
            <MessageCircle size={20} />
          </button>
          <button
            onClick={() => setShowSummary(true)}
            className="p-3 bg-purple-600 hover:bg-purple-700 text-white rounded-full shadow-lg transition-all"
            title="Generate Summary"
          >
            <Sparkles size={20} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-3 bg-red-600 hover:bg-red-700 text-white rounded-full shadow-lg transition-all"
              title="End Call"
            >
              <X size={20} />
            </button>
          )}
        </div>
      </div>

      {showChat && (
        <div className="w-96 bg-white dark:bg-gray-800 flex flex-col border-l border-gray-200 dark:border-gray-700">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <MessageCircle size={20} />
              Live Transcript ({messages.length})
            </h3>
            <button
              onClick={() => setShowChat(false)}
              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              <Minimize size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                <MessageCircle size={48} className="mx-auto mb-2 opacity-30" />
                <p>No transcript yet</p>
                <p className="text-sm mt-2">
                  Click the <strong>green microphone</strong> button to start
                  real-time transcription
                </p>
                <p className="text-xs mt-2 text-gray-400">
                  Powered by Deepgram AI
                </p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg._id}
                  className={`flex ${msg.senderId === userId ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
                      msg.senderId === userId
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs opacity-70 mb-1">
                      <span>{msg.sender.name}</span>
                      {msg.type === "speech" && <span>🎤</span>}
                      {msg.type === "chat" && <span>💬</span>}
                    </div>
                    <p className="text-sm">{msg.content}</p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(e);
                  }
                }}
                placeholder="Type a message..."
                className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={sendMessage}
                disabled={!newMessage.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send size={20} />
              </button>
            </div>
          </div>
        </div>
      )}

      {showSummary && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => setShowSummary(false)}
          />

          <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <Sparkles className="w-6 h-6 text-purple-600" />
                Video Call Summary
              </h3>
              <button
                onClick={() => setShowSummary(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <X size={24} />
              </button>
            </div>

            {!summary && !loadingSummary && (
              <div className="text-center py-8">
                <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p className="text-gray-600 dark:text-gray-400 mb-2">
                  Generate an AI-powered summary of your video call
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-500 mb-6">
                  {messages.length} messages captured •{" "}
                  {messages.filter((m) => m.type === "speech").length} spoken
                </p>
                <button
                  onClick={generateSummary}
                  className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-semibold"
                >
                  <Sparkles className="w-5 h-5 inline mr-2" />
                  Generate Summary
                </button>
              </div>
            )}

            {loadingSummary && (
              <div className="text-center py-12">
                <Loader2 className="w-16 h-16 mx-auto mb-4 text-purple-600 animate-spin" />
                <p className="text-gray-600 dark:text-gray-400">
                  Analyzing conversation and generating summary...
                </p>
              </div>
            )}

            {summary && !loadingSummary && (
              <div className="space-y-4">
                <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl p-6 border-2 border-purple-200 dark:border-purple-700">
                  <p className="whitespace-pre-wrap text-gray-800 dark:text-gray-200 leading-relaxed">
                    {summary}
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={copySummary}
                    className="flex-1 px-4 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors font-medium"
                  >
                    📋 Copy
                  </button>
                  <button
                    onClick={downloadSummary}
                    className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
                  >
                    <Download size={18} />
                    Download
                  </button>
                  <button
                    onClick={generateSummary}
                    className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors font-medium"
                  >
                    🔄 Regenerate
                  </button>
                </div>
              </div>
            )}

            <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-xs text-gray-600 dark:text-gray-400">
                💡 <strong>Tip:</strong> Start transcription before speaking.
                The AI will capture and summarize everything said during the
                call in real-time.
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
