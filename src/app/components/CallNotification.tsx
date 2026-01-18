// components/CallNotification.tsx
'use client';

import { useState, useEffect } from 'react';
import { Video, X, Phone } from 'lucide-react';

interface CallNotificationProps {
  callerName: string;
  meetingId: string;
  onAccept: () => void;
  onDecline: () => void;
}

export default function CallNotification({ 
  callerName, 
  meetingId, 
  onAccept, 
  onDecline 
}: CallNotificationProps) {
  const [isRinging, setIsRinging] = useState(true);

  useEffect(() => {
    // Auto-dismiss after 30 seconds
    const timeout = setTimeout(() => {
      onDecline();
    }, 30000);

    // Play ringing sound (optional)
    const audio = new Audio('/sounds/incoming-call.mp3');
    audio.loop = true;
    audio.play().catch(() => {
      // Autoplay might be blocked
      console.log('Audio autoplay blocked');
    });

    return () => {
      clearTimeout(timeout);
      audio.pause();
      audio.currentTime = 0;
    };
  }, [onDecline]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black bg-opacity-70 backdrop-blur-sm" />
      
      {/* Notification Card */}
      <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 w-96 animate-bounce-slow">
        <button
          onClick={onDecline}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          <X size={20} />
        </button>

        {/* Caller Info */}
        <div className="text-center mb-6">
          <div className={`w-24 h-24 mx-auto mb-4 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center ${isRinging ? 'animate-pulse' : ''}`}>
            <Video size={40} className="text-white" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Incoming Video Call
          </h3>
          <p className="text-lg text-gray-600 dark:text-gray-300">
            {callerName}
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            wants to video chat with you
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            onClick={onDecline}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-red-500 hover:bg-red-600 text-white rounded-full font-semibold transition-all transform hover:scale-105"
          >
            <X size={24} />
            <span>Decline</span>
          </button>
          <button
            onClick={onAccept}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-green-500 hover:bg-green-600 text-white rounded-full font-semibold transition-all transform hover:scale-105 animate-pulse"
          >
            <Phone size={24} />
            <span>Accept</span>
          </button>
        </div>

        <p className="text-xs text-center text-gray-400 dark:text-gray-500 mt-4">
          Call will end automatically in 30 seconds
        </p>
      </div>
    </div>
  );
}