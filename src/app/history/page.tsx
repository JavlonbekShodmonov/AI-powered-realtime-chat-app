'use client';
import { useState, useEffect } from 'react';

export default function SearchableHistoryPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      setError(null);

      try {
        const url = `/api/history/search${query ? `?q=${encodeURIComponent(query)}` : ''}`;
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error('Search failed');
        }
        const data = await res.json();
        setResults(data.results || []);
      } catch (err) {
        console.error(err);
        setError('Unable to load meeting history.');
      } finally {
        setLoading(false);
      }
    };

    const debounce = window.setTimeout(fetchHistory, 250);
    return () => window.clearTimeout(debounce);
  }, [query]);

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold mb-2">Meeting History</h1>
          <p className="text-sm text-gray-500 max-w-2xl">
            Search your recorded call rooms, transcripts, and AI-generated summaries from any supported video platform.
          </p>
        </div>
        <div className="flex gap-3">
          <a
            href="/meeting"
            className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            Open Room
          </a>
          <button
            onClick={() => setQuery('')}
            className="inline-flex items-center justify-center rounded-full border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          >
            Show Recent
          </button>
        </div>
      </div>

      <div className="mb-6">
        <input
          type="text"
          placeholder="Search by room ID, participant, or keyword..."
          className="w-full rounded-2xl border border-gray-200 bg-white px-4 py-4 text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {loading && (
        <div className="text-center py-8 text-gray-500">Loading meeting history...</div>
      )}

      {error && (
        <div className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 mb-6">
          {error}
        </div>
      )}

      <div className="space-y-5">
        {results.length > 0 ? (
          results.map((meeting) => (
            <div key={meeting.roomId} className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="text-sm font-semibold uppercase tracking-wide text-gray-400">Room</div>
                  <div className="mt-2 text-lg font-semibold text-gray-900 break-all">{meeting.roomId}</div>
                  <div className="mt-2 text-sm text-gray-600">
                    Participants: {meeting.participants?.length ? meeting.participants.join(', ') : 'Unknown'}
                    {' • '}
                    {meeting.transcriptCount} transcript entries
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={`/meeting/${encodeURIComponent(meeting.roomId)}`}
                    className="inline-flex items-center justify-center rounded-full bg-indigo-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
                  >
                    Open Room
                  </a>
                  <button
                    onClick={() => {
                      const summaryText = `Room ${meeting.roomId}\n\n${meeting.snippet}`;
                      navigator.clipboard.writeText(summaryText);
                      alert('Summary copied to clipboard');
                    }}
                    className="inline-flex items-center justify-center rounded-full border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                  >
                    Copy Preview
                  </button>
                </div>
              </div>

              <div className="mt-5 text-sm text-gray-700 leading-relaxed">
                {meeting.snippet || 'No transcript preview available yet.'}
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-3xl border border-gray-100 bg-slate-50 p-4 text-sm">
                  <div className="font-semibold text-gray-700">Last activity</div>
                  <div className="mt-2 text-gray-600">{new Date(meeting.lastActivity).toLocaleString()}</div>
                </div>
                <div className="rounded-3xl border border-gray-100 bg-slate-50 p-4 text-sm">
                  <div className="font-semibold text-gray-700">Topics</div>
                  <div className="mt-2 text-gray-600">{meeting.topics?.length ? meeting.topics.join(', ') : 'General meeting'}</div>
                </div>
                <div className="rounded-3xl border border-gray-100 bg-slate-50 p-4 text-sm">
                  <div className="font-semibold text-gray-700">Decisions</div>
                  <div className="mt-2 text-gray-600">{meeting.decisions?.length ? meeting.decisions.join(', ') : 'Not extracted yet'}</div>
                </div>
              </div>
            </div>
          ))
        ) : (
          !loading && (
            <div className="rounded-3xl border border-dashed border-gray-200 bg-white p-10 text-center text-gray-500">
              No matching meetings found yet. Start by opening a room or using a room ID.
            </div>
          )
        )}
      </div>
    </div>
  );
}
