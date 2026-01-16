// components/VideoChatButton.tsx
'use client';

import { useState } from 'react';
import { Video, X, Minimize2, Maximize2 } from 'lucide-react';
import dynamic from 'next/dynamic';

const VideoChat = dynamic(() => import('../components/VideoChat'), {
  ssr: false,
});

interface VideoChatButtonProps {
  meetingId: string;
  userName?: string;
  variant?: 'icon' | 'button';
  className?: string;
}

type VideoMode = 'fullscreen' | 'minimized' | 'floating';

export default function VideoChatButton({ 
  meetingId, 
  userName = 'Guest',
  variant = 'icon',
  className = ''
}: VideoChatButtonProps) {
  const [isCallActive, setIsCallActive] = useState(false);
  const [videoMode, setVideoMode] = useState<VideoMode>('fullscreen');

  const startCall = () => {
    setIsCallActive(true);
    setVideoMode('fullscreen');
  };

  const endCall = () => {
    setIsCallActive(false);
  };

  const toggleSize = () => {
    if (videoMode === 'fullscreen') {
      setVideoMode('floating');
    } else if (videoMode === 'floating') {
      setVideoMode('minimized');
    } else {
      setVideoMode('fullscreen');
    }
  };

  // Minimized view - small preview in corner
  if (isCallActive && videoMode === 'minimized') {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <div className="bg-gray-900 rounded-lg shadow-2xl overflow-hidden w-64 h-48 relative group">
          <VideoChat
            roomName={meetingId}
            displayName={userName}
            onClose={endCall}
          />
          <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={toggleSize}
              className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-full shadow-lg transition-colors"
              title="Expand"
            >
              <Maximize2 size={16} />
            </button>
            <button
              onClick={endCall}
              className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-full shadow-lg transition-colors"
              title="End call"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Floating view - medium sized, draggable-ish window
  if (isCallActive && videoMode === 'floating') {
    return (
      <div className="fixed inset-0 z-50 pointer-events-none">
        <div className="absolute bottom-4 right-4 pointer-events-auto">
          <div className="bg-gray-900 rounded-lg shadow-2xl overflow-hidden" style={{ width: '640px', height: '480px' }}>
            <div className="relative h-full">
              <VideoChat
                roomName={meetingId}
                displayName={userName}
                onClose={endCall}
              />
              <div className="absolute top-2 right-2 flex gap-2 z-50">
                <button
                  onClick={toggleSize}
                  className="bg-gray-800 hover:bg-gray-700 text-white p-2 rounded-full shadow-lg transition-colors"
                  title="Minimize"
                >
                  <Minimize2 size={20} />
                </button>
                <button
                  onClick={() => setVideoMode('fullscreen')}
                  className="bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-full shadow-lg transition-colors"
                  title="Fullscreen"
                >
                  <Maximize2 size={20} />
                </button>
                <button
                  onClick={endCall}
                  className="bg-red-600 hover:bg-red-700 text-white p-2 rounded-full shadow-lg transition-colors"
                  title="End call"
                >
                  <X size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Full-screen video call overlay
  if (isCallActive && videoMode === 'fullscreen') {
    return (
      <div className="fixed inset-0 z-50 bg-black">
        <VideoChat
          roomName={meetingId}
          displayName={userName}
          onClose={endCall}
        />
        {/* Control buttons overlay */}
        <div className="absolute top-4 right-4 z-50 flex gap-2">
          <button
            onClick={toggleSize}
            className="bg-gray-800 hover:bg-gray-700 text-white p-3 rounded-full shadow-lg transition-colors"
            title="Make smaller"
          >
            <Minimize2 size={24} />
          </button>
          <button
            onClick={endCall}
            className="bg-red-600 hover:bg-red-700 text-white p-3 rounded-full shadow-lg transition-colors"
            title="End call"
          >
            <X size={24} />
          </button>
        </div>
      </div>
    );
  }

  // Icon variant (for chat header)
  if (variant === 'icon') {
    return (
      <button
        onClick={startCall}
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
      onClick={startCall}
      className={`flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors ${className}`}
    >
      <Video size={20} />
      <span>Start Video Call</span>
    </button>
  );
}