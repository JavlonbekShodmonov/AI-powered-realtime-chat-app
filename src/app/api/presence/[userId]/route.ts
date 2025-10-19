import type { NextApiRequest, NextApiResponse } from "next";

// Keep a shared map of online users in pages/api/socket.ts
import { onlineUsers } from "../../../../pages/api/socket";  // export it from socket.ts

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { userId } = req.query;
  const online = onlineUsers.has(userId as string);
  res.status(200).json({ online });
}
