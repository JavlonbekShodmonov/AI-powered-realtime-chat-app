import React, { useState } from 'react';
import { Lightbulb, Sparkles, RefreshCw, X } from 'lucide-react';

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
  locale = 'en',
}: AISuggestionsPanelProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSuggestions = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/suggest-response', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomId,
          userId,
          userName,
          lastMessagesCount: 10,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setSuggestions(data.suggestions || []);
    } catch (err) {
      console.error('Failed to fetch suggestions:', err);
      setError(locale === 'ru' ? 'Не удалось загрузить предложения' : 'Failed to load suggestions');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSuggestion = (suggestion: string) => {
    onSelectSuggestion(suggestion);
    // Optionally close or refresh after selection
    // setIsOpen(false);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 right-4 bg-gradient-to-r from-purple-500 to-indigo-600 text-white p-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-300 z-50 group"
        title={locale === 'ru' ? 'Показать AI помощника' : 'Show AI Helper'}
      >
        <Sparkles className="w-6 h-6 group-hover:animate-pulse" />
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-80 bg-white border-2 border-indigo-300 rounded-2xl shadow-2xl z-50 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-500 to-indigo-600 text-white p-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5" />
          <h3 className="font-semibold">
            {locale === 'ru' ? 'AI Помощник' : 'AI Helper'}
          </h3>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="hover:bg-white/20 rounded-full p-1 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 max-h-96 overflow-y-auto">
        {suggestions.length === 0 && !loading && !error && (
          <div className="text-center py-8">
            <Lightbulb className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500 text-sm mb-4">
              {locale === 'ru'
                ? 'Получите умные предложения для ответа'
                : 'Get smart suggestions for your response'}
            </p>
            <button
              onClick={fetchSuggestions}
              className="px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-lg hover:opacity-90 transition-opacity text-sm font-medium"
            >
              {locale === 'ru' ? 'Получить предложения' : 'Get Suggestions'}
            </button>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            <span className="ml-3 text-gray-600">
              {locale === 'ru' ? 'Генерация...' : 'Generating...'}
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
              {locale === 'ru' ? 'Попробовать снова' : 'Try Again'}
            </button>
          </div>
        )}

        {suggestions.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm text-gray-600 font-medium">
                {locale === 'ru' ? 'Предлагаемые ответы:' : 'Suggested responses:'}
              </p>
              <button
                onClick={fetchSuggestions}
                disabled={loading}
                className="text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                title={locale === 'ru' ? 'Обновить' : 'Refresh'}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
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
                {locale === 'ru' ? '🔄 Новые предложения' : '🔄 New Suggestions'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Footer tip */}
      <div className="bg-gray-50 px-4 py-2 text-xs text-gray-500 border-t border-gray-200">
        💡 {locale === 'ru' 
          ? 'Нажмите на предложение, чтобы использовать его'
          : 'Click a suggestion to use it'}
      </div>
    </div>
  );
}