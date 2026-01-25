// components/VideoCallWithTranscription.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import {
  Send,
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
} from "lucide-react";

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
}

export default function VideoCallWithTranscription({
  roomName,
  displayName = "Guest",
  userId,
  onClose,
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
  const [speechStatus, setSpeechStatus] = useState("Inactive");
  const transcriptsEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  
  // Clean room name and create video URLs
  const cleanRoom = roomName.replace(/[^a-zA-Z0-9-]/g, "-").toLowerCase();
  
  // Try Jitsi first with embedded config (more reliable for free tier)
  const jitsiEmbedUrl = `https://meet.jit.si/${cleanRoom}#config.prejoinPageEnabled=false&config.startWithAudioMuted=false&config.startWithVideoMuted=false&userInfo.displayName="${encodeURIComponent(displayName)}"&interfaceConfig.SHOW_JITSI_WATERMARK=false&interfaceConfig.SHOW_WATERMARK_FOR_GUESTS=false`;
  
  const videoUrl = jitsiEmbedUrl;

  // Get unique users for summary dropdown
  const uniqueUsers = Array.from(
    new Map(transcripts.map(t => [t.userId, { id: t.userId, name: t.userName }])).values()
  );

  const scrollToBottom = () => {
    transcriptsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [transcripts]);

  // Load existing transcripts
  useEffect(() => {
    loadTranscripts();
    
    // Poll for new transcripts every 2 seconds
    const interval = setInterval(loadTranscripts, 2000);
    return () => clearInterval(interval);
  }, [roomName]);

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

  // Initialize Web Speech API
  const startSpeechRecognition = () => {
    // Check browser support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in your browser. Please use Chrome, Edge, or Safari.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      console.log("🎤 Speech recognition started");
      setSpeechStatus("Listening...");
      setIsRecording(true);
    };

    recognition.onresult = async (event: any) => {
      try {
        const last = event.results.length - 1;
        const result = event.results[last];
        
        if (!result || !result[0]) {
          console.warn("⚠️ No result data");
          return;
        }
        
        const transcript = result[0].transcript;
        const confidence = result[0].confidence;
        
        console.log("🎤 Captured speech:", { 
          transcript, 
          confidence,
          isFinal: result.isFinal 
        });
        
        // Only save if transcript is not empty and has reasonable confidence
        if (transcript && transcript.trim().length > 0) {
          setSpeechStatus("Processing...");
          await saveTranscript(transcript.trim());
          setSpeechStatus("Listening...");
        } else {
          console.warn("⚠️ Empty transcript, skipping save");
        }
      } catch (error) {
        console.error("❌ Error processing speech result:", error);
      }
    };

    recognition.onerror = (event: any) => {
      console.error("❌ Speech recognition error:", event.error);
      
      switch(event.error) {
        case 'no-speech':
          setSpeechStatus("No speech detected");
          setTimeout(() => setSpeechStatus("Listening..."), 2000);
          break;
        case 'audio-capture':
          setSpeechStatus("Microphone error");
          alert("Cannot access microphone. Please check permissions.");
          setIsRecording(false);
          break;
        case 'not-allowed':
          setSpeechStatus("Permission denied");
          alert("Microphone permission denied. Please allow microphone access.");
          setIsRecording(false);
          break;
        default:
          setSpeechStatus(`Error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      console.log("🎤 Speech recognition ended");
      if (isRecording) {
        // Auto-restart if still recording
        console.log("🔄 Restarting recognition...");
        try {
          recognition.start();
        } catch (error) {
          console.error("❌ Failed to restart recognition:", error);
          setIsRecording(false);
          setSpeechStatus("Inactive");
        }
      } else {
        setSpeechStatus("Inactive");
      }
    };

    recognitionRef.current = recognition;
    
    try {
      recognition.start();
    } catch (error) {
      console.error("❌ Failed to start recognition:", error);
      alert("Failed to start speech recognition. Please try again.");
      setIsRecording(false);
      setSpeechStatus("Error");
    }
  };

  const stopSpeechRecognition = () => {
    if (recognitionRef.current) {
      setIsRecording(false);
      recognitionRef.current.stop();
      recognitionRef.current = null;
      setSpeechStatus("Inactive");
    }
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopSpeechRecognition();
    } else {
      startSpeechRecognition();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSpeechRecognition();
    };
  }, []);

  const saveTranscript = async (text: string) => {
    const cleanText = text?.trim();
    
    if (!cleanText || cleanText.length === 0) {
      console.warn("Attempted to save empty transcript, skipping");
      return;
    }

    console.log("💾 Saving transcript:", { userId, userName: displayName, text: cleanText });

    try {
      const response = await fetch("/api/videocall/speech-transcripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: roomName,
          userId: userId,
          userName: displayName,
          text: cleanText,
          timestamp: Date.now(),
        }),
      });

      if (response.ok) {
        const data = await response.json();
        console.log("✅ Transcript saved:", data.transcript);
        // Optimistically add to UI
        setTranscripts((prev) => [...prev, data.transcript]);
      } else {
        const error = await response.json();
        console.error("❌ Failed to save transcript:", error);
      }
    } catch (error) {
      console.error("❌ Error saving transcript:", error);
    }
  };

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
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to generate summary");
      }

      const data = await response.json();
      
      if (selectedUser) {
        setUserSummary(data.userSummary || "No summary available for this user.");
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
    const userName = selectedUser 
      ? uniqueUsers.find(u => u.id === selectedUser)?.name || 'user'
      : 'full';
    a.download = `videocall-summary-${userName}-${new Date().toISOString().split("T")[0]}.txt`;
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

  const getStatusColor = () => {
    if (speechStatus.includes("Listening")) return "text-green-400";
    if (speechStatus.includes("Processing")) return "text-blue-400";
    if (speechStatus.includes("Error")) return "text-red-400";
    return "text-gray-400";
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
        
        {/* Jitsi Embed */}
        <iframe
          src={videoUrl}
          allow="camera; microphone; fullscreen; speaker; display-capture; autoplay"
          className="w-full h-full border-0"
          title="Video Chat"
          onLoad={() => setIsLoading(false)}
        />

        {/* Control Buttons */}
        <div className="absolute top-4 right-4 flex gap-2">
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={toggleRecording}
              className={`p-3 ${isRecording ? "bg-red-600 hover:bg-red-700 animate-pulse" : "bg-green-600 hover:bg-green-700"} text-white rounded-full shadow-lg transition-all`}
              title={isRecording ? "Stop Transcription" : "Start Transcription"}
            >
              {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
            </button>
            <span className={`text-xs font-semibold ${getStatusColor()}`}>
              {speechStatus}
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
                  Click the <strong className="text-green-500">green microphone</strong> button to start
                </p>
                <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-left">
                  <p className="text-xs">
                    <strong>💡 How it works:</strong>
                  </p>
                  <ul className="text-xs mt-1 space-y-1 ml-4 list-disc">
                    <li>Your browser listens to your voice</li>
                    <li>Converts speech to text (FREE!)</li>
                    <li>Saves transcript in real-time</li>
                    <li>Generate AI summary anytime</li>
                  </ul>
                  <button
                    onClick={async () => {
                      console.log("🧪 Testing transcript save...");
                      await saveTranscript("This is a test message to verify the system is working");
                    }}
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
                  {transcripts.length} statements captured from {uniqueUsers.length} participants
                </p>

                {/* User Selection */}
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
                        {uniqueUsers.find(u => u.id === selectedUser)?.name}'s Summary
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
                    <Copy size={18} />
                    Copy
                  </button>
                  <button
                    onClick={downloadSummary}
                    className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium flex items-center justify-center gap-2"
                  >
                    <Download size={18} />
                    Download
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
                <li>Works 100% in browser - no uploads needed!</li>
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