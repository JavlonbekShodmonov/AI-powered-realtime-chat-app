// src/app/not-allowed/page.tsx
import ClientNotAllowed from "./ClientNotAllowed";

export const dynamic = "force-dynamic"; // ensure Next.js does runtime rendering

export default function NotAllowedPage() {
  return <ClientNotAllowed />;
}
