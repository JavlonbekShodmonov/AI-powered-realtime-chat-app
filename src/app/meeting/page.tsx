"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, ArrowRight, Clock, History } from "lucide-react";
import { useLocale } from "../components/provider/locale-provider";

export default function MeetingLandingPage() {
  const [roomInput, setRoomInput] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  const { locale } = useLocale();

  const normalizedRoomId = roomInput.trim();

  const handleOpenRoom = () => {
    if (!normalizedRoomId) {
      setError(
        locale === "ru"
          ? "Введите идентификатор комнаты"
          : "Enter a room ID or URL",
      );
      return;
    }

    setError("");

    let roomId = normalizedRoomId;

    // 1. Extract path segment if full URL is pasted
    if (roomId.startsWith("http://") || roomId.startsWith("https://")) {
      try {
        const url = new URL(roomId);
        roomId = url.pathname.split("/").filter(Boolean).pop() || roomId;
      } catch {
        // Fallback in case of invalid URL structure
      }
    }
    // 2. Extract last part if relative path with slashes is pasted (e.g. zoom/meeting/1234)
    else if (roomId.includes("/")) {
      roomId = roomId.split("/").filter(Boolean).pop() || roomId;
    }

    // 3. Remove any remaining invalid characters
    const cleanRoomId = roomId.replace(/[^a-zA-Z0-9_-]/g, "");

    if (!cleanRoomId) {
      setError(
        locale === "ru" ? "Неверная ссылка или ID" : "Invalid room ID or URL",
      );
      return;
    }

    router.push(`/meeting/${encodeURIComponent(cleanRoomId)}`);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle,_rgba(56,189,248,0.18)_0%,_transparent_45%)]" />
        <div className="relative mx-auto max-w-6xl px-4 py-24">
          <div className="max-w-3xl space-y-8">
            <div className="space-y-4">
              <p className="inline-flex items-center gap-2 rounded-full bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200">
                <History className="h-4 w-4" />
                {locale === "ru"
                  ? "Плагин для видеовстреч"
                  : "Video call plugin"}
              </p>
              <h1 className="text-5xl font-black tracking-tight sm:text-6xl">
                {locale === "ru"
                  ? "Подключите SumMeet к любому видеозвонку"
                  : "Connect SumMeet to any video call"}
              </h1>
              <p className="text-lg text-slate-300 sm:text-xl">
                {locale === "ru"
                  ? "Вводите идентификатор комнаты или ссылку, просматривайте историю встреч, получайте резюме и живые подсказки прямо из существующего звонка."
                  : "Enter a room ID or URL, review meeting history, and get summaries and live response help from your current calls."}
              </p>
            </div>

            <div className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl shadow-black/20 backdrop-blur-xl">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-cyan-300">
                    {locale === "ru"
                      ? "Интеграция с видеосервисами"
                      : "Video platform integration"}
                  </p>
                  <h2 className="mt-3 text-2xl font-semibold text-white">
                    {locale === "ru"
                      ? "Откройте комнату или начните прослушивание"
                      : "Open a room or start listening"}
                  </h2>
                </div>
                <div className="flex flex-wrap gap-3">
                  <a
                    href="/history"
                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:border-cyan-300/30 hover:bg-cyan-500/10"
                  >
                    <Clock className="h-4 w-4" />
                    {locale === "ru" ? "История" : "History"}
                  </a>
                  <a
                    href="/history"
                    className="inline-flex items-center gap-2 rounded-full bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
                  >
                    <Search className="h-4 w-4" />
                    {locale === "ru" ? "История" : "History"}
                  </a>
                </div>
              </div>

              <div className="mt-8 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
                <div>
                  <label className="text-sm font-medium text-slate-200">
                    {locale === "ru"
                      ? "Идентификатор комнаты или ссылка"
                      : "Room ID or link"}
                  </label>
                  <input
                    type="text"
                    value={roomInput}
                    onChange={(e) => setRoomInput(e.target.value)}
                    placeholder={
                      locale === "ru"
                        ? "Например, zoom/meeting/abcd1234 или 6458f2..."
                        : "e.g. zoom/meeting/abcd1234 or 6458f2..."
                    }
                    className="mt-3 w-full rounded-3xl border border-white/10 bg-slate-950/90 px-4 py-4 text-slate-100 shadow-sm outline-none focus:border-cyan-300 focus:ring-2 focus:ring-cyan-300/20"
                  />
                  {error && (
                    <p className="mt-3 text-sm text-rose-400">{error}</p>
                  )}
                </div>

                <div className="rounded-3xl border border-slate-800 bg-slate-950/90 p-6 text-sm text-slate-300">
                  <p className="font-semibold text-white">
                    {locale === "ru"
                      ? "Поддерживаемые шаги"
                      : "What you can do"}
                  </p>
                  <ul className="mt-4 space-y-3">
                    <li className="flex gap-2">
                      <span className="text-cyan-300">•</span>
                      {locale === "ru"
                        ? "Получайте резюме из любой комнаты видео-звонка"
                        : "Summarize any video call room"}
                    </li>
                    <li className="flex gap-2">
                      <span className="text-cyan-300">•</span>
                      {locale === "ru"
                        ? "Просматривайте историю встреч и ключевые решения"
                        : "Review meeting history and decisions"}
                    </li>
                    <li className="flex gap-2">
                      <span className="text-cyan-300">•</span>
                      {locale === "ru"
                        ? "Получайте живые подсказки для ответов"
                        : "Get live response suggestions"}
                    </li>
                    <li className="flex gap-2">
                      <span className="text-cyan-300">•</span>
                      {locale === "ru"
                        ? "Сохраняйте разговоры с микрофона во время звонка"
                        : "Capture conversation from your microphone"}
                    </li>
                  </ul>
                </div>
              </div>

              <button
                onClick={handleOpenRoom}
                className="mt-8 inline-flex items-center justify-center gap-3 rounded-full bg-cyan-500 px-6 py-4 text-base font-semibold text-slate-950 transition hover:bg-cyan-400"
              >
                {locale === "ru" ? "Открыть комнату" : "Open Room"}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
