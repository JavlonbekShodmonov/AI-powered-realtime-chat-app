'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CreateAppointmentPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState('');
  const [platform, setPlatform] = useState('Google Meet');
  const [meetingUrl, setMeetingUrl] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/appointments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token')}`,
      },
      body: JSON.stringify({ title, startTime, platform, meetingUrl }),
    });

    if (res.ok) {
      router.push('/appointments');
    }
  };

  return (
    <div className="max-w-md mx-auto mt-10 p-6 border rounded-lg shadow-sm bg-white">
      <h2 className="text-xl font-bold mb-4">Schedule a Meeting</h2>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Meeting Title</label>
          <input
            type="text"
            required
            className="mt-1 w-full p-2 border rounded"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Date & Time</label>
          <input
            type="datetime-local"
            required
            className="mt-1 w-full p-2 border rounded"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Video Platform</label>
          <select
            className="mt-1 w-full p-2 border rounded"
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
          >
            <option value="Google Meet">Google Meet</option>
            <option value="Zoom">Zoom</option>
            <option value="MS Teams">Microsoft Teams</option>
            <option value="Other">Other</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Meeting URL / Join Link</label>
          <input
            type="url"
            required
            placeholder="https://zoom.us/j/..."
            className="mt-1 w-full p-2 border rounded"
            value={meetingUrl}
            onChange={(e) => setMeetingUrl(e.target.value)}
          />
        </div>
        <button
          type="submit"
          className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700 font-medium"
        >
          Create Appointment
        </button>
      </form>
    </div>
  );
}