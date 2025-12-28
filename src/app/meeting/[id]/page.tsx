"use client";

import React, { useEffect, useState } from "react";
import { canEnterRoom } from "@/app/utils/roomApi";
import Chat from "./Chat";
import { useLocale } from "../../components/provider/locale-provider";
import { useSession } from "next-auth/react";

export default function MeetingPage({ params }: { params: { id: string } }) {
  const { locale } = useLocale();
  const { data: session, status: sessionStatus } = useSession();
  const appointmentId = params.id;
  const [status, setStatus] = useState<{ allowed: boolean; reason?: string }>({
    allowed: false,
  });
  const [isInitialCheck, setIsInitialCheck] = useState(true);
  const [checkAttempts, setCheckAttempts] = useState(0);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;

    let interval: NodeJS.Timeout;
    
    async function check() {
      try {
        const res = await canEnterRoom(appointmentId);
        setCheckAttempts((prev) => prev + 1);
        
        // ✅ Allow entry after first check if user is authenticated
        // This gives the socket time to connect
        if (isInitialCheck && checkAttempts === 0) {
          console.log("🔓 Initial check - allowing entry for socket connection");
          setStatus({ allowed: true });
          setIsInitialCheck(false);
        } else if (res.allowed) {
          setStatus(res);
          if (interval) clearInterval(interval);
        } else {
          // Only block after giving socket time to connect (3+ checks = 6+ seconds)
          if (checkAttempts > 3) {
            setStatus(res);
          }
        }
      } catch (error) {
        console.error("❌ Error checking room access:", error);
        // Allow entry on error to prevent being locked out
        setStatus({ allowed: true });
      }
    }

    // Initial check
    check();

    // Poll every 2s for up to 10 seconds
    interval = setInterval(() => {
      if (checkAttempts < 5) {
        check();
      } else {
        clearInterval(interval);
      }
    }, 2000);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [appointmentId, sessionStatus, checkAttempts, isInitialCheck]);

  // Show loading while authenticating
  if (sessionStatus === "loading") {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-lg text-gray-600">
            {locale === "ru" ? "Загрузка..." : "Loading..."}
          </p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated
  if (sessionStatus === "unauthenticated") {
    window.location.href = "/api/auth/signin";
    return null;
  }

  // Show connecting state during initial checks
  if (!status.allowed && checkAttempts <= 3) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-lg text-gray-600">
            {locale === "ru"
              ? "Подключение к встрече..."
              : "Connecting to meeting..."}
          </p>
        </div>
      </div>
    );
  }

  // Show access denied only after multiple checks
  if (!status.allowed) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="max-w-md p-6 bg-red-50 border-2 border-red-200 rounded-lg">
          <p className="text-red-600 text-lg font-semibold mb-2">
            ❌{" "}
            {locale === "ru"
              ? "Доступ к этой встрече запрещен"
              : "Access to this meeting is denied"}
          </p>
          <p className="text-red-500">
            {status.reason ||
              (locale === "ru"
                ? "Ожидание разрешения..."
                : "Waiting for permission...")}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            {locale === "ru" ? "Повторить попытку" : "Try Again"}
          </button>
        </div>
      </div>
    );
  }

  return <Chat roomId={appointmentId} />;
}