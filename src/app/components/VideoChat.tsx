// components/VideoChat.tsx
"use client";

import { useEffect, useRef, useState } from "react";

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

export default function VideoChat({
  roomName,
  displayName = "Guest",
  onClose,
}: VideoChatProps) {
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

        const script = document.createElement("script");
        script.src = "https://meet.jit.si/external_api.js";
        script.async = true;
        script.onload = () => {
          console.log("Jitsi script loaded successfully");
          resolve();
        };
        script.onerror = () => {
          console.error("Failed to load Jitsi script");
          reject(new Error("Failed to load Jitsi script"));
        };
        document.body.appendChild(script);
      });
    };

    const initializeJitsi = async () => {
      try {
        setIsLoading(true);
        await loadJitsiScript();

        if (!jitsiContainer.current) {
          console.error("Container not available");
          return;
        }

        console.log("Initializing Jitsi with room:", roomName);

        // Create Jitsi Meet instance
        const domain = "meet.jit.si";
        const options = {
          roomName: roomName,
          width: "100%",
          height: "100%",
          parentNode: jitsiContainer.current,
          configOverwrite: {
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            enableWelcomePage: false,
            prejoinPageEnabled: false,
            disableDeepLinking: true,
          },
          interfaceConfigOverwrite: {
            TOOLBAR_BUTTONS: [
              "microphone",
              "camera",
              "closedcaptions",
              "desktop",
              "fullscreen",
              "fodeviceselection",
              "hangup",
              "chat",
              "settings",
              "raisehand",
              "videoquality",
              "filmstrip",
              "stats",
              "shortcuts",
              "tileview",
              "help",
            ],
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            SHOW_BRAND_WATERMARK: false,
          },
          userInfo: {
            displayName: displayName,
          },
        };

        jitsiApi.current = new window.JitsiMeetExternalAPI(domain, options);

        // Event listeners
        if (jitsiApi.current) {
          jitsiApi.current.addListener("videoConferenceJoined", (data: any) => {
            console.log("User joined the conference", data);
            setIsLoading(false);
          });

          jitsiApi.current.addListener("videoConferenceLeft", () => {
            console.log("User left the conference");
            onClose?.();
          });

          jitsiApi.current.addListener("readyToClose", () => {
            console.log("Ready to close");
            onClose?.();
          });

          jitsiApi.current.addListener("errorOccurred", (error: any) => {
            console.error("Jitsi error occurred:", error);
            setError("An error occurred with the video call");
            setIsLoading(false);
          });
        }

        // Timeout fallback - hide loading after 10 seconds even if join event doesn't fire
        const loadingTimeout = setTimeout(() => {
          if (isLoading) {
            console.log("Loading timeout reached, hiding loading screen");
            setIsLoading(false);
          }
        }, 10000);

        return () => clearTimeout(loadingTimeout);
      } catch (err) {
        console.error("Error initializing Jitsi:", err);
        setError("Failed to load video chat. Please refresh and try again.");
        setIsLoading(false);
      }
    };

    initializeJitsi();

    // Cleanup
    return () => {
      if (jitsiApi.current) {
        try {
          jitsiApi.current.dispose();
        } catch (e) {
          console.error("Error disposing Jitsi:", e);
        }
        jitsiApi.current = null;
      }
    };
  }, [roomName, displayName, onClose, isLoading]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-900 text-white">
        <div className="text-center p-6">
          <p className="text-xl mb-4">{error}</p>
          <button
            onClick={onClose}
            className="px-6 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
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
      <div ref={jitsiContainer} className="w-full h-full" />
    </div>
  );
}
