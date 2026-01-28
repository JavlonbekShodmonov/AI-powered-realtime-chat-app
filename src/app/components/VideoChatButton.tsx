// components/VideoChatButton.tsx
'use client';

import { useState, useEffect } from 'react';
import { Video, X, ExternalLink, Sparkles, MessageCircle, Users } from 'lucide-react';
import VideoCallWithTranscription from './VideoCallWithTranscription';

interface VideoCallButtonProps {
  meetingId: string;
  userName?: string;
  userId: string;
  variant?: 'icon' | 'button';
  className?: string;
  isOrganizer?: boolean;
  onCallStart?: (callData: { meetingId: string; callerName: string; timestamp: number }) => void;
  onCallEnd?: (callData: { meetingId: string; callerName: string; duration: number; timestamp: number }) => void;
  onSendMessage?: (message: string) => void;
}

export default function VideoChatButton({ 
  meetingId, 
  userName = 'Guest',
  userId,
  variant = 'icon',
  className = '',
  isOrganizer = false,
  onCallStart,
  onCallEnd,
  onSendMessage
}: VideoCallButtonProps) {
  const [showOptions, setShowOptions] = useState(false);
  const [showEmbeddedCall, setShowEmbeddedCall] = useState(false);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);

  const cleanMeetingId = meetingId.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
  
  // ✅ Use the fixed Jitsi server without time limit
  const jitsiUrl = `https://meet.ffmuc.net/${cleanMeetingId}#userInfo.displayName="${encodeURIComponent(userName)}"&config.startWithAudioMuted=false&config.startWithVideoMuted=false&config.prejoinPageEnabled=false`;

  const handleCallStart = () => {
    const startTime = Date.now();
    setCallStartTime(startTime);

    if (onCallStart) {
      onCallStart({
        meetingId: cleanMeetingId,
        callerName: userName,
        timestamp: startTime
      });
    }

    if (onSendMessage) {
      onSendMessage(`📞 ${userName} started a video call with AI features`);
    }
  };

  const startCallNewWindow = () => {
    handleCallStart();
    
    const callWindow = window.open(
      jitsiUrl,
      'VideoCall',
      'width=1200,height=800,menubar=no,toolbar=no,location=no,status=no'
    );

    if (callWindow) {
      const checkClosed = setInterval(() => {
        if (callWindow.closed) {
          clearInterval(checkClosed);
          handleCallEnd();
        }
      }, 1000);
    }

    setShowOptions(false);
  };

  const startCallSameWindow = () => {
    handleCallStart();
    window.location.href = jitsiUrl;
  };

  const startCallEmbedded = () => {
    handleCallStart();
    setShowEmbeddedCall(true);
    setShowOptions(false);
  };

  const handleCallEnd = () => {
    if (callStartTime) {
      const duration = Math.floor((Date.now() - callStartTime) / 1000);
      
      if (onCallEnd) {
        onCallEnd({
          meetingId: cleanMeetingId,
          callerName: userName,
          duration,
          timestamp: Date.now()
        });
      }

      if (onSendMessage) {
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        const durationText = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
        onSendMessage(`📞 ${userName} left the call • Duration: ${durationText}`);
      }

      setCallStartTime(null);
      setShowEmbeddedCall(false);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(jitsiUrl);
    alert('Video call link copied! Share it with others to join.');
    setShowOptions(false);
  };

  // Embedded Video Call with Speech-to-Text & Summary
  if (showEmbeddedCall) {
    return (
      <div className="fixed inset-0 z-50 bg-gray-900">
        <VideoCallWithTranscription
          roomName={meetingId}
          displayName={userName}
          userId={userId}
          onClose={handleCallEnd}
        />
      </div>
    );
  }

  // Options Modal
  if (showOptions) {
    return (
      <>
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setShowOptions(false)}
        />
        
        <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-2xl p-6 w-96 max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Start Video Call
            </h3>
            <button
              onClick={() => setShowOptions(false)}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <X size={20} />
            </button>
          </div>

          <div className="space-y-3">
            {/* Primary option: Start with AI features */}
            <button
              onClick={startCallEmbedded}
              className="w-full flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-lg transition-colors"
            >
              <div className="p-2 bg-white/20 rounded">
                <MessageCircle size={20} />
              </div>
              <div className="text-left flex-1">
                <div className="font-medium">Start Call with AI Features</div>
                <div className="text-xs opacity-90">Speech-to-text + Summary (FREE!)</div>
              </div>
              <Sparkles size={16} className="opacity-75" />
            </button>

            <button
              onClick={startCallNewWindow}
              className="w-full flex items-center gap-3 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <ExternalLink size={20} />
              <div className="text-left">
                <div className="font-medium">Quick Call (New Window)</div>
                <div className="text-xs opacity-90">Jitsi Meet - No AI features</div>
              </div>
            </button>

            <button
              onClick={startCallSameWindow}
              className="w-full flex items-center gap-3 px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
            >
              <Video size={20} />
              <div className="text-left">
                <div className="font-medium">Quick Call (Here)</div>
                <div className="text-xs opacity-90">Jitsi Meet - Replace page</div>
              </div>
            </button>

            <button
              onClick={copyLink}
              className="w-full px-4 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg transition-colors"
            >
              📋 Copy Meeting Link
            </button>
          </div>

          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              <strong>Room ID:</strong> {cleanMeetingId}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
              💡 Use "Call with AI Features" to access:
            </p>
            <ul className="text-xs text-gray-500 dark:text-gray-500 mt-1 ml-4 list-disc">
              <li>Real-time speech-to-text (Browser, FREE!)</li>
              <li>No audio uploads needed</li>
              <li>Live transcription visible to ALL participants</li>
              <li>AI-powered call summary (Anyone can generate)</li>
              <li>No 5-minute time limit!</li>
            </ul>
          </div>
        </div>
      </>
    );
  }

  // Icon variant (for chat header)
  if (variant === 'icon') {
    return (
      <button
        onClick={() => setShowOptions(true)}
        className={`p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors relative ${className}`}
        title="Start video call with AI transcription"
      >
        <Video size={24} className="text-blue-600 dark:text-blue-400" />
      </button>
    );
  }

  // Button variant
  return (
    <button
      onClick={() => setShowOptions(true)}
      className={`flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors ${className}`}
    >
      <Video size={20} />
      <span>Start AI Video Call</span>
    </button>
  );
}