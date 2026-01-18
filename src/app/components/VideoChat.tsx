// components/VideoChat.tsx
'use client';

import { useState, useEffect } from 'react';

interface VideoChatProps {
  roomName: string;
  displayName?: string;
  onClose?: () => void;
}

export default function VideoChat({ roomName, displayName = 'Guest', onClose }: VideoChatProps) {
  const [isLoading, setIsLoading] = useState(true);

  // Clean room name
  const cleanRoom = roomName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
  
  // Using Whereby's free embed service
  const wherebyUrl = `https://whereby.com/${cleanRoom}?embed&displayName=${encodeURIComponent(displayName)}&background=off`;

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 3000);
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
          </div>
        </div>
      )}
      <iframe
        src={wherebyUrl}
        allow="camera; microphone; fullscreen; speaker; display-capture"
        className="w-full h-full border-0"
        title="Video Chat"
        onLoad={() => setIsLoading(false)}
      />
    </div>
  );
}