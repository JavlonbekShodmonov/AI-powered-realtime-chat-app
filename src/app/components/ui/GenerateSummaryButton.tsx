"use client";

import { useState } from "react";

interface SummaryButtonProps {
  roomId: string;
  userId: string;
  isPaid: boolean;
  locale?: string;
}

export function GenerateSummaryButton({ roomId, userId, isPaid, locale = "en" }: SummaryButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerateSummary = async () => {
    setLoading(true);
    setError(null);
    try {
      const baseUrl =
        process.env.NEXT_PUBLIC_AI_SERVICE_URL ||
        "https://summeet-live.onrender.com";
      const response = await fetch(`${baseUrl}/api/ai/summarize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, userId, isVideoCall: true, trigger: "live" }),
      });

      if (response.status === 402) {
        setError(locale === "ru" ? "Только для платных пользователей" : "Paid feature only");
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      // Job queued — the real summary arrives via the "summary-finished"
      // socket event elsewhere on the page, same delivery path as the
      // auto-triggered summary.
    } catch (err) {
      console.error("Failed to generate summary:", err);
      setError(locale === "ru" ? "Не удалось создать резюме" : "Failed to generate summary");
    } finally {
      setLoading(false);
    }
  };

  if (!isPaid) {
    return (
      <button
        disabled
        title={locale === "ru" ? "Только для платных пользователей" : "Paid feature — upgrade to unlock"}
        className="px-4 py-2 bg-gray-400 text-white font-medium rounded-lg cursor-not-allowed opacity-60"
      >
        🔒 {locale === "ru" ? "Создать резюме" : "Generate Summary"}
      </button>
    );
  }

  return (
    <div>
      <button
        onClick={handleGenerateSummary}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg disabled:opacity-50 transition-colors"
      >
        {loading
          ? locale === "ru" ? "Создание..." : "Generating Summary..."
          : locale === "ru" ? "Создать резюме" : "Generate Summary"}
      </button>
      {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
    </div>
  );
}