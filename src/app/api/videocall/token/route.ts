import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { roomName } = await request.json();

  const response = await fetch('https://api.daily.co/v1/meeting-tokens', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: { room_name: roomName, is_owner: true },
    }),
  });

  const data = await response.json();
  
  if (data.token) {
    return NextResponse.json({ token: data.token });
  } 
  return NextResponse.json({ error: "Could not generate token" }, { status: 500 });
}