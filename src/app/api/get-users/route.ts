// app/api/get-users/route.ts
import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export async function GET() {

  const clerk = await clerkClient();
  const { data: users } = await clerk.users.getUserList();

  const userIDs = users.map((user) => ({
    id: user.id,
    email: user.emailAddresses[0]?.emailAddress ?? "No email",
    name: user.fullName ?? "No name",
  }));

  return NextResponse.json(userIDs);
}
