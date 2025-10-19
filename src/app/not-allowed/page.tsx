"use client";

import { useSearchParams } from "next/navigation";

export default function NotAllowedPage() {
  const searchParams = useSearchParams();
  const reason = searchParams?.get("reason") || "Access denied";

  return (
    <div className="flex flex-col items-center justify-center h-screen">
      <h1 className="text-xl font-bold">Cannot enter room</h1>
      <p className="mt-2">{reason}</p>
    </div>
  );
}
