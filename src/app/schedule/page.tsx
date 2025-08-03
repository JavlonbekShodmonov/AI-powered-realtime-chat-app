"use client";

import DatePicker from "react-datepicker";
import React, { useState } from "react";
import "react-datepicker/dist/react-datepicker.css";
import { useUser } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

type UserType = {
  id: string;
  email: string;
  name: string;
};

export default function FirstPage() {
  const [showUsers, setShowUsers] = useState(false);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const { isSignedIn } = useUser();
  const [users, setUsers] = useState<UserType[]>([]);
  const [error, setError] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const isReady = selectedUser && startDate;
  const router = useRouter();

  const handleStartChat = () => {
    if (!isReady) {
      console.warn("Chat not ready. Missing required data.");
      return;
    }

    if (!selectedUser) {
      alert("Please select a user to chat with.");
      return;
    }

    console.log("Starting chat with:", selectedUser);

    // Example: Redirect to a dynamic chat route like /chat/[userId]
    router.push(`/meeting/${selectedUser.id}`);
  };

  const handleFetchUsers = async () => {
    if (!isSignedIn) {
      alert("not signed in");
      return;
    }
    try {
      const response = await fetch("/api/get-users");
      if (!response.ok) {
        throw new Error("Failed to fetch users");
      }
      const data: UserType[] = await response.json();
      setUsers(data);
      setShowUsers(true);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="block bg-white font-sans">
      <div className="flex justify-around w-full mt-5 focus:bg-black focus:text-white text-black font-semibold sm:text-sm">
        <button
          className="w-40 border-2 border-black rounded-lg p-2"
          onClick={() => setShowCalendar(!showCalendar)}
        >
          Calendar
        </button>

        <div className="w-fit border-2 border-black rounded-lg p-2 text-center">
          set time: {startDate ? startDate.toLocaleString() : "none"} with{" "}
          {selectedUser?.name ?? "no one"}
        </div>
      </div>

      {/* Drop-down calendar with time selection */}
      {showCalendar && (
        <div className="mt-4 ml-16">
          <DatePicker
            selected={startDate}
            onChange={(date) => {
              setStartDate(date);
              setShowCalendar(true); // close dropdown after selecting
            }}
            onCalendarClose={() => setShowCalendar(true)} // auto-close on blur
            showTimeSelect
            timeIntervals={1}
            placeholderText="Select date and time"
            dateFormat="Pp"
            inline
          />
        </div>
      )}

      <div className="ml-16 justify-items-center mr-96 pr-96 mt-10">
        <div className="w-0 h-0 border-l-[10px] border-r-[10px] border-b-[10px] border-l-transparent border-r-transparent border-b-black"></div>
        <h2 className="font-light text-xl uppercase">click to pick a time</h2>
      </div>

      <div
        className={`transition-all duration-500 ease-in-out w-fit border-2 ${
          showUsers ? "h-auto" : "h-fit"
        } space-y-4 border-slate-600 rounded-2xl p-4 text-center flex flex-col items-center hover:border-white mt-10 justify-self-center self-center`}
      >
        <button
          disabled={!isReady}
          className={`mt-4 px-4 py-2 rounded text-white font-semibold ${
            isReady
              ? "bg-green-500 hover:bg-green-600"
              : "bg-gray-400 cursor-not-allowed"
          }`}
          onClick={handleStartChat}
        />
        Start Chat
        <button
          onClick={handleFetchUsers}
          className="bg-black text-white px-4 py-2 rounded-xl"
        >
          Choose whom to chat
        </button>
        {showUsers && (
          <div className="mt-4">
            <h3 className="font-semibold text-lg">Users:</h3>
            <ul className="space-y-2 ">
              {users.map((user) => (
                <li key={user.id} className="text-left">
                  <button
                    className=" hover:bg-black hover:text-white border p-2 rounded bg-gray-100"
                    onClick={() => setSelectedUser(user)}
                  >
                    <strong>Name:</strong> {user.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
