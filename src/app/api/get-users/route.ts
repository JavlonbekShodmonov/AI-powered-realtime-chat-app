export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;


import { NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";

interface UserDocument {
  _id: { toString(): string };
  name?: string;
  email?: string;
  image?: string | null;
}

interface UserResult {
  id: string;
  name?: string;
  email?: string;
  image?: string | null;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.toLowerCase() || "";

    const client = await clientPromise;
    const db = client.db();

    // Fetch users from MongoDB with search filter
    const users: UserDocument[] = (await db
      .collection<UserDocument>("users")
      .find({
        $or: [
          { name: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
        ],
      })
      .limit(100)
      .project({ _id: 1, name: 1, email: 1, image: 1 })
      .toArray()) as unknown as UserDocument[];

    // Map MongoDB documents to API-friendly result
    const result: UserResult[] = users.map((u) => ({
      id: u._id.toString(),
      name: u.name,
      email: u.email,
      image: u.image ?? null,
    }));

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error("❌ Error fetching users:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}
