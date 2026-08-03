import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth"; 
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import jwt from "jsonwebtoken";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth();
  
  // Cast to any to bypass NextAuth's default User type lacking the 'id' field
  const userId = (session?.user as any)?.id || (session as any)?.userId;
  
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  let userName = session?.user?.name || (session as any)?.userName;
  
  if (!userName) {
    try {
      const client = await clientPromise;
      const db = client.db();
      const user = await db
        .collection("users")
        .findOne(
          { _id: (ObjectId.isValid(userId) ? new ObjectId(userId) : userId ) as any},
          { projection: { name: 1, username: 1, email: 1 } }
        );
      userName = user?.name || user?.username || user?.email || "Anonymous";
    } catch (err) {
      console.error("Failed to look up user name for socket token:", err);
      userName = "Anonymous";
    }
  }

  const secret = process.env.SOCKET_AUTH_SECRET;
  if (!secret) {
    console.error("SOCKET_AUTH_SECRET is not configured");
    return NextResponse.json({ message: "Server misconfigured" }, { status: 500 });
  }

  const token = jwt.sign(
    { userId: String(userId), userName },
    secret,
    { expiresIn: "5m" }
  );

  return NextResponse.json({ token });
}