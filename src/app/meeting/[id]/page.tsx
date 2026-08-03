"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useLocale } from "@/app/components/provider/locale-provider";
import AISuggestionsPanel from "@/app/components/ui/AISuggestionsPanel";
import { useTranscription } from "@/app/hooks/useTranscription";
import { Copy, Pause, Play, Sparkles, FileText, RefreshCw } from "lucide-react";
import { SpeechLanguagePicker } from "@/app/components/language/speech-language-picker";
import { useSocket } from "@/app/providers/SocketProvider"; // Adjust path if needed
import { socketManager } from "@/app/utils/socketClient"; // Adjust path if needed

interface SummaryResponse {
  fullSummary: string | null;
  userSummary: string | null;
  message?: string;
  isVideoCall?: boolean;
  messageCount?: number;
  participantCount?: number;
  detectedLanguage?: string;
  error?: string;
}

export function HelpModal({
  open,
  onClose,
  locale,
}: {
  open: boolean;
  onClose: () => void;
  locale: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="max-w-2xl w-full rounded-3xl border border-white/10 bg-slate-900 p-6 sm:p-8 text-slate-100 shadow-2xl">
        <h3 className="text-xl font-bold text-white">
          {locale === "ru"
            ? "Как использовать ссылку в SumMeet"
            : "How to use a join link with SumMeet"}
        </h3>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-sm text-slate-300 leading-relaxed">
          <li>
            {locale === "ru"
              ? "Откройте ссылку на внешнюю встречу (Zoom / Google Meet / и др.) в отдельной вкладке или окне."
              : "Open the external meeting link (Zoom/Meet/etc.) in a separate tab or window."}
          </li>
          <li>
            {locale === "ru"
              ? "Вернитесь на эту страницу плагина SumMeet и нажмите кнопку «Начать», чтобы разрешить доступ к микрофону."
              : "Open this SumMeet companion page and click Start to grant microphone access."}
          </li>
          <li>
            {locale === "ru"
              ? "Убедитесь, что SumMeet и видеозвонок запущены на одном устройстве, чтобы микрофон захватывал звук встречи."
              : "Ensure SumMeet and the meeting run on the same device so the microphone captures the meeting audio."}
          </li>
          <li>
            {locale === "ru"
              ? "По завершении встречи нажмите «Остановить». Транскрипты сохранятся автоматически и сформируют ИИ-резюме."
              : "When finished, click Stop. Transcripts are saved automatically and the summarizer will run."}
          </li>
        </ol>
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="rounded-full bg-cyan-500 px-6 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 transition"
          >
            {locale === "ru" ? "Понятно" : "Got it"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MeetingRoomPage({
  params,
}: {
  params: { id: string };
}) {
  const roomId = params.id;
  const { locale } = useLocale();
  const { data: session } = useSession();
  const socket = useSocket();

  const userId = (session as any)?.user?.id || "guest";
  const userName =
    (session as any)?.user?.name || (locale === "ru" ? "Гость" : "Guest");

  const [summaryData, setSummaryData] = useState<SummaryResponse | null>(null);
  const [isPaid, setIsPaid] = useState(false);

  useEffect(() => {
    if (!userId || userId === "guest") return;
    fetch(`${process.env.NEXT_PUBLIC_AI_SERVICE_URL}/api/ai/plan/${userId}`)
      .then((res) => res.json())
      .then((data) => setIsPaid(!!data.isPaid))
      .catch(() => setIsPaid(false));
  }, [userId]);

  const [loadingSummary, setLoadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [lastSavedChunk, setLastSavedChunk] = useState("");
  const [transcriptionError, setTranscriptionError] = useState<string | null>(
    null,
  );
  const [showHelp, setShowHelp] = useState(false);

  // Load whatever's already persisted (fast, works on reload/late join),
  // then kick off a fresh generation job in the background. The real
  // result — possibly different from what's persisted — arrives via the
  // "summary-finished" socket event below, not from either fetch here.
  useEffect(() => {
    async function loadAndMaybeTrigger() {
      setLoadingSummary(true);
      setSummaryError("");

      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_AI_SERVICE_URL}/api/ai/summary/${roomId}`,
        );
        const persisted = await res.json();
        setSummaryData((prev) => ({ ...(prev as any), ...persisted }));
      } catch (err) {
        console.warn("Could not load persisted summary:", err);
      }

      // Free users don't get live/on-demand generation — only the
      // end-of-call summary, triggered from the Stop button below.
      if (!isPaid) {
        setLoadingSummary(false);
        return;
      }

      try {
        await fetch(
          `${process.env.NEXT_PUBLIC_AI_SERVICE_URL}/api/ai/summarize`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              roomId,
              userId: (session as any)?.user?.id,
              isVideoCall: true,
              trigger: "live",
            }),
          },
        );
      } catch (err: any) {
        setSummaryError(
          err?.message ||
            (locale === "ru"
              ? "Не удалось загрузить резюме встречи."
              : "Could not load the meeting summary."),
        );
      } finally {
        setLoadingSummary(false);
      }
    }

    loadAndMaybeTrigger();
  }, [roomId, (session as any)?.user?.id, locale, isPaid]);

  // Live update when AIProcessor finishes — delivered to the `user:${userId}`
  // room every authenticated socket auto-joins, so no explicit joinRoom
  // call is needed for this specific event.
  useEffect(() => {
    if (!userId || userId === "guest") return;

    const socket = socketManager.connect(userId, userName);

    function handleSummaryFinished(data: any) {
      if (!data?.success) return;
      setSummaryData((prev) => ({
        ...(prev as any),
        fullSummary: data.fullSummary,
        userSummary: data.userSummary,
        detectedLanguage: data.language,
      }));
      setLoadingSummary(false);
    }

    socket.on("summary-finished", handleSummaryFinished);
    return () => {
      socket.off("summary-finished", handleSummaryFinished);
    };
  }, [userId, userName]);

  // Trigger AI Summarization on Demand
  const handleRequestSummary = async () => {
    setLoadingSummary(true);
    setSummaryError("");

    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_AI_SERVICE_URL || "http://localhost:3003";
      const response = await fetch(`${baseUrl}/api/ai/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          userId: (session as any)?.user?.id || undefined,
          isVideoCall: true,
        }),
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(
          data.error || data.message || "Failed to trigger summary",
        );
      }
      // Job queued successfully; socket event will update state when done
    } catch (error: any) {
      console.error("Summary trigger failed:", error);
      setSummaryError(
        error?.message ||
          (locale === "ru"
            ? "Не удалось запросить резюме встречи."
            : "Could not request the meeting summary."),
      );
      setLoadingSummary(false);
    }
  };

  const { status, start, stop, engine, speechLang, setSpeechLang } =
    useTranscription({
      roomId,
      userId,
      userName,
      onChunk: (text) => setLastSavedChunk(text),
      onError: (msg) => setTranscriptionError(msg),
      onStatusChange: (s) => console.log("Transcription status:", s),
    });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Header Section */}
        <div className="mb-8 flex flex-col gap-4 rounded-3xl border border-white/10 bg-slate-900/80 p-8 shadow-2xl shadow-black/40 backdrop-blur-xl">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">
                {locale === "ru"
                  ? "Плагин для видеовстреч"
                  : "Video call plugin"}
              </p>
              <h1 className="mt-3 text-4xl font-black text-white sm:text-5xl">
                {locale === "ru" ? "Комната встречи" : "Meeting room"}
              </h1>
              <p className="mt-2 max-w-2xl text-slate-400">
                {locale === "ru"
                  ? "SumMeet подключается к существующим звонкам, ведет транскрипцию и создает резюме с подсказками в реальном времени."
                  : "SumMeet connects to an existing video room, extracts transcripts, and provides concise summaries and live response suggestions."}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(roomId)}
                className="inline-flex items-center gap-2 rounded-full bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/20"
              >
                <Copy className="h-4 w-4" />
                {locale === "ru" ? "Скопировать ID" : "Copy room ID"}
              </button>
              <a
                href="/history"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                <FileText className="h-4 w-4" />
                {locale === "ru" ? "История" : "History"}
              </a>
            </div>
          </div>

          {/* Metrics */}
          <div className="grid gap-4 md:grid-cols-3 mt-4">
            <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-5">
              <p className="text-sm text-slate-400">
                {locale === "ru" ? "Транскрипты" : "Transcripts"}
              </p>
              <p className="mt-3 text-3xl font-semibold text-white">
                {summaryData?.messageCount ?? "—"}
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-5">
              <p className="text-sm text-slate-400">
                {locale === "ru" ? "Участники" : "Participants"}
              </p>
              <p className="mt-3 text-3xl font-semibold text-white">
                {summaryData?.participantCount ?? "—"}
              </p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-5">
              <p className="text-sm text-slate-400">
                {locale === "ru" ? "Язык" : "Language"}
              </p>
              <p className="mt-3 text-3xl font-semibold text-white">
                {summaryData?.detectedLanguage ||
                  (locale === "ru" ? "Неизвестно" : "Unknown")}
              </p>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid gap-6 lg:grid-cols-[1.75fr_1fr]">
          <div className="space-y-6">
            {/* AI Summary Section */}
            <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-8 shadow-xl shadow-black/20">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold text-white">
                    {locale === "ru"
                      ? "ИИ-резюме встречи"
                      : "AI-powered summary"}
                  </h2>
                  <p className="mt-2 text-sm text-slate-400">
                    {locale === "ru"
                      ? "Обзор комнаты с ключевыми темами, решениями и задачами."
                      : "Overview of the room with key topics, decisions, and action items."}
                  </p>
                </div>

                {/* On-Demand Generate Summary Button */}
                <button
                  onClick={handleRequestSummary}
                  disabled={loadingSummary}
                  className="inline-flex items-center gap-2 rounded-full bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-cyan-400 transition disabled:opacity-50"
                >
                  <RefreshCw
                    className={`h-4 w-4 ${loadingSummary ? "animate-spin" : ""}`}
                  />
                  {loadingSummary
                    ? locale === "ru"
                      ? "Генерация..."
                      : "Generating..."
                    : locale === "ru"
                      ? "Сформировать резюме"
                      : "Generate Summary"}
                </button>
              </div>

              {summaryError ? (
                <div className="mt-6 rounded-3xl border border-rose-500/20 bg-rose-500/10 p-5 text-sm text-rose-200">
                  {summaryError}
                </div>
              ) : loadingSummary ? (
                <div className="mt-6 rounded-3xl border border-white/10 bg-slate-950/80 p-6 text-center text-slate-400">
                  {locale === "ru"
                    ? "Загрузка резюме..."
                    : "Loading your summary..."}
                </div>
              ) : (
                <div className="mt-6 space-y-5">
                  <div className="rounded-3xl bg-slate-950/80 p-6 text-slate-200 shadow-inner shadow-black/20">
                    {summaryData?.fullSummary ? (
                      <div className="space-y-4 whitespace-pre-line text-sm leading-7">
                        {summaryData.fullSummary}
                      </div>
                    ) : (
                      <p className="text-slate-400">
                        {locale === "ru"
                          ? "Резюме пока не сформировано. Нажмите «Сформировать резюме» выше."
                          : "Summary is not generated yet. Click 'Generate Summary' above."}
                      </p>
                    )}
                  </div>

                  {summaryData?.userSummary && (
                    <div className="rounded-3xl border border-cyan-500/20 bg-slate-950/90 p-6">
                      <div className="flex items-center gap-2 text-sm font-semibold text-cyan-300">
                        <Sparkles className="h-4 w-4" />
                        {locale === "ru" ? "Ваш вклад" : "Your contribution"}
                      </div>
                      <div className="mt-4 whitespace-pre-line text-sm leading-7 text-slate-200">
                        {summaryData.userSummary}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Transcript Capture Section */}
            <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-8 shadow-xl shadow-black/20">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold text-white">
                    {locale === "ru"
                      ? "Запись транскрипта"
                      : "Transcript capture"}
                  </h2>
                  <p className="mt-2 text-sm text-slate-400">
                    {locale === "ru"
                      ? "Используйте микрофон для записи живой речи в процессе звонка."
                      : "Use your microphone to capture live conversation and save it into SumMeet."}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  {" "}
                  {engine === "webspeech" && setSpeechLang && (
                    <SpeechLanguagePicker
                      currentLang={speechLang}
                      onSelect={setSpeechLang}
                    />
                  )}
                  <div className="inline-flex rounded-full bg-white/10 px-4 py-2 text-sm text-slate-200">
                    {status === "recording"
                      ? locale === "ru"
                        ? "Запись"
                        : "Recording"
                      : status === "transcribing"
                        ? locale === "ru"
                          ? "Транскрибация"
                          : "Transcribing"
                        : locale === "ru"
                          ? "Готов"
                          : "Ready"}
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-[1fr_auto] items-start">
                <div className="rounded-3xl bg-slate-950/80 p-5 text-sm text-slate-200 shadow-inner shadow-black/20">
                  <p className="font-semibold text-slate-200">
                    {locale === "ru"
                      ? "Последний фрагмент"
                      : "Last saved chunk"}
                  </p>
                  <p className="mt-3 min-h-[5rem] whitespace-pre-line text-sm leading-6 text-slate-300">
                    {lastSavedChunk ||
                      (locale === "ru"
                        ? "Пока нет новых фрагментов"
                        : "No new chunks yet")}
                  </p>
                </div>

                <div className="flex sm:flex-col gap-3">
                  <button
                    onClick={() => start()}
                    disabled={status === "recording"}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Play className="h-4 w-4" />
                    {locale === "ru" ? "Начать" : "Start"}
                  </button>
                  <button
                    onClick={() => {
                      stop();
                      fetch(
                        `${process.env.NEXT_PUBLIC_AI_SERVICE_URL}/api/ai/summarize`,
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            roomId,
                            userId,
                            isVideoCall: true,
                            trigger: "end-of-call",
                          }),
                        },
                      ).catch((err) =>
                        console.warn(
                          "End-of-call summary trigger failed:",
                          err,
                        ),
                      );
                    }}
                    disabled={status !== "recording"}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Pause className="h-4 w-4" />
                    {locale === "ru" ? "Остановить" : "Stop"}
                  </button>
                </div>
              </div>

              {transcriptionError && (
                <div className="mt-4 rounded-3xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200">
                  {transcriptionError}
                </div>
              )}
            </section>
          </div>

          {/* Sidebar */}
          <aside className="space-y-6">
            <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-xl shadow-black/20">
              <div className="flex items-center gap-3">
                <Sparkles className="h-5 w-5 text-cyan-300" />
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    {locale === "ru" ? "Живые подсказки" : "Live suggestions"}
                  </h3>
                  <p className="text-sm text-slate-400">
                    {locale === "ru"
                      ? "Идеи ответов на основе текущей беседы."
                      : "Get ideas for what to say next in the current conversation."}
                  </p>
                </div>
              </div>
              <div className="mt-6">
                <AISuggestionsPanel
                  roomId={roomId}
                  userId={userId}
                  userName={userName}
                  locale={locale}
                  onSelectSuggestion={() => {}}
                />
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-xl shadow-black/20">
              <h3 className="text-lg font-semibold text-white">
                {locale === "ru" ? "Ссылка / ID звонка" : "Call link"}
              </h3>
              <p className="mt-3 text-sm text-slate-400">
                {locale === "ru"
                  ? "Скопируйте ID комнаты для доступа к ней или загрузки истории."
                  : "Copy the room ID to use in your meeting or to fetch history later."}
              </p>
              <div className="mt-4 inline-flex max-w-full items-center gap-2 break-all rounded-full border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-100">
                {roomId}
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  onClick={() => setShowHelp(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-100 hover:bg-white/10 transition"
                >
                  {locale === "ru"
                    ? "Как использовать"
                    : "How to use this link"}
                </button>
                <button
                  onClick={() => navigator.clipboard.writeText(roomId)}
                  className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white hover:bg-white/20 transition"
                >
                  {locale === "ru" ? "Скопировать ID" : "Copy ID"}
                </button>
              </div>
            </section>
          </aside>
        </div>
      </div>

      <HelpModal
        open={showHelp}
        onClose={() => setShowHelp(false)}
        locale={locale}
      />
    </div>
  );
}
