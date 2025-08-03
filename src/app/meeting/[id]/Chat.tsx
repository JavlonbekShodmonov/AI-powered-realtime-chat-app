"use client";

import { useEffect, useState } from "react";
import { getMessages, sendMessage, updateMessage, deleteMessage } from "../../utils/messagesApi";

function Chat({ roomId }: { roomId: string }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [summary, setSummary] = useState("");
  const [loadingSummary, setLoadingSummary] = useState(false);

  useEffect(() => {
    (async () => {
      const data = await getMessages(roomId);
      setMessages(data);
    })();
  }, [roomId]);

  const handleSend = async () => {
    const message = await sendMessage({ roomId, text: newMessage });
    setMessages((prev) => [...prev, message]);
    setNewMessage("");
  };

  const handleUpdate = async (id: string) => {
    const updated = await updateMessage({ id, text: "Edited text" });
    setMessages((prev) =>
      prev.map((msg) => (msg._id === id ? { ...msg, ...updated } : msg))
    );
  };

  const handleDelete = async (id: string) => {
    if (!id) return console.error("no message ID provided");
    await deleteMessage(id);
    setMessages((prev) => prev.filter((msg) => msg._id !== id));
  };

  const handleSummarize = async () => {
    setLoadingSummary(true);
    try {
      const res = await fetch("/api/summarize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: messages.map((msg) => msg.content).join("\n"),
        }),
      });

      const data = await res.json();
      setSummary(data.summary || "No summary available.");
    } catch (error) {
      console.error("Error summarizing chat:", error);
      setSummary("Failed to summarize chat.");
    } finally {
      setLoadingSummary(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto mt-10">
      <div className="flex justify-end mb-4">
        <button
          onClick={handleSummarize}
          className="px-4 py-2 bg-green-500 text-white rounded"
          disabled={loadingSummary}
        >
          {loadingSummary ? "Summarizing..." : "Summarize Chat"}
        </button>
      </div>

      <div className="space-y-4 mb-6">
        {messages.map((msg: any, idx: number) => {
          if (!msg._id) console.warn("message without _id:", msg);
          return (
            <div
              key={msg._id || idx}
              className="p-3 border rounded-md shadow-sm flex justify-between items-center"
            >
              <span className="text-start text-black">{msg.content}</span>
              <div className="space-x-2">
                <button
                  onClick={() => handleUpdate(msg._id)}
                  className="px-2 py-1 text-sm bg-yellow-300 rounded"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(msg._id)}
                  className="px-2 py-1 text-sm bg-red-400 text-white rounded"
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex gap-2 bg-white z-10 relative mb-4">
        <input
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type your message..."
          className="flex-1 p-2 border rounded"
        />
        <button
          onClick={handleSend}
          className="px-4 py-2 bg-blue-500 text-white rounded"
        >
          Send
        </button>
      </div>

      {summary && (
        <div className="mt-6 p-4 border rounded bg-gray-100">
          <h3 className="font-semibold mb-2">Chat Summary:</h3>
          <p className="text-gray-800 whitespace-pre-wrap">{summary}</p>
        </div>
      )}
    </div>
  );
}

export default Chat;
