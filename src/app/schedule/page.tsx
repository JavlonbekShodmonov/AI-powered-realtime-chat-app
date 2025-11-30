"use client";

import DatePicker from "react-datepicker";
import React, { useEffect, useState, useRef } from "react";
import "react-datepicker/dist/react-datepicker.css";
import { useRouter } from "next/navigation";
import { canEnterRoom } from "../utils/roomApi";
import { useSession } from "next-auth/react";
import { socketManager } from "../utils/socketClient";

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
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const publicKey = process.env.NEXT_PUBLIC_PUBLIC_KEY;
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

      // Check if service worker is registered
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker.getRegistration().then((reg) => {
          if (reg) {
            console.log("✅ Service worker already registered:", reg.scope);
          } else {
            console.log("⚠️ No service worker registered yet");
          }
        });
      }
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

  // ✅ FIXED: Proper notification setup with subscription
  const handleEnableNotifications = async () => {
    if (!("Notification" in window)) {
      alert("This browser does not support notifications.");
      return;
    }

    if (!("serviceWorker" in navigator)) {
      alert("This browser does not support service workers.");
      return;
    }

    if (!user?.id) {
      alert("You must be logged in to enable notifications");
      return;
    }

    try {
      // Request notification permission
      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        alert("Notification permission denied");
        return;
      }

      console.log("🔔 Permission granted, registering service worker...");

      // Register service worker
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      console.log("✅ Service worker registered");

      // Check if already subscribed
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        console.log("📝 Creating new push subscription...");
        // Subscribe to push notifications
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey || ""),
        });
        console.log("✅ Subscription created:", subscription);
      } else {
        console.log("✅ Using existing subscription");
      }

      // ✅ CRITICAL: Send to YOUR backend, not the socket server
      const backendUrl =
        process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
      const response = await fetch(
        `${backendUrl}/api/subscribe-notifications`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({
            subscription,
            userId: user.id,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to save subscription: ${error}`);
      }

      const result = await response.json();
      console.log("✅ Subscription saved to backend:", result);

      setNotificationsEnabled(true);
      setAudioUnlocked(true);
      alert("Notifications enabled! 🎉");

      // Play test sound
      audioRef.current?.play().catch(() => {});
    } catch (error: unknown) {
      console.error("❌ Error enabling notifications:", error);
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "string"
          ? error
          : JSON.stringify(error);
      alert(`Failed to enable notifications: ${message}`);
    }
  };

  function urlBase64ToUint8Array(base64String: string) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding)
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
  }

  // ✅ Check notification permission on mount
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      const isEnabled = Notification.permission === "granted";
      setNotificationsEnabled(isEnabled);
      console.log(`🔔 Notification permission: ${Notification.permission}`);

      if (isEnabled) {
        // Check if we have a subscription
        if ("serviceWorker" in navigator) {
          navigator.serviceWorker.ready.then(async (reg) => {
            const subscription = await reg.pushManager.getSubscription();
            if (subscription) {
              console.log("✅ Push subscription exists");
            } else {
              console.log(
                "⚠️ Notification permission granted but no push subscription"
              );
            }
          });
        }
      }
    }
  }, []);

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

    const socket = socketManager.connect(
      user.id,
      process.env.NEXT_PUBLIC_SOCKET_SERVER_URL ||
        "https://shadmanov-socket.onrender.com"
    );

    // Set up event listeners
    const handleNewAppointment = (appointment: any) => {
      console.log("📅 New appointment received:", appointment);
      console.log("   🔔 Notification permission:", Notification.permission);
      console.log("   🔊 Audio unlocked:", audioUnlocked);

      setAppointments((prev) => {
        const exists = prev.some((a) => a._id === appointment._id);
        if (exists) {
          console.log("⚠️ Appointment already exists, skipping duplicate");
          return prev;
        }
        console.log("✅ Adding new appointment to list");
        return [...prev, appointment];
      });

      // Play sound
      if (audioUnlocked && audioRef.current) {
        console.log("🔊 Playing notification sound");
        audioRef.current.play().catch((e) => {
          console.error("❌ Failed to play sound:", e);
        });
      } else {
        console.log("⚠️ Audio not unlocked, skipping sound");
      }

      // ✅ Show browser notification (this is for display, push notifications come from server)
      if (Notification.permission === "granted") {
        console.log("🔔 Showing browser notification");
        try {
          new Notification("New Appointment", {
            body: `Appointment on ${new Date(
              appointment.scheduledAt
            ).toLocaleString()}`,
            icon: "/favicon.avif",
            tag: appointment._id,
          });
        } catch (e) {
          console.error("❌ Failed to show notification:", e);
        }
      } else {
        console.log("⚠️ No notification permission, skipping notification");
      }
    };

    const handleAppointmentUpdated = (updated: any) => {
      console.log("📝 Appointment updated:", updated);
      setAppointments((prev) =>
        prev.map((a) => {
          if (a._id === updated._id) {
            // Merge the update with existing data to preserve populated fields
            return {
              ...a,
              ...updated,
              // Preserve createdBy if it's already populated
              createdBy: updated.createdBy || a.createdBy,
              createdByName: updated.createdByName || a.createdByName,
            };
          }
          return a;
        })
      );
    };

    socket.on("newAppointment", handleNewAppointment);
    socket.on("appointment:updated", handleAppointmentUpdated);

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
      console.log("🚀 Creating appointment...");
      console.log(
        "   Selected users:",
        selectedUsers.map((u) => u.name)
      );
      console.log("   Scheduled at:", startDate?.toISOString());

      const res = await fetch("/api/appointments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          withUserId: selectedUsers.map((u) => u.id),
          scheduledAt: startDate?.toISOString(),
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        console.error("❌ Failed to create appointment:", errorText);
        throw new Error("Failed to create appointment: " + errorText);
      }

      const newAppointment = await res.json();
      console.log("✅ Appointment created:", newAppointment);

      // ✅ Check for duplicates before adding
      setAppointments((prev) => {
        const exists = prev.some((a) => a._id === newAppointment._id);
        if (exists) {
          console.log("⚠️ Appointment already in list");
          return prev;
        }
        console.log("✅ Adding appointment to local list");
        return [...prev, newAppointment];
      });

      router.push(`/meeting/${newAppointment._id}`);
    } catch (err: any) {
      console.error("❌ Error creating appointment:", err);
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
      {isClient && (
        <div className="mt-5 ml-4 md:ml-16 flex gap-3">
          {!notificationsEnabled && (
            <button
              onClick={() => {
                handleEnableNotifications();
                unlockAudio();
              }}
              className="bg-blue-600 text-white px-4 py-2 rounded-xl"
            >
              Enable Notifications & Sounds
            </button>
          )}
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
          {appointments.map((a) => {
            // Extract creator name from populated data or string
            const creatorName =
              a.createdBy?.name ||
              a.createdBy?.username ||
              a.createdBy?.email ||
              "Unknown";
            const participants =
              a.withUserId?.map((u: any) => u.name || u.username || u.email) ||
              [];
            return (
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
                <b>Created by:</b> {creatorName} <br />
                <b>Participants: {participants.join(",")}</b>
                {a.status === "pending" &&
                  a.withUserId?.some(
                    (u: any) => u.id === user?.id || u._id === user?.id
                  ) && (
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
            );
          })}
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
        <p>@ 2025 Shadmanov. All Rights Reserved.</p>
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
