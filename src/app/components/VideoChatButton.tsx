// components/VideoChatButton.tsx
'use client';

import { useState } from 'react';
import { Video, X, ExternalLink } from 'lucide-react';

interface VideoChatButtonProps {
  meetingId: string;
  userName?: string;
  variant?: 'icon' | 'button';
  className?: string;
  onCallStart?: (callData: { meetingId: string; callerName: string; timestamp: number }) => void;
  onCallEnd?: (callData: { meetingId: string; callerName: string; duration: number; timestamp: number }) => void;
  onSendMessage?: (message: string) => void;
}

export default function VideoChatButton({ 
  meetingId, 
  userName = 'Guest',
  variant = 'icon',
  className = '',
  onCallStart,
  onCallEnd,
  onSendMessage
}: VideoChatButtonProps) {
  const [showOptions, setShowOptions] = useState(false);
  const [callStartTime, setCallStartTime] = useState<number | null>(null);

  const cleanMeetingId = meetingId.replace(/[^a-zA-Z0-9-]/g, '');
  const videoUrl = `https://meet.jit.si/${cleanMeetingId}#userInfo.displayName="${encodeURIComponent(userName)}"&config.startWithAudioMuted=false&config.startWithVideoMuted=false`;

  const handleCallStart = () => {
    const startTime = Date.now();
    setCallStartTime(startTime);

    // Notify others about call start
    if (onCallStart) {
      onCallStart({
        meetingId: cleanMeetingId,
        callerName: userName,
        timestamp: startTime
      });
    }

    // Send chat message
    if (onSendMessage) {
      onSendMessage(`📞 ${userName} started a video call`);
    }
  };

  const startCallNewWindow = () => {
    handleCallStart();
    
    // Open in new window/tab
    const callWindow = window.open(
      videoUrl,
      'VideoCall',
      'width=1200,height=800,menubar=no,toolbar=no,location=no,status=no'
    );

    // Monitor when window closes
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
    // Open in same window
    window.location.href = videoUrl;
  };

  const handleCallEnd = () => {
    if (callStartTime) {
      const duration = Math.floor((Date.now() - callStartTime) / 1000); // in seconds
      
      // Notify others about call end
      if (onCallEnd) {
        onCallEnd({
          meetingId: cleanMeetingId,
          callerName: userName,
          duration,
          timestamp: Date.now()
        });
      }

      // Send chat message
      if (onSendMessage) {
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        const durationText = minutes > 0 
          ? `${minutes}m ${seconds}s` 
          : `${seconds}s`;
        onSendMessage(`📞 Call ended • Duration: ${durationText}`);
      }

      setCallStartTime(null);
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(videoUrl);
    alert('Video call link copied! Share it with others to join.');
    setShowOptions(false);
  };

  // Options popup
  if (showOptions) {
    return (
      <>
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40"
          onClick={() => setShowOptions(false)}
        />
        
        {/* Options Modal */}
        <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 bg-white dark:bg-gray-800 rounded-lg shadow-2xl p-6 w-96">
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
            <button
              onClick={startCallNewWindow}
              className="w-full flex items-center gap-3 px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <ExternalLink size={20} />
              <div className="text-left">
                <div className="font-medium">Open in New Window</div>
                <div className="text-xs opacity-90">Recommended - Keep chatting</div>
              </div>
            </button>

            <button
              onClick={startCallSameWindow}
              className="w-full flex items-center gap-3 px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
            >
              <Video size={20} />
              <div className="text-left">
                <div className="font-medium">Open Here</div>
                <div className="text-xs opacity-90">Replace current page</div>
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
              Share this ID with others to join the same call
            </p>
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
        className={`p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${className}`}
        title="Start video call"
      >
        <Video size={24} className="text-blue-600 dark:text-blue-400" />
      </button>
    );
  }

  // Button variant (for larger areas)
  return (
    <button
      onClick={() => setShowOptions(true)}
      className={`flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors ${className}`}
    >
      <Video size={20} />
      <span>Start Video Call</span>
    </button>
  );
}