"use client";

import DatePicker from "react-datepicker";
import React, { useEffect, useState, useRef } from "react";
import "react-datepicker/dist/react-datepicker.css";
import { useRouter } from "next/navigation";
import { canEnterRoom } from "../utils/roomApi";
import { useSession } from "next-auth/react";
import { socketManager } from "../utils/socketClient"; // ✅ Import and USE

type UserType = {
  id: string;
  email: string;
  name: string;
};

export default function FirstPage() {
  const [showAppointments, setShowAppointments] = useState(false);
  const [showUsers, setShowUsers] = useState(false);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const { data: session } = useSession();
  const user = session?.user as UserType | undefined;
  const isSignedIn = !!session?.user;

  const [users, setUsers] = useState<UserType[]>([]);
  const [error, setError] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<UserType[]>([]);
  const isReady = selectedUsers.length > 0 && startDate;
  const router = useRouter();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isClient, setIsClient] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [pendingNotifications, setPendingNotifications] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearching, setIsSearching] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleSearch = async (query: string) => {
    setSearchTerm(query);

    if (query.trim().length === 0) {
      setUsers([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    try {
      const res = await fetch(
        `/api/get-users?search=${encodeURIComponent(query)}`
      );
      if (!res.ok) throw new Error("Failed to search users");

      const data: UserType[] = await res.json();

      if (data && data.length > 0) {
        setUsers(data);
      } else {
        setUsers([]);
      }
    } catch (err) {
      console.error("Search error:", err);
      setUsers([]);
    } finally {
      setIsSearching(false);
    }
  };

  // ✅ Setup audio once on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      audioRef.current = new Audio("/notification.mp3");
      setIsClient(true);
    }
  }, []);

  const unlockAudio = () => {
    audioRef.current
      ?.play()
      .then(() => {
        audioRef.current?.pause();
        audioRef.current!.currentTime = 0;
        setAudioUnlocked(true);
      })
      .catch(() => {});
  };

  function playNotificationSound() {
    if (audioUnlocked && audioRef.current) {
      audioRef.current.play().catch(() => {});
    }
  }

  const handleFetchUsers = async () => {
    if (!isSignedIn) {
      alert("Not signed in");
      return;
    }
    try {
      const response = await fetch("/api/get-users");
      if (!response.ok) throw new Error("Failed to fetch users");
      const data: UserType[] = await response.json();
      setUsers(data);
      setShowUsers(true);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleEnableNotifications = async () => {
    if (!("Notification" in window)) {
      alert("This browser does not support notifications.");
      return;
    }

    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      setNotificationsEnabled(true);
      alert("Notifications enabled! 🎉");

      pendingNotifications.forEach((appointment) => {
        const audio = new Audio("/notification.mp3");
        audio.play().catch(() => {});
        new Notification("New Appointment", {
          body: `Appointment on ${appointment.scheduledAt} with ${appointment.createdBy.username}`,
          icon: "/favicon.avif",
        });
      });
      setPendingNotifications([]);
    }

    const audio = new Audio("/notification.mp3");
    audio
      .play()
      .then(() => setAudioUnlocked(true))
      .catch(() => {});
  };

  // Fetch appointments once when user is available
  useEffect(() => {
    if (!user?.id) return;

    const fetchAppointments = async () => {
      try {
        const res = await fetch("/api/appointments", {
          method: "GET",
          credentials: "include",
        });
        if (!res.ok) {
          throw new Error("Failed to fetch appointments: " + res.statusText);
        }
        const data = await res.json();
        setAppointments(data);
      } catch (err) {
        console.error("Error fetching appointments:", err);
      }
    };

    fetchAppointments();
  }, [user?.id]);

  // ✅ Socket connection using singleton manager
  useEffect(() => {
    if (!user?.id) return;

    // ✅ USE socketManager to connect
    const socket = socketManager.connect(user.id,process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || "https://shadmanov-socket.onrender.com");

    // Set up event listeners
    const handleNewAppointment = (appointment: any) => {
      console.log("📅 New appointment received:", appointment);

      setAppointments((prev) => {
        const exists = prev.some((a) => a._id === appointment._id);
        if (exists) {
          console.log("⚠️ Appointment already exists, skipping duplicate");
          return prev;
        }
        return [...prev, appointment];
      });

      if (audioUnlocked && audioRef.current) {
        audioRef.current.play().catch(() => {});
      }

      if (Notification.permission === "granted") {
        new Notification("New Appointment", {
          body: `Appointment on ${new Date(
            appointment.scheduledAt
          ).toLocaleString()}`,
          icon: "/favicon.avif",
        });
      }
    };

    const handleAppointmentUpdated = (updated: any) => {
      console.log("📝 Appointment updated:", updated);
      setAppointments((prev) =>
        prev.map((a) => (a._id === updated._id ? updated : a))
      );
    };

    socket.on("newAppointment", handleNewAppointment);
    socket.on("appointment:updated", handleAppointmentUpdated);

    // Cleanup: remove listeners but don't disconnect (singleton manages lifecycle)
    return () => {
      socket.off("newAppointment", handleNewAppointment);
      socket.off("appointment:updated", handleAppointmentUpdated);
    };
  }, [user?.id, audioUnlocked]);

  const handleStartChatAndCreateAppointment = async () => {
    if (!isReady || !selectedUsers) {
      alert("Please select a user and a date/time first.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          withUserId: selectedUsers.map((u) => u.id),
          scheduledAt: startDate?.toISOString(),
        }),
      });

      if (!res.ok) throw new Error("Failed to create appointment");

      const newAppointment = await res.json();
      
      // ✅ Check for duplicates before adding
      setAppointments((prev) => {
        const exists = prev.some((a) => a._id === newAppointment._id);
        if (exists) return prev;
        return [...prev, newAppointment];
      });

      router.push(`/meeting/${newAppointment._id}`);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResponse = async (
    appointmentId: string,
    newStatus: "accepted" | "declined"
  ) => {
    try {
      const res = await fetch("/api/appointments", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId, status: newStatus }),
      });

      if (!res.ok) throw new Error("Failed to update appointment");

      const updated = await res.json();
      setAppointments((prev) =>
        prev.map((a) => (a._id === updated._id ? updated : a))
      );
    } catch (err) {
      console.error("Error updating appointment:", err);
    }
  };

  const getMinMaxTime = () => {
    if (!startDate) {
      return {
        minTime: new Date(),
        maxTime: new Date(new Date().setHours(23, 59, 59, 999)),
      };
    }

    const today = new Date();
    const selectedDay = new Date(startDate);

    const isToday =
      selectedDay.getDate() === today.getDate() &&
      selectedDay.getMonth() === today.getMonth() &&
      selectedDay.getFullYear() === today.getFullYear();

    if (isToday) {
      return {
        minTime: new Date(),
        maxTime: new Date(new Date().setHours(23, 59, 59, 999)),
      };
    } else {
      return {
        minTime: new Date(new Date().setHours(0, 0, 0, 0)),
        maxTime: new Date(new Date().setHours(23, 59, 59, 999)),
      };
    }
  };

  const { minTime, maxTime } = getMinMaxTime();

  const filteredUsers = users.filter((u) =>
    u.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="block bg-white font-sans">
      {isClient && !notificationsEnabled && (
        <div className="mt-5 ml-4 md:ml-16">
          <button
            onClick={() => {
              handleEnableNotifications();
              unlockAudio();
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl"
          >
            Enable Notifications & Sounds
          </button>
        </div>
      )}

      <div className="flex flex-col md:flex-row justify-around w-full mt-5 text-black font-semibold text-xs md:text-sm gap-3 px-4">
        <button
          className="w-full md:w-40 bg-black/90 border border-white/10 hover:border-white/20 transition-all duration-300 backdrop-blur-sm relative overflow-hidden rounded-lg p-2"
          onClick={() => setShowCalendar(!showCalendar)}
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-40 pointer-events-none"></div>
          <span className="relative z-10 text-white">Calendar</span>
        </button>

        <div className="w-full md:w-fit bg-black/90 border border-white/10 hover:border-white/20 transition-all duration-300 backdrop-blur-sm relative overflow-hidden rounded-lg p-2 text-center">
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-40 pointer-events-none"></div>
          <span className="relative z-10 text-white break-words">
            set time: {startDate ? startDate.toLocaleString() : "none"} with{" "}
            {selectedUsers.length
              ? selectedUsers.map((u) => u.name).join(", ")
              : "no one"}
          </span>
        </div>
      </div>

      <div className="mt-6 ml-4 md:ml-16 px-4 md:px-0">
        <div className="justify-items-center mr-0 md:mr-96 md:pr-96 mt-10">
          <div className="w-0 h-0 border-l-[10px] border-r-[10px] border-b-[10px] border-l-transparent border-r-transparent border-b-black"></div>
          <h2 className="font-light text-base md:text-xl uppercase text-center">
            click Calendar to pick a time
          </h2>
        </div>
        {showCalendar && (
          <div className="mt-4 ml-4 md:ml-16 flex justify-center md:justify-start">
            <DatePicker
              selected={startDate}
              onChange={(date) => setStartDate(date)}
              showTimeSelect
              minDate={new Date()}
              minTime={minTime}
              maxTime={maxTime}
              timeIntervals={1}
              placeholderText="Select date and time"
              dateFormat="Pp"
              inline
            />
          </div>
        )}
        <h2
          className="text-lg font-semibold cursor-pointer select-none"
          onClick={() => setShowAppointments((prev) => !prev)}
        >
          Your Appointments {showAppointments ? "▲" : "▼"}
        </h2>

        <div
          className={`max-h-52 overflow-scroll transition-all duration-500 ease-in-out ${
            showAppointments
              ? "max-h-[1000px] opacity-100"
              : "max-h-0 opacity-0"
          }`}
        >
          {appointments.map((a) => (
            <div key={a._id} className="border p-2 my-2 rounded-lg shadow">
              {a.scheduledAt ? (
                <>
                  📅 {new Date(a.scheduledAt).toLocaleDateString()} ⏰{" "}
                  {new Date(a.scheduledAt).toLocaleTimeString()}
                </>
              ) : (
                <>
                  📅 {a.date || "Unknown"} ⏰ {a.time || "Unknown"}
                </>
              )}
              <br />
              <b>Status:</b> {a.status} <br />
              <b>Created by:</b> {a.createdBy}
              {a.status === "pending" && a.withUserId?.includes(user?.id) && (
                <div className="flex gap-2 mt-2">
                  <button
                    className="bg-green-500 text-white px-3 py-1 rounded"
                    onClick={() => handleResponse(a._id, "accepted")}
                  >
                    Accept
                  </button>
                  <button
                    className="bg-red-500 text-white px-3 py-1 rounded"
                    onClick={() => handleResponse(a._id, "declined")}
                  >
                    Decline
                  </button>
                </div>
              )}
              {a.status === "accepted" && (
                <div className="mt-3">
                  <EnterRoomButton
                    currentUserId={user?.id!}
                    appointment={a}
                    router={router}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div
        className={`transition-all duration-500 ease-in-out w-full md:w-fit border-2 ${
          showUsers ? "h-auto" : "h-fit"
        } space-y-4 border-slate-600 rounded-2xl p-4 text-center flex flex-col items-center hover:border-white mt-10 justify-self-center self-center mx-4`}
      >
        <button
          onClick={handleFetchUsers}
          className="bg-black/90 border border-white/10 hover:border-white/20 transition-all duration-300 backdrop-blur-sm relative overflow-hidden text-white px-4 py-2 rounded-xl"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-40 pointer-events-none"></div>
          <span className="relative z-10">Choose whom to chat</span>
        </button>
        <button
          disabled={!isReady || loading}
          className={`mt-4 px-4 py-2 rounded text-white font-semibold ${
            isReady
              ? "bg-green-500 hover:bg-green-600"
              : "bg-gray-400 cursor-not-allowed"
          }`}
          onClick={handleStartChatAndCreateAppointment}
        >
          {loading ? "Creating..." : "Create Appointment"}
        </button>

        {showUsers && (
          <div className="mt-4 w-full">
            <h3 className="font-semibold text-lg mb-2">Search for a user:</h3>

            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
              className="border p-2 rounded w-full"
            />

            {isSearching && <p>Searching...</p>}

            {searchTerm && users.length > 0 && (
              <ul className="space-y-2 mt-2">
                {users.map((user) => (
                  <li key={user.id} className="text-left">
                    <button
                      className={`border p-2 rounded w-full ${
                        selectedUsers.some((u) => u.id === user.id)
                          ? "bg-black/90 border border-white/10 hover:border-white/20 transition-all duration-300 backdrop-blur-sm relative overflow-hidden text-white"
                          : "bg-gray-100 hover:bg-black hover:text-white"
                      }`}
                      onClick={() =>
                        setSelectedUsers((prev) =>
                          prev.some((u) => u.id === user.id)
                            ? prev.filter((u) => u.id !== user.id)
                            : [...prev, user]
                        )
                      }
                    >
                      {selectedUsers.some((u) => u.id === user.id) && (
                        <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-40 pointer-events-none"></div>
                      )}
                      <span className="relative z-10">
                        <strong>{user.name}</strong>{" "}
                        <span className="text-gray-400 text-sm">
                          ({user.email})
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {searchTerm && users.length === 0 && !isSearching && (
              <p className="text-gray-500 italic mt-2">No users found</p>
            )}
          </div>
        )}
      </div>
      <footer className="fixed select-none bottom-0 right-0 text-gray-400">
        <p>
          @ 2025 Shadmanov. All Rights Reserved.
        </p>
      </footer>
    </div>   
  );
}

function EnterRoomButton({ appointment, router }: any) {
  const [status, setStatus] = React.useState<{
    allowed: boolean;
    reason?: string;
  }>({ allowed: false });

  React.useEffect(() => {
    if (!appointment?._id) {
      console.warn("No appointment ID provided");
      return;
    }

    let interval: NodeJS.Timeout | null = null;
    let isMounted = true;

    async function check() {
      if (!isMounted) return;

      try {
        const res = await canEnterRoom(appointment._id);
        if (isMounted) {
          setStatus(res);
        }
      } catch (err) {
        console.error("Error checking room:", err);
        if (isMounted) {
          setStatus({ allowed: false, reason: "Error checking room" });
        }
      }
    }

    check();
    interval = setInterval(check, 3000);

    return () => {
      isMounted = false;
      if (interval) clearInterval(interval);
    };
  }, [appointment?._id]);

  return (
    <div className="flex flex-col gap-2">
      <button
        disabled={!status.allowed}
        onClick={() => {
          if (status.allowed && appointment?._id) {
            router.push(`/meeting/${appointment._id}`);
          }
        }}
        className={`px-4 py-2 rounded text-white font-semibold ${
          status.allowed
            ? "bg-green-600 hover:bg-green-700"
            : "bg-gray-400 cursor-not-allowed"
        }`}
      >
        {status.allowed ? "Enter Room" : "Enter Room (Locked)"}
      </button>

      {!status.allowed && status.reason && (
        <p className="text-sm text-red-500">{status.reason}</p>
      )}
    </div>
    
  );
}