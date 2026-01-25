// components/VideoChat.tsx
'use client';

import { useState, useEffect } from 'react';

interface VideoChatProps {
  roomName: string;
  displayName?: string;
  onClose?: () => void;
}

export default function VideoChat({ 
  roomName, 
  displayName = 'Guest', 
  onClose 
}: VideoChatProps) {
  const [isLoading, setIsLoading] = useState(true);

  // Clean room name - Jitsi requires alphanumeric and hyphens only
  const cleanRoom = roomName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
  
  // Jitsi Meet URL with proper configuration
  const jitsiUrl = `https://meet.jit.si/${cleanRoom}` +
    `#config.prejoinPageEnabled=false` +  // Skip lobby
    `&config.startWithAudioMuted=false` + // Start with audio
    `&config.startWithVideoMuted=false` + // Start with video
    `&userInfo.displayName="${encodeURIComponent(displayName)}"`;

  useEffect(() => {
    // Set loading to false after a short delay
    const timer = setTimeout(() => setIsLoading(false), 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="relative w-full h-full bg-gray-900">
      {isLoading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 z-10">
          <div className="text-white text-center">
            <div className="mb-4">
              <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            </div>
            <p className="text-xl mb-2">Connecting to video call...</p>
            <p className="text-sm text-gray-400">Please allow camera and microphone access</p>
            <p className="text-xs text-gray-500 mt-2">Powered by Jitsi Meet - Free & Unlimited</p>
          </div>
        </div>
      )}
      
      <iframe
        src={jitsiUrl}
        allow="camera; microphone; fullscreen; speaker; display-capture; autoplay"
        className="w-full h-full border-0"
        title="Video Chat - Jitsi Meet"
        onLoad={() => setIsLoading(false)}
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-presentation"
      />
      
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg shadow-lg transition-colors z-20"
        >
          End Call
        </button>
      )}
    </div>
  );
}