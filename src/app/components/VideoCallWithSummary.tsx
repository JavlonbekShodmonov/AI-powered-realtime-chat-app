'use client';

import { useState, useEffect, useRef } from 'react';
import {
  Send,
  FileText,
  Sparkles,
  X,
  Loader2,
  Download,
  MessageCircle,
  Minimize,
} from 'lucide-react';

interface Message {
  _id: string;
  content: string;
  senderId: string;
  sender: { name: string; avatar?: string };
  createdAt: Date;
  type: string;
}

interface SimpleEnhancedVideoChatProps {
  roomName: string;
  displayName?: string;
  userId: string;
  onClose?: () => void;
}

export default function VideoCallWithSummary({
  roomName,
  displayName = 'Guest',
  userId,
  onClose,
}: SimpleEnhancedVideoChatProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [showChat, setShowChat] = useState(true);
  const [showSummary, setShowSummary] = useState(false);
  const [summary, setSummary] = useState('');
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [callStartTime] = useState(Date.now());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Clean room name for Jitsi
  const cleanRoom = `videocall-${roomName.replace(/[^a-zA-Z0-9]/g, '')}`;

  // Jitsi Meet URL - 100% FREE, NO TIME LIMITS!
  const jitsiUrl = 
    `https://meet.jit.si/${cleanRoom}` +
    `#config.prejoinPageEnabled=false` +
    `&config.startWithAudioMuted=false` +
    `&config.startWithVideoMuted=false` +
    `&userInfo.displayName="${encodeURIComponent(displayName)}"`;

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load transcripts on mount and poll every 5 seconds
  useEffect(() => {
    loadTranscripts();
    const interval = setInterval(loadTranscripts, 5000);
    return () => clearInterval(interval);
  }, [roomName]);

  const loadTranscripts = async () => {
    try {
      const response = await fetch(
        `/api/videocall/transcript?roomId=${encodeURIComponent(roomName)}&startTime=${callStartTime}`
      );
      if (response.ok) {
        const data = await response.json();
        setMessages(data.transcripts || []);
      }
    } catch (error) {
      console.error('Failed to load transcripts:', error);
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !newMessage.trim()) return;

    const tempId = Date.now().toString();
    const optimisticMessage: Message = {
      _id: tempId,
      content: newMessage.trim(),
      senderId: userId,
      sender: { name: displayName },
      createdAt: new Date(),
      type: 'chat',
    };

    // Optimistic update
    setMessages((prev) => [...prev, optimisticMessage]);
    setNewMessage('');

    try {
      const response = await fetch('/api/videocall/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: roomName,
          senderId: userId,
          content: optimisticMessage.content,
          type: 'chat',
          timestamp: Date.now(),
        }),
      });

      if (response.ok) {
        // Reload to get the actual message with real ID
        loadTranscripts();
      } else {
        // Remove optimistic message on error
        setMessages((prev) => prev.filter((m) => m._id !== tempId));
        alert('Failed to send message');
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      setMessages((prev) => prev.filter((m) => m._id !== tempId));
      alert('Failed to send message');
    }
  };

  const generateSummary = async () => {
    if (messages.length === 0) {
      alert('No messages to summarize yet. Start chatting during the call!');
      return;
    }

    setLoadingSummary(true);
    setSummary('');

    try {
      const response = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: roomName,
          userId: null, // Full summary
          isVideoCall: true,
          callStartTime,
          callEndTime: Date.now(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate summary');
      }

      const data = await response.json();
      setSummary(data.fullSummary || 'No summary available.');
    } catch (error: any) {
      setSummary(`Error: ${error.message}`);
    } finally {
      setLoadingSummary(false);
    }
  };

  const downloadSummary = () => {
    const blob = new Blob([summary], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `videocall-summary-${cleanRoom}-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copySummary = () => {
    navigator.clipboard.writeText(summary);
    alert('Summary copied to clipboard!');
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
              <p className="text-xs text-gray-500 mt-2">
                ✨ Jitsi Meet - Free & Unlimited Time
              </p>
            </div>
          </div>
        )}

        {/* Jitsi Meet Embed */}
        <iframe
          src={jitsiUrl}
          allow="camera; microphone; fullscreen; speaker; display-capture; autoplay"
          className="w-full h-full border-0"
          title="Video Chat"
          onLoad={() => setIsLoading(false)}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-presentation"
        />

        {/* Floating Controls */}
        <div className="absolute top-4 right-4 flex gap-2 z-20">
          <button
            onClick={() => setShowChat(!showChat)}
            className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-lg transition-all"
            title="Toggle Chat"
          >
            <MessageCircle size={20} />
            {messages.length > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                {messages.length}
              </span>
            )}
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

      {/* Chat Sidebar */}
      {showChat && (
        <div className="w-96 bg-white dark:bg-gray-800 flex flex-col border-l border-gray-200 dark:border-gray-700">
          {/* Chat Header */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <MessageCircle size={20} />
              Video Call Chat
              <span className="text-xs text-gray-500">({messages.length})</span>
            </h3>
            <button
              onClick={() => setShowChat(false)}
              className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              <Minimize size={20} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                <MessageCircle size={48} className="mx-auto mb-2 opacity-30" />
                <p>No messages yet</p>
                <p className="text-sm mt-2">
                  Start chatting during the call
                </p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg._id}
                  className={`flex ${msg.senderId === userId ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2 ${
                      msg.senderId === userId
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                    }`}
                  >
                    <p className="text-xs opacity-70 mb-1">{msg.sender.name}</p>
                    <p className="text-sm">{msg.content}</p>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Message Input */}
          <form onSubmit={sendMessage} className="p-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(e);
                  }
                }}
                placeholder="Type a message..."
                className="flex-1 px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="submit"
                disabled={!newMessage.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send size={20} />
              </button>
            </div>
          </form>
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

            {!summary && !loadingSummary && (
              <div className="text-center py-8">
                <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <p className="text-gray-600 dark:text-gray-400 mb-2">
                  Generate an AI-powered summary of your video call
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-500 mb-6">
                  {messages.length} messages captured so far
                </p>
                <button
                  onClick={generateSummary}
                  disabled={messages.length === 0}
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
                💡 <strong>Tip:</strong> Use the chat during your video call. The AI will summarize all messages when you click "Generate Summary".
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-2">
                ✨ No time limits - Call as long as you need!
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}