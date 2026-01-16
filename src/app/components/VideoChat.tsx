// components/VideoChat.tsx
'use client';

import { useEffect, useRef, useState } from 'react';

interface JitsiMeetAPI {
  executeCommand: (command: string, ...args: any[]) => void;
  addListener: (event: string, listener: (...args: any[]) => void) => void;
  removeListener: (event: string, listener: (...args: any[]) => void) => void;
  dispose: () => void;
}

declare global {
  interface Window {
    JitsiMeetExternalAPI: any;
  }
}

interface VideoChatProps {
  roomName: string;
  displayName?: string;
  onClose?: () => void;
}

export default function VideoChat({ roomName, displayName = 'Guest', onClose }: VideoChatProps) {
  const jitsiContainer = useRef<HTMLDivElement>(null);
  const jitsiApi = useRef<JitsiMeetAPI | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Load Jitsi Meet API script
    const loadJitsiScript = () => {
      return new Promise<void>((resolve, reject) => {
        if (window.JitsiMeetExternalAPI) {
          resolve();
          return;
        }

        const script = document.createElement('script');
        script.src = 'https://8x8.vc/vpaas-magic-cookie-your-app/external_api.js';
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Failed to load Jitsi script'));
        document.body.appendChild(script);
      });
    };

    const initializeJitsi = async () => {
      try {
        await loadJitsiScript();

        if (!jitsiContainer.current) return;

        // Create Jitsi Meet instance
        const domain = 'meet.jit.si'; // Free public instance
        const options = {
          roomName: roomName,
          width: '100%',
          height: '100%',
          parentNode: jitsiContainer.current,
          configOverwrite: {
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            enableWelcomePage: false,
            prejoinPageEnabled: false,
            disableInviteFunctions: false,
            enableNoisyMicDetection: true,
          },
          interfaceConfigOverwrite: {
            TOOLBAR_BUTTONS: [
              'microphone',
              'camera',
              'closedcaptions',
              'desktop',
              'fullscreen',
              'fodeviceselection',
              'hangup',
              'chat',
              'recording',
              'settings',
              'raisehand',
              'videoquality',
              'filmstrip',
              'stats',
              'shortcuts',
              'tileview',
              'download',
              'help',
              'mute-everyone',
            ],
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
          },
          userInfo: {
            displayName: displayName,
          },
        };

        jitsiApi.current = new window.JitsiMeetExternalAPI(domain, options);

        // Event listeners
        if (jitsiApi.current) {
          jitsiApi.current.addListener('videoConferenceJoined', () => {
            console.log('User joined the conference');
            setIsLoading(false);
          });

          jitsiApi.current.addListener('videoConferenceLeft', () => {
            console.log('User left the conference');
            onClose?.();
          });

          jitsiApi.current.addListener('readyToClose', () => {
            onClose?.();
          });
        }

      } catch (err) {
        console.error('Error initializing Jitsi:', err);
        setError('Failed to load video chat. Please try again.');
        setIsLoading(false);
      }
    };

    initializeJitsi();

    // Cleanup
    return () => {
      if (jitsiApi.current) {
        jitsiApi.current.dispose();
        jitsiApi.current = null;
      }
    };
  }, [roomName, displayName, onClose]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900 text-white">
        <div className="text-center">
          <p className="text-xl mb-4">{error}</p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
          <div className="text-white text-xl">Loading video chat...</div>
        </div>
      )}
      <div ref={jitsiContainer} className="w-full h-full" />
    </div>
  );
}