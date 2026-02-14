"use client";

import React, { useEffect, useRef, useState } from "react";
import { canEnterRoom } from "@/app/utils/roomApi";
import Chat from "./Chat";
import { useLocale } from "../../components/provider/locale-provider";
import { useSession } from "next-auth/react";

const MAX_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 5000;

export default function MeetingPage({ params }: { params: { id: string } }) {
  const { locale } = useLocale();
  const { data: session, status: sessionStatus } = useSession();
  const appointmentId = params.id;
  const [status, setStatus] = useState<{ allowed: boolean; reason?: string }>({
    allowed: false,
  });
  const [phase, setPhase] = useState<"connecting" | "resolved">("connecting");
  const attemptsRef = useRef(0);

  useEffect(() => {
    if (sessionStatus !== "authenticated") return;

    let interval: NodeJS.Timeout | undefined;
    let cancelled = false;

    async function check() {
      if (cancelled) return;
      try {
        const res = await canEnterRoom(appointmentId);
        if (cancelled) return;

        attemptsRef.current += 1;
        const attempt = attemptsRef.current;

        if (attempt === 1) {
          // First check — allow entry immediately so the socket can connect
          console.log("🔓 Initial check - allowing entry for socket connection");
          setStatus({ allowed: true });
          setPhase("resolved");
          if (interval) clearInterval(interval);
          return;
        }

        if (res.allowed) {
          setStatus(res);
          setPhase("resolved");
          if (interval) clearInterval(interval);
        } else if (attempt >= MAX_ATTEMPTS) {
          // Only deny after enough checks to give the socket time
          setStatus(res);
          setPhase("resolved");
          if (interval) clearInterval(interval);
        }
      } catch (error) {
        console.error("❌ Error checking room access:", error);
        if (!cancelled) {
          setStatus({ allowed: true });
          setPhase("resolved");
          if (interval) clearInterval(interval);
        }
      }
    }

    // Initial check
    check();

    // Poll every 5s, up to MAX_ATTEMPTS
    interval = setInterval(() => {
      if (attemptsRef.current >= MAX_ATTEMPTS) {
        clearInterval(interval);
      } else {
        check();
      }
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [appointmentId, sessionStatus]);

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
  if (phase === "connecting") {
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