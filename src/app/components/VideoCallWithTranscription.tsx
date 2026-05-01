// components/VideoCallWithTranscription.tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Sparkles,
  X,
  Loader2,
  Download,
  MessageCircle,
  Minimize,
  Mic,
  MicOff,
  Copy,
  Users,
  AlertCircle,
} from "lucide-react";
import DailyIframe from "@daily-co/daily-js";
import { useTranscription } from "../hooks/useTranscription";
// Module-level singleton guard — survives re-renders and Strict Mode double-invoke

interface Transcript {
  _id: string;
  userId: string;
  userName: string;
  text: string;
  timestamp: number;
}

interface VideoCallWithTranscriptionProps {
  roomName: string;
  displayName?: string;
  userId: string;
  onClose?: () => void;
  token: string | null;
}

export default function VideoCallWithTranscription({
  roomName,
  displayName = "Guest",
  userId,
  onClose,
  token,
}: VideoCallWithTranscriptionProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [showTranscript, setShowTranscript] = useState(true);
  const [showSummary, setShowSummary] = useState(false);
  const [summary, setSummary] = useState("");
  const [userSummary, setUserSummary] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [callStartTime] = useState(Date.now());
  const [isRecording, setIsRecording] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState("uz-UZ");
  const [showMobileWarning, setShowMobileWarning] = useState(true);
  const transcriptsEndRef = useRef<HTMLDivElement>(null);
  const isProcessingRef = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<any>(null);
  const onCloseRef = useRef(onClose);
  const isRecordingRef = useRef(false);
  const CALL_DURATION_MS = 30 * 60 * 1000; // 30 minutes
  const [timeRemaining, setTimeRemaining] = useState(CALL_DURATION_MS);
  const [showWarningBanner, setShowWarningBanner] = useState(false);
  const warningFiredRef = useRef(false);
  const urgentWarningFiredRef = useRef(false);
  // Initialize the new transcription hook with current language
  const {
    start: startTranscription,
    stop: stopTranscription,
    transcript: liveTranscript,
    interimTranscript,
    isListening,
    isTranscribing,
    transcribeProgress,
    error: transcriptionError,
    isMobileMode,
  } = useTranscription({ language: selectedLanguage });
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const LANGUAGES = [
    { code: "en-US", name: "English (US)", flag: "🇺🇸" },
    { code: "en-GB", name: "English (UK)", flag: "🇬🇧" },
    { code: "es-ES", name: "Español (España)", flag: "🇪🇸" },
    { code: "es-MX", name: "Español (México)", flag: "🇲🇽" },
    { code: "fr-FR", name: "Français", flag: "🇫🇷" },
    { code: "de-DE", name: "Deutsch", flag: "🇩🇪" },
    { code: "it-IT", name: "Italiano", flag: "🇮🇹" },
    { code: "pt-BR", name: "Português (Brasil)", flag: "🇧🇷" },
    { code: "pt-PT", name: "Português (Portugal)", flag: "🇵🇹" },
    { code: "ru-RU", name: "Русский", flag: "🇷🇺" },
    { code: "ja-JP", name: "日本語", flag: "🇯🇵" },
    { code: "ko-KR", name: "한국어", flag: "🇰🇷" },
    { code: "zh-CN", name: "中文 (简体)", flag: "🇨🇳" },
    { code: "zh-TW", name: "中文 (繁體)", flag: "🇹🇼" },
    { code: "ar-SA", name: "العربية", flag: "🇸🇦" },
    { code: "hi-IN", name: "हिन्दी", flag: "🇮🇳" },
    { code: "tr-TR", name: "Türkçe", flag: "🇹🇷" },
    { code: "nl-NL", name: "Nederlands", flag: "🇳🇱" },
    { code: "pl-PL", name: "Polski", flag: "🇵🇱" },
    { code: "sv-SE", name: "Svenska", flag: "🇸🇪" },
    { code: "da-DK", name: "Dansk", flag: "🇩🇰" },
    { code: "no-NO", name: "Norsk", flag: "🇳🇴" },
    { code: "fi-FI", name: "Suomi", flag: "🇫🇮" },
    { code: "cs-CZ", name: "Čeština", flag: "🇨🇿" },
    { code: "el-GR", name: "Ελληνικά", flag: "🇬🇷" },
    { code: "he-IL", name: "עברית", flag: "🇮🇱" },
    { code: "th-TH", name: "ไทย", flag: "🇹🇭" },
    { code: "vi-VN", name: "Tiếng Việt", flag: "🇻🇳" },
    { code: "id-ID", name: "Bahasa Indonesia", flag: "🇮🇩" },
    { code: "uk-UA", name: "Українська", flag: "🇺🇦" },
    { code: "uz-UZ", name: "O'zbek tili", flag: "🇺🇿" },
    { code: "kk-KZ", name: "Қазақ тілі", flag: "🇰🇿" },
    { code: "ky-KG", name: "Кыргызча", flag: "🇰🇬" },
    { code: "tg-TJ", name: "Тоҷикӣ", flag: "🇹🇯" },
    { code: "tk-TM", name: "Türkmençe", flag: "🇹🇲" },
    { code: "az-AZ", name: "Azərbaycan dili", flag: "🇦🇿" },
  ];

  useEffect(() => {
    if (!token || !containerRef.current) return;

    let callFrame: any = null;
    let cancelled = false;

    const startCall = async () => {
      // Safely destroy any existing instance first
      try {
        const existing = DailyIframe.getCallInstance();
        if (existing) await existing.destroy();
      } catch (_) {}

      if (cancelled) return;

      // Clear container only after destroy
      if (containerRef.current) containerRef.current.innerHTML = "";

      callFrame = DailyIframe.createFrame(containerRef.current!, {
        url: `https://summeet.daily.co/${roomName}`,
        token: token,
        showLeaveButton: true,
        iframeStyle: {
          width: "100%",
          height: "100%",
          border: "0",
        },
      });

      callFrame.on("loaded", () => setIsLoading(false));
      callFrame.on("join-meeting", () => setIsLoading(false));
      callFrame.on("error", (e: any) => console.error("Daily error:", e));

      try {
        if (!cancelled) await callFrame.join();
      } catch (e) {
        console.error("Daily join error:", e);
      }
    };

    startCall();

    return () => {
      cancelled = true;
      callFrame?.destroy().catch(() => {});
    };
  }, [token, roomName]); // ONLY these two. Do NOT include any UI state here.
  const getSpeechStatus = () => {
    if (transcriptionError) return `Error: ${transcriptionError}`;
    if (isTranscribing && isMobileMode) {
      return `Processing... ${Math.round(transcribeProgress * 100)}%`;
    }
    if (isListening && !isTranscribing) return "Listening...";
    if (isTranscribing) return "Transcribing...";
    return "Inactive";
  };
  const formatTimeRemaining = () => {
    const mins = Math.floor(timeRemaining / 60000);
    const secs = Math.floor((timeRemaining % 60000) / 1000);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getStatusColor = () => {
    if (transcriptionError) return "text-red-400";
    if (isListening || isTranscribing) return "text-green-400";
    return "text-gray-400";
  };

  const uniqueUsers = Array.from(
    new Map(
      transcripts.map((t) => [t.userId, { id: t.userId, name: t.userName }]),
    ).values(),
  );

  useEffect(() => {
    transcriptsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts]);

  useEffect(() => {
    if (!token) return;
    loadTranscripts();
    const interval = setInterval(loadTranscripts, 2000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomName, token]);

  const loadTranscripts = async () => {
    try {
      const response = await fetch(
        `/api/videocall/speech-transcripts?roomId=${encodeURIComponent(roomName)}&startTime=${callStartTime}`,
      );
      if (response.ok) {
        const data = await response.json();
        setTranscripts(data.transcripts || []);
      }
    } catch (error) {
      console.error("Failed to load transcripts:", error);
    }
  };

  const saveTranscript = useCallback(
    async (text: string) => {
      const cleanText = text?.trim();
      if (!cleanText || cleanText.length < 2) return;

      try {
        const response = await fetch("/api/videocall/speech-transcripts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId: roomName,
            userId,
            userName: displayName,
            text: cleanText,
            timestamp: Date.now(),
            language: selectedLanguage,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          console.error("❌ Failed to save transcript:", error);
        }
      } catch (error) {
        console.error("❌ Error saving transcript:", error);
      }
    },
    [roomName, userId, displayName, selectedLanguage],
  );

  const startRecording = useCallback(async () => {
    isRecordingRef.current = true;
    setIsRecording(true);
    await startTranscription();
  }, [startTranscription]);

  const stopRecording = useCallback(async () => {
    isRecordingRef.current = false;
    setIsRecording(false);

    // On mobile, this triggers the Whisper transcription and waits for it
    await stopTranscription();
  }, [stopTranscription]);

  // Auto-save transcript when it becomes available after stopping on mobile
  useEffect(() => {
    if (!isRecording && liveTranscript && liveTranscript.trim().length > 2) {
      saveTranscript(liveTranscript);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveTranscript]);

  const toggleRecording = useCallback(() => {
    if (isRecordingRef.current) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [startRecording, stopRecording]);

  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  useEffect(() => {
    if (!token) return;

    const interval = setInterval(() => {
      const elapsed = Date.now() - callStartTime;
      const remaining = CALL_DURATION_MS - elapsed;

      setTimeRemaining(Math.max(0, remaining));

      // 5-minute warning (at 25 min)
      if (remaining <= 5 * 60 * 1000 && !warningFiredRef.current) {
        warningFiredRef.current = true;
        alert("⚠️ Your call will end in 5 minutes.");
      }

      // 1-minute urgent banner (at 29 min)
      if (remaining <= 60 * 1000 && !urgentWarningFiredRef.current) {
        urgentWarningFiredRef.current = true;
        setShowWarningBanner(true);
      }

      // Kick at exactly 30 min
      if (remaining <= 0) {
        clearInterval(interval);
        onCloseRef.current?.();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [token, callStartTime]);

  const generateSummary = async () => {
    setLoadingSummary(true);
    setSummary("");
    setUserSummary("");

    try {
      const response = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: roomName,
          userId: selectedUser,
          isVideoCall: true,
          callStartTime,
          callEndTime: Date.now(),
          overrideLanguage: selectedLanguage,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate summary");
      }

      const data = await response.json();

      if (selectedUser) {
        setUserSummary(
          data.userSummary || "No summary available for this user.",
        );
      } else {
        setSummary(data.fullSummary || "No summary available.");
      }
    } catch (error: any) {
      const errorMsg = `Error: ${error.message}`;
      if (selectedUser) {
        setUserSummary(errorMsg);
      } else {
        setSummary(errorMsg);
      }
    } finally {
      setLoadingSummary(false);
    }
  };

  const downloadSummary = () => {
    const content = selectedUser ? userSummary : summary;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const uName = selectedUser
      ? uniqueUsers.find((u) => u.id === selectedUser)?.name || "user"
      : "full";
    a.download = `videocall-summary-${uName}-${new Date().toISOString().split("T")[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copySummary = () => {
    const content = selectedUser ? userSummary : summary;
    navigator.clipboard.writeText(content);
    alert("Summary copied to clipboard!");
  };

  return (
    <div className="relative w-full h-screen bg-gray-900 flex">
      {/* Video Area */}
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

        <div ref={containerRef} className="w-full h-full border-0" />

        {isMobileMode && showMobileWarning && (
          <div className="absolute top-4 left-4 right-4 md:left-auto md:right-20 max-w-md z-50">
            <div className="bg-blue-400 text-gray-900 px-4 py-3 rounded-lg shadow-xl border-2 border-blue-500">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-blue-800" />
                <div className="flex-1">
                  <p className="font-bold text-sm mb-1">📱 Mobile Device</p>
                  <p className="text-xs leading-relaxed">
                    📊 Now using AI transcription on mobile! Transcripts will be
                    processed on-device using browser-whisper (no API key
                    needed).
                  </p>
                </div>
                <button
                  onClick={() => setShowMobileWarning(false)}
                  className="flex-shrink-0 text-gray-700 hover:text-gray-900 transition-colors"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Control Buttons */}
        <div className="absolute top-4 right-4 flex gap-2 flex-wrap max-w-md">
          <div
            className={`flex items-center gap-2 px-3 py-2 rounded-full text-white text-sm font-mono font-bold
  ${
    timeRemaining <= 60000
      ? "bg-red-600 animate-pulse"
      : timeRemaining <= 300000
        ? "bg-yellow-500"
        : "bg-gray-900/80"
  }`}
          >
            ⏱ {formatTimeRemaining()}
          </div>
          {/* Language Selector */}
          <div className="flex items-center gap-2 bg-gray-900/80 px-3 py-2 rounded-full">
            <span className="text-white text-xs font-semibold">🌍</span>
            <select
              value={selectedLanguage}
              onChange={(e) => {
                setSelectedLanguage(e.target.value);
                if (isRecordingRef.current) {
                  stopRecording();
                  setTimeout(() => startRecording(), 500);
                }
              }}
              className="bg-transparent text-white text-sm border-none focus:outline-none cursor-pointer pr-6"
              style={{
                backgroundImage:
                  "url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e\")",
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 0.25rem center",
                backgroundSize: "1em",
              }}
            >
              {LANGUAGES.map((lang) => (
                <option
                  key={lang.code}
                  value={lang.code}
                  className="bg-gray-800"
                >
                  {lang.flag} {lang.name}
                </option>
              ))}
            </select>
          </div>

          {/* Mic Button */}
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={toggleRecording}
              className={`p-3 ${isRecording ? "bg-red-600 hover:bg-red-700 animate-pulse" : "bg-green-600 hover:bg-green-700"} text-white rounded-full shadow-lg transition-all`}
              title={isRecording ? "Stop Transcription" : "Start Transcription"}
            >
              {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            <span
              className={`text-xs font-semibold ${getStatusColor()} bg-gray-900/80 px-2 py-1 rounded whitespace-nowrap`}
            >
              {getSpeechStatus()}
            </span>
          </div>

          <button
            onClick={() => setShowTranscript(!showTranscript)}
            className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-all"
            title="Toggle Transcript"
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
        {showWarningBanner && (
          <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-pulse">
            <AlertCircle size={20} />
            <span className="font-bold">Call ending in 1 minute!</span>
            <button
              onClick={() => setShowWarningBanner(false)}
              className="ml-2 opacity-70 hover:opacity-100"
            >
              <X size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Transcript Sidebar */}
      {showTranscript && (
        <div className="w-96 bg-white dark:bg-gray-800 flex flex-col border-l border-gray-200 dark:border-gray-700">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <MessageCircle size={20} />
              Live Transcript ({transcripts.length})
            </h3>
            <button
              onClick={() => setShowTranscript(false)}
              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              <Minimize size={20} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {transcripts.length === 0 ? (
              <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                <MessageCircle size={48} className="mx-auto mb-2 opacity-30" />
                <p className="font-medium mb-2">No transcript yet</p>
                <p className="text-sm">
                  Click the{" "}
                  <strong className="text-green-500">green microphone</strong>{" "}
                  button to start
                </p>
                <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-left">
                  <p className="text-xs">
                    <strong>💡 How it works:</strong>
                  </p>
                  <ul className="text-xs mt-1 space-y-1 ml-4 list-disc">
                    <li>Your browser listens to your voice</li>
                    <li>Converts speech to text</li>
                    <li>Saves transcript in real-time</li>
                    <li>Generate AI summary anytime</li>
                  </ul>
                  <div className="mt-3 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded border border-yellow-200 dark:border-yellow-700">
                    <p className="text-xs font-semibold text-yellow-800 dark:text-yellow-300">
                      📱 Device Support:
                    </p>
                    <ul className="text-xs mt-1 space-y-1 text-yellow-700 dark:text-yellow-400">
                      <li>✅ Android Chrome</li>
                      <li>✅ Desktop Chrome/Edge</li>
                      <li>❌ iOS/Safari (not supported)</li>
                    </ul>
                  </div>
                  <button
                    onClick={() =>
                      saveTranscript(
                        "This is a test message to verify the system is working",
                      )
                    }
                    className="mt-2 w-full px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded transition-colors"
                  >
                    🧪 Test Transcript Save
                  </button>
                </div>
              </div>
            ) : (
              transcripts.map((t) => (
                <div
                  key={t._id}
                  className={`flex ${t.userId === userId ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-4 py-2 ${
                      t.userId === userId
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white"
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs opacity-70 mb-1">
                      <span className="font-medium">{t.userName}</span>
                      <span>🎤</span>
                      <span>{new Date(t.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <p className="text-sm leading-relaxed">{t.text}</p>
                  </div>
                </div>
              ))
            )}
            <div ref={transcriptsEndRef} />
          </div>
        </div>
      )}

      {/* Summary Modal */}
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

            {!summary && !userSummary && !loadingSummary && (
              <div className="text-center py-8">
                <Sparkles className="w-16 h-16 mx-auto mb-4 text-purple-300" />
                <p className="text-gray-600 dark:text-gray-400 mb-2">
                  Generate an AI-powered summary of your video call
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-500 mb-6">
                  {transcripts.length} statements captured from{" "}
                  {uniqueUsers.length} participants
                </p>
                <div className="mb-6 max-w-xs mx-auto">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Summarize:
                  </label>
                  <select
                    value={selectedUser || ""}
                    onChange={(e) => setSelectedUser(e.target.value || null)}
                    className="w-full px-4 py-2 border-2 border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:border-purple-500 focus:outline-none"
                  >
                    <option value="">Full Conversation</option>
                    {uniqueUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name}'s contributions
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={generateSummary}
                  disabled={transcripts.length === 0}
                  className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
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

            {(summary || userSummary) && !loadingSummary && (
              <div className="space-y-4">
                <div className="bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-xl p-6 border-2 border-purple-200 dark:border-purple-700">
                  {selectedUser && (
                    <div className="flex items-center gap-2 mb-3 pb-3 border-b border-purple-200 dark:border-purple-700">
                      <Users size={18} className="text-purple-600" />
                      <span className="font-semibold text-purple-700 dark:text-purple-300">
                        {uniqueUsers.find((u) => u.id === selectedUser)?.name}'s
                        Summary
                      </span>
                    </div>
                  )}
                  <p className="whitespace-pre-wrap text-gray-800 dark:text-gray-200 leading-relaxed">
                    {selectedUser ? userSummary : summary}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={copySummary}
                    className="flex-1 px-4 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
                  >
                    <Copy size={18} /> Copy
                  </button>
                  <button
                    onClick={downloadSummary}
                    className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
                  >
                    <Download size={18} /> Download
                  </button>
                  <button
                    onClick={() => {
                      setSummary("");
                      setUserSummary("");
                    }}
                    className="flex-1 px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors font-medium"
                  >
                    🔄 New Summary
                  </button>
                </div>
              </div>
            )}

            <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <p className="text-xs text-gray-600 dark:text-gray-400">
                <strong>💡 Tips:</strong>
              </p>
              <ul className="text-xs text-gray-600 dark:text-gray-400 mt-1 ml-4 list-disc space-y-1">
                <li>Click mic button before speaking to capture your voice</li>
                <li>Works 100% in browser — no uploads needed!</li>
                <li>Summarize anytime during or after the call</li>
                <li>Choose specific user or full conversation</li>
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
