"use client";

import React, { useState, useEffect } from "react";
import { Lightbulb, Sparkles, RefreshCw, X } from "lucide-react";
import { socketManager } from "@/app/utils/socketClient"; // adjust path to your actual file

interface AISuggestionsPanelProps {
  roomId: string;
  userId: string;
  userName: string;
  onSelectSuggestion: (text: string) => void;
  locale?: string;
}

export default function AISuggestionsPanel({
  roomId,
  userId,
  userName,
  onSelectSuggestion,
  locale = "en",
}: AISuggestionsPanelProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Guests never had a NextAuth session, so /api/socket-token can't
    // authenticate them — no point attempting a connection that the
    // gateway will just reject.
    if (!userId || userId === "guest") return;

    const socket = socketManager.connect(userId, userName);

    // Delivered directly to the `user:${userId}` room every authenticated
    // socket auto-joins on connect (see RealtimeGateway.handleConnection) —
    // no joinRoom call needed for this specific event.
    function handleSuggestionsReady(data: any) {
      if (!data?.success) return;
      setSuggestions(data.suggestions || []);
      setLoading(false);
      if (data.note) {
        // Non-fatal note (e.g. quota fallback) — suggestions still arrived,
        // just via the fallback path. Not treated as an error.
        console.log("Suggestions note:", data.note);
      }
    }

    socket.on("suggestions-ready", handleSuggestionsReady);
    return () => {
      socket.off("suggestions-ready", handleSuggestionsReady);
    };
  }, [userId, userName]);

  const fetchSuggestions = async () => {
    setLoading(true);
    setError(null);

    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_AI_SERVICE_URL || "http://localhost:3003";
      const response = await fetch(`${baseUrl}/api/ai/suggest-response`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: String(roomId),
          userId,
          userName,
          lastMessagesCount: 10,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      // Deliberately not reading the response body for suggestions here —
      // this call only queues the job (see ai.controller.ts's
      // { message: 'Suggestion job queued', jobId }). The real suggestions
      // arrive via the "suggestions-ready" socket listener above.
      //one small change, the catch block in fetchSuggestions, to show the upgrade
      // message instead of a generic error on a 402:
    } catch (err: any) {
      console.error("Failed to request suggestions:", err);
      const is402 = err?.message?.includes("402");
      setError(
        is402
          ? locale === "ru"
            ? "Бесплатная попытка уже использована. Оформите платную подписку."
            : "Free trial used. Upgrade for unlimited suggestions."
          : locale === "ru"
            ? "Не удалось запросить предложения"
            : "Failed to request suggestions",
      );
      setLoading(false);
    }
  };

  const handleSelectSuggestion = (suggestion: string) => {
    onSelectSuggestion(suggestion);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 right-4 bg-gradient-to-r from-purple-500 to-indigo-600 text-white p-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 z-50 group"
        title={locale === "ru" ? "Показать AI помощника" : "Show AI Helper"}
      >
        <Sparkles className="w-6 h-6 group-hover:animate-pulse" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 left-4 sm:left-auto w-auto sm:w-80 bg-white border-2 border-indigo-300 rounded-2xl shadow-2xl z-50 overflow-hidden">
      {" "}
      <div className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5" />
          <h3 className="font-semibold">
            {locale === "ru" ? "AI Помощник" : "AI Helper"}
          </h3>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="hover:bg-white/20 rounded-full p-1 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="p-4 max-h-96 overflow-y-auto">
        {suggestions.length === 0 && !loading && !error && (
          <div className="text-center py-8">
            <Lightbulb className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500 text-sm mb-4">
              {locale === "ru"
                ? "Получите умные предложения для ответа"
                : "Get smart suggestions for your response"}
            </p>
            <button
              onClick={fetchSuggestions}
              className="px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
            >
              {locale === "ru" ? "Получить предложения" : "Get Suggestions"}
            </button>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            <span className="ml-3 text-gray-600">
              {locale === "ru" ? "Генерация..." : "Generating..."}
            </span>
          </div>
        )}

        {error && (
          <div className="text-center py-4">
            <p className="text-red-500 text-sm mb-3">{error}</p>
            <button
              onClick={fetchSuggestions}
              className="text-indigo-600 text-sm hover:underline"
            >
              {locale === "ru" ? "Попробовать снова" : "Try Again"}
            </button>
          </div>
        )}

        {suggestions.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-600 font-medium">
                {locale === "ru"
                  ? "Предлагаемые ответы:"
                  : "Suggested responses:"}
              </p>
              <button
                onClick={fetchSuggestions}
                disabled={loading}
                className="text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                title={locale === "ru" ? "Обновить" : "Refresh"}
              >
                <RefreshCw
                  className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
                />
              </button>
            </div>

            <div className="space-y-2">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => handleSelectSuggestion(suggestion)}
                  className="w-full text-left p-3 rounded-lg border-2 border-gray-200 hover:border-indigo-400 hover:bg-indigo-50 transition-all duration-200 group"
                >
                  <div className="flex items-start gap-2">
                    <span className="text-indigo-600 font-semibold text-sm flex-shrink-0 mt-0.5">
                      {index + 1}.
                    </span>
                    <p className="text-sm text-gray-700 group-hover:text-indigo-900">
                      {suggestion}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-3 pt-3 border-t border-gray-200">
              <button
                onClick={fetchSuggestions}
                disabled={loading}
                className="w-full py-2 text-sm text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-50"
              >
                {locale === "ru"
                  ? "🔄 Новые предложения"
                  : "🔄 New Suggestions"}
              </button>
            </div>
          </>
        )}
      </div>
      <div className="bg-gray-50 px-4 py-2 text-xs text-gray-500 border-t border-gray-200">
        💡{" "}
        {locale === "ru"
          ? "Нажмите на предложение, чтобы использовать его"
          : "Click a suggestion to use it"}
      </div>
    </div>
  );
}
