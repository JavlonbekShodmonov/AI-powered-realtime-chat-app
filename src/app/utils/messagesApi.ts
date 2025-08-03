// utils/messagesApi.ts

export async function getMessages(roomId: string) {
  const res = await fetch(`/api/messages/roomId/${roomId}?page=1&limit=20`, {
    method: "GET",
  });

  if (!res.ok) {
    const errorText = await res.text();
    console.error("API Error:", errorText);
    throw new Error("Failed to fetch messages");
  }
  
  return res.json();
}

export async function sendMessage({
  roomId,
  text,
}: {
  roomId: string;
  text: string;
}) {
  const res = await fetch("/api/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ roomId, text }),
  });

  if (!res.ok) throw new Error("Failed to send message");

  return res.json();
}

export async function updateMessage({
  id,
  text,
}: {
  id: string;
  text: string;
}) {
  const res = await fetch(`/api/messages/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) throw new Error("Failed to update message");

  return res.json();
}

export async function deleteMessage(id: string) {
  const res = await fetch(`/api/messages/${id}`, {
    method: "DELETE",
  });

  if (!res.ok) throw new Error("Failed to delete message");

  return res.json();
}
