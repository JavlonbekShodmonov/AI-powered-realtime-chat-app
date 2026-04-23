export default async function handler(req: any, res: any) {
  const { roomName } = req.body;

  // 1. Create a token that bypasses the Daily.co login
  const response = await fetch('https://api.daily.co/v1/meeting-tokens', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.DAILY_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        room_name: roomName,
        is_owner: true, // Gives the user host permissions automatically
      },
    }),
  });

  const data = await response.json();
  
  if (data.token) {
    return res.status(200).json({ token: data.token });
  } else {
    return res.status(500).json({ error: "Could not generate token" });
  }
}