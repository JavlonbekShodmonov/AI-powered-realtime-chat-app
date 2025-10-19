import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.toLowerCase() || "";

    // ✅ Get all users (limit as needed)
    const clerk = await clerkClient()
    const { data: users } = await clerk.users.getUserList({ limit: 100 });

    // ✅ Filter users by name or email
    const filtered = users.filter((u) => {
      const first = u.firstName?.toLowerCase() || "";
      const last = u.lastName?.toLowerCase() || "";
      const email = u.emailAddresses?.[0]?.emailAddress?.toLowerCase() || "";
      return (
        first.includes(search) ||
        last.includes(search) ||
        email.includes(search)
      );
    });

    // ✅ Map only needed data
    const result = filtered.map((u) => ({
      id: u.id,
      name: u.fullName || `${u.firstName || ""} ${u.lastName || ""}`.trim(),
      email: u.emailAddresses?.[0]?.emailAddress || "",
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("❌ Error fetching users:", error);
    return NextResponse.json({ error: "Failed to fetch users" }, { status: 500 });
  }
}
