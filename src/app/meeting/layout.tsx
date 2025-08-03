"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect } from "react";

interface ChatComponentProps {
  socket: any; // Replace 'any' with the actual socket type if available
  meetingId: string;
  children:React.ReactNode;
}
export default function Meetings({socket,meetingId,children}: ChatComponentProps) {

const router = useRouter();

  const handleExit = () => {
    if(socket){
      socket.emit("leaveMeeting", {meetingId});
      socket.disconnect();
    }

    router.push("/schedule");
  }
  useEffect(() => {
  if (!socket) return;

  socket.on("user-left", () => {
    alert("The other user has left the chat");
    // optionally redirect or disable chat
  });

  return () => {
    socket.off("user-left");
  };
}, [socket]);

    <div className="flex flex-col items-center justify-center h-screen">
      <h1 className="text-2xl font-bold mb-4">Welcome to Your Meetings</h1>
      <Link href="/schedule" className="text-blue-500 hover:underline">
        Schedule a new meeting
      </Link>
    </div>

  
  return (
    <>
      <div className="block font-sans text-center font-light">
        <main className="flex justify-center items-center">
          <div className="flex flex-col space-y-8 mb-96">
            <button className="border-2 hover:bg-black hover:text-white rounded-2xl border-black pl-4 pr-4 space-y-4 w-auto">
              <Link href={"/schedule"}>
                main <br /> page
              </Link>
            </button>
            <button
              className="border-2 rounded-3xl  hover:bg-black hover:text-white border-black pl-4 pr-4 space-y-4 w-auto pt-2 pb-2"
              onClick={handleExit}
            >
              exit
            </button>
          </div>

          <div className="w-screen relative h-screen overflow-clip mr-32 mb-28 bg-white border-2 border-black rounded-2xl mt-10 flex justify-center items-center">
            <div className="m-8 rounded-3xl border-2 border-black h-5/6 w-5/6 ">
              {children}
            </div>
          </div>
          <div className="absolute mt-32 flex flex-col items-center">
            <button className=" border-2 border-black pr-4 pl-4 rounded-full mt-96 text-center uppercase text-xl font-semibold ">
              Summarize
            </button>
            <div className="block ">
              <div className="w-0 h-0 border-l-[10px] border-r-[10px] border-b-[10px] border-l-transparent border-r-transparent border-b-black"></div>
            </div>
            <h2 className="font-light text-xl uppercase">
              click to summarize your chat with{}
            </h2>
          </div>
        </main>
      </div>
    </>
  );

}