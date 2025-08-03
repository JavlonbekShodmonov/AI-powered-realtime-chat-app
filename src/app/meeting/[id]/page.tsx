import dynamic from "next/dynamic";

// Dynamically import Chat component to avoid hydration errors
const Chat = dynamic(() => import("./Chat"), { ssr: false });

export default function MeetingPage({ params }: { params: { id: string } }) {
  const roomId = params.id; // ✅ Use this instead of useParams()

  return (
    <main className="max-w-2xl mx-auto pt-12">
      <h1 className="text-2xl font-bold text-center mb-4">
        Meeting Room: {roomId}
      </h1>
      <Chat roomId={roomId} />
    </main>
  );
}
