"use client";

import DatePicker from "react-datepicker";
import React, { useEffect, useState, useRef } from "react";
import "react-datepicker/dist/react-datepicker.css";
import { useRouter } from "next/navigation";
import { canEnterRoom } from "../utils/roomApi";
import { useSession } from "next-auth/react";
import { socketManager } from "../utils/socketClient";
import { useLocale } from "../components/provider/locale-provider";
import {
  Calendar,
  Clock,
  Users,
  Bell,
  Search,
  Plus,
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Video,
  AlertCircle,
} from "lucide-react";

type UserType = {
  id: string;
  email: string;
  name: string;
};

export default function FirstPage() {
  const [showAppointments, setShowAppointments] = useState(true);
  const [showUsers, setShowUsers] = useState(false);
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [timeError, setTimeError] = useState<string>("");
  const { data: session } = useSession();
  const user = session?.user as UserType | undefined;
  const isSignedIn = !!session?.user;

  const [users, setUsers] = useState<UserType[]>([]);
  const [error, setError] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<UserType[]>([]);
  const isReady = selectedUsers.length > 0 && startDate && !timeError;
  const router = useRouter();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [isClient, setIsClient] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const publicKey = process.env.NEXT_PUBLIC_PUBLIC_KEY;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { locale } = useLocale();

  // Validate selected time
  const validateTime = (date: Date | null) => {
    if (!date) {
      setTimeError("");
      return;
    }

    const now = new Date();
    const selectedTime = new Date(date);

    if (selectedTime <= now) {
      setTimeError(
        locale === "ru"
          ? "⚠️ Нельзя выбрать прошедшее время. Пожалуйста, выберите время в будущем."
          : "⚠️ Cannot select past time. Please choose a future time.",
      );
    } else {
      setTimeError("");
    }
  };

  const handleDateChange = (date: Date | null) => {
    setStartDate(date);
    validateTime(date);
  };

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
        `/api/get-users?search=${encodeURIComponent(query)}`,
      );
      if (!res.ok) throw new Error("Failed to search users");

      const data: UserType[] = await res.json();
      setUsers(data.length > 0 ? data : []);
    } catch (err) {
      console.error("Search error:", err);
      setUsers([]);
    } finally {
      setIsSearching(false);
    }
  };

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

  const handleEnableNotifications = async () => {
    if (!("Notification" in window)) {
      alert("This browser does not support notifications.");
      return;
    }

    if (!user?.id) {
      alert("You must be logged in to enable notifications");
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        alert("Notification permission denied");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;

      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey || ""),
        });
      }

      const backendUrl =
        process.env.NEXT_PUBLIC_API_URL || "https://shadmanov.onrender.com";
      const response = await fetch(
        `${backendUrl}/api/subscribe-notifications`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ subscription, userId: user.id }),
        },
      );

      if (!response.ok) throw new Error("Failed to save subscription");

      setNotificationsEnabled(true);
      setAudioUnlocked(true);
      alert("Notifications enabled! 🎉");
      audioRef.current?.play().catch(() => {});
    } catch (error: unknown) {
      console.error("❌ Error enabling notifications:", error);
      alert(
        `Failed to enable notifications: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
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

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotificationsEnabled(Notification.permission === "granted");
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    const fetchAppointments = async () => {
      try {
        const res = await fetch("/api/appointments", {
          method: "GET",
          credentials: "include",
        });
        if (!res.ok) throw new Error("Failed to fetch appointments");
        const data = await res.json();
        setAppointments(data);
      } catch (err) {
        console.error("Error fetching appointments:", err);
      }
    };

    fetchAppointments();
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;

    const socket = socketManager.connect(
      user.id,
      process.env.NEXT_PUBLIC_SOCKET_SERVER_URL ||
        "https://shadmanov-socket.onrender.com",
    );

    const handleNewAppointment = (appointment: any) => {
      setAppointments((prev) => {
        if (prev.some((a) => a._id === appointment._id)) return prev;

        const formatted = {
          _id: appointment._id,
          scheduledAt: appointment.scheduledAt,
          status: appointment.status || "pending",
          createdBy: {
            _id: appointment.createdBy,
            name: appointment.createdByName || "Unknown",
          },
          withUserId:
            appointment.withUserId?.map((uid: string, i: number) => ({
              _id: uid,
              name: appointment.withUserNames?.[i] || "Unknown",
            })) || [],
        };

        return [...prev, formatted];
      });

      if (audioUnlocked && audioRef.current) {
        audioRef.current.play().catch(() => {});
      }

      if (Notification.permission === "granted") {
        new Notification("New Appointment", {
          body: `${appointment.createdByName || "Someone"} scheduled for ${new Date(appointment.scheduledAt).toLocaleString()}`,
          icon: "/favicon.avif",
        });
      }
    };

    const handleAppointmentUpdated = (updated: any) => {
      setAppointments((prev) =>
        prev.map((a) => (a._id === updated._id ? { ...a, ...updated } : a)),
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
    if (!isReady) {
      if (timeError) {
        alert(timeError);
      } else {
        alert("Please select users and time first.");
      }
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

      setAppointments((prev) => {
        if (prev.some((a) => a._id === newAppointment._id)) return prev;
        return [...prev, newAppointment];
      });

      router.push(`/meeting/${newAppointment._id}`);
    } catch (err: any) {
      console.error("Error:", err);
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResponse = async (
    appointmentId: string,
    newStatus: "accepted" | "declined",
  ) => {
    try {
      const res = await fetch("/api/appointments", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId, status: newStatus }),
      });

      if (!res.ok) throw new Error("Failed to update");

      const updated = await res.json();
      setAppointments((prev) =>
        prev.map((a) => (a._id === updated._id ? updated : a)),
      );
    } catch (err) {
      console.error("Error:", err);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            {locale === "ru" ? "Планировщик встреч" : "Meeting Scheduler"}
          </h1>

          {isClient && !notificationsEnabled && (
            <button
              onClick={() => {
                handleEnableNotifications();
                unlockAudio();
              }}
              className="flex items-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-4 py-2 rounded-xl hover:shadow-lg transition-all duration-300"
            >
              <Bell className="w-4 h-4" />
              {locale === "ru"
                ? "Включить уведомления"
                : "Enable Notifications"}
            </button>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Create Meeting Card */}
        <div className="bg-white rounded-2xl shadow-xl border-2 border-indigo-100 p-6 mb-8">
          <h2 className="text-xl font-semibold text-gray-800 mb-6 flex items-center gap-2">
            <Plus className="w-5 h-5 text-indigo-600" />
            {locale === "ru" ? "Создать новую встречу" : "Create New Meeting"}
          </h2>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Date/Time Section */}
            <div>
              <button
                onClick={() => setShowCalendar(!showCalendar)}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl hover:shadow-lg transition-all duration-300 mb-4"
              >
                <Calendar className="w-5 h-5" />
                {locale === "ru" ? "Выбрать время" : "Select Time"}
              </button>

              {showCalendar && (
                <div className="border-2 border-indigo-100 rounded-xl p-4 bg-gray-50">
                  <DatePicker
                    selected={startDate}
                    onChange={handleDateChange}
                    showTimeSelect
                    minDate={new Date()}
                    minTime={
                      startDate &&
                      startDate.toDateString() === new Date().toDateString()
                        ? new Date()
                        : new Date(new Date().setHours(0, 0, 0, 0))
                    }
                    maxTime={new Date(new Date().setHours(23, 59, 59, 999))}
                    timeIntervals={1}
                    dateFormat="Pp"
                    inline
                    className="w-full"
                  />
                </div>
              )}

              {/* Time Error Message */}
              {timeError && (
                <div className="mt-4 p-4 bg-red-50 border-2 border-red-200 rounded-xl">
                  <div className="flex items-center gap-2 text-red-700">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <p className="text-sm font-medium">{timeError}</p>
                  </div>
                </div>
              )}

              {/* Selected Time Display */}
              {startDate && !timeError && (
                <div className="mt-4 p-4 bg-indigo-50 rounded-xl border-2 border-indigo-200">
                  <div className="flex items-center gap-2 text-indigo-700 font-medium">
                    <Clock className="w-5 h-5" />
                    {startDate.toLocaleString()}
                  </div>
                </div>
              )}
            </div>

            {/* Users Section */}
            <div>
              <button
                onClick={() => setShowUsers(!showUsers)}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white px-6 py-3 rounded-xl hover:shadow-lg transition-all duration-300 mb-4"
              >
                <Users className="w-5 h-5" />
                {locale === "ru" ? "Выбрать участников" : "Select Participants"}
              </button>

              {showUsers && (
                <div className="border-2 border-purple-100 rounded-xl p-4 bg-gray-50">
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      placeholder={
                        locale === "ru"
                          ? "Поиск пользователей..."
                          : "Search users..."
                      }
                      value={searchTerm}
                      onChange={(e) => handleSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border-2 border-gray-200 rounded-lg focus:border-purple-500 focus:outline-none"
                    />
                  </div>

                  {isSearching && (
                    <div className="text-center py-4 text-gray-500">
                      {locale === "ru" ? "Поиск..." : "Searching..."}
                    </div>
                  )}

                  {searchTerm && users.length > 0 && (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {users.map((u) => (
                        <button
                          key={u.id}
                          onClick={() =>
                            setSelectedUsers((prev) =>
                              prev.some((p) => p.id === u.id)
                                ? prev.filter((p) => p.id !== u.id)
                                : [...prev, u],
                            )
                          }
                          className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all ${
                            selectedUsers.some((p) => p.id === u.id)
                              ? "bg-purple-100 border-purple-500"
                              : "bg-white border-gray-200 hover:border-purple-300"
                          }`}
                        >
                          <span className="font-medium">{u.name}</span>
                          {selectedUsers.some((p) => p.id === u.id) && (
                            <Check className="w-5 h-5 text-purple-600" />
                          )}
                        </button>
                      ))}
                    </div>
                  )}

                  {searchTerm && users.length === 0 && !isSearching && (
                    <p className="text-center text-gray-500 py-4">
                      {locale === "ru"
                        ? "Пользователи не найдены"
                        : "No users found"}
                    </p>
                  )}
                </div>
              )}

              {selectedUsers.length > 0 && (
                <div className="mt-4 p-4 bg-purple-50 rounded-xl border-2 border-purple-200">
                  <div className="flex items-center gap-2 text-purple-700 font-medium mb-2">
                    <Users className="w-5 h-5" />
                    {locale === "ru" ? "Выбрано участников:" : "Selected:"}{" "}
                    {selectedUsers.length}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedUsers.map((u) => (
                      <span
                        key={u.id}
                        className="bg-white px-3 py-1 rounded-full text-sm border border-purple-300"
                      >
                        {u.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <button
            disabled={!isReady || loading}
            onClick={handleStartChatAndCreateAppointment}
            className={`w-full mt-6 py-4 rounded-xl font-semibold text-white transition-all duration-300 ${
              isReady
                ? "bg-gradient-to-r from-green-500 to-emerald-600 hover:shadow-lg hover:scale-[1.02]"
                : "bg-gray-300 cursor-not-allowed"
            }`}
          >
            {loading
              ? locale === "ru"
                ? "Создание..."
                : "Creating..."
              : locale === "ru"
                ? "Создать встречу"
                : "Create Meeting"}
          </button>
        </div>

        {/* Appointments List */}
        <div className="bg-white rounded-2xl shadow-xl border-2 border-indigo-100 p-6">
          <button
            onClick={() => setShowAppointments(!showAppointments)}
            className="w-full flex items-center justify-between mb-4"
          >
            <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
              <Video className="w-5 h-5 text-indigo-600" />
              {locale === "ru" ? "Мои встречи" : "My Appointments"} (
              {appointments.length})
            </h2>
            {showAppointments ? (
              <ChevronUp className="w-5 h-5" />
            ) : (
              <ChevronDown className="w-5 h-5" />
            )}
          </button>

          {showAppointments && (
            <div className="space-y-4">
              {appointments.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Calendar className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                  <p>
                    {locale === "ru"
                      ? "У вас пока нет встреч"
                      : "No appointments yet"}
                  </p>
                </div>
              ) : (
                appointments.map((a) => (
                  <div
                    key={a._id}
                    className="border-2 border-gray-200 rounded-xl p-4 hover:border-indigo-300 transition-all"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2 text-gray-700 font-medium mb-1">
                          <Calendar className="w-4 h-4" />
                          {new Date(a.scheduledAt).toLocaleDateString()}
                          <Clock className="w-4 h-4 ml-2" />
                          {new Date(a.scheduledAt).toLocaleTimeString()}
                        </div>
                        <div className="text-sm text-gray-600">
                          <strong>
                            {locale === "ru" ? "Создано:" : "By:"}
                          </strong>{" "}
                          {a.createdBy?.name || "Unknown"}
                        </div>
                      </div>
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${
                          a.status === "accepted"
                            ? "bg-green-100 text-green-700"
                            : a.status === "declined"
                              ? "bg-red-100 text-red-700"
                              : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {a.status}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-3">
                      <Users className="w-4 h-4" />
                      {a.withUserId?.map((u: any) => u.name).join(", ")}
                    </div>

                    {a.status === "pending" &&
                      a.withUserId?.some((u: any) => u._id === user?.id) && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleResponse(a._id, "accepted")}
                            className="flex-1 bg-green-500 text-white py-2 rounded-lg hover:bg-green-600 transition-colors"
                          >
                            <Check className="w-4 h-4 inline mr-1" />
                            {locale === "ru" ? "Принять" : "Accept"}
                          </button>
                          <button
                            onClick={() => handleResponse(a._id, "declined")}
                            className="flex-1 bg-red-500 text-white py-2 rounded-lg hover:bg-red-600 transition-colors"
                          >
                            <X className="w-4 h-4 inline mr-1" />
                            {locale === "ru" ? "Отклонить" : "Decline"}
                          </button>
                        </div>
                      )}

                    {a.status === "accepted" && (
                      <EnterRoomButton
                        appointment={a}
                        router={router}
                        locale={locale}
                      />
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
      <footer className="text-center">
        <p className="text-sm text-slate-500">
          {locale === "ru"
            ? "© 2026 СумМит. Все права защищены."
            : "© 2026 SumMeet. All rights reserved."}
        </p>
      </footer>
    </div>
  );
}

function EnterRoomButton({ appointment, router, locale }: any) {
  const [status, setStatus] = React.useState<{
    allowed: boolean;
    reason?: string;
  }>({ allowed: false });

  React.useEffect(() => {
    if (!appointment?._id) return;

    let interval: NodeJS.Timeout | null = null;
    let isMounted = true;

    async function check() {
      if (!isMounted) return;
      try {
        const res = await canEnterRoom(appointment._id);
        if (isMounted) setStatus(res);
      } catch (err) {
        if (isMounted) setStatus({ allowed: false, reason: "Error" });
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
    <div>
      <button
        disabled={!status.allowed}
        onClick={() =>
          status.allowed && router.push(`/meeting/${appointment._id}`)
        }
        className={`w-full py-3 rounded-lg font-semibold transition-all ${
          status.allowed
            ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:shadow-lg"
            : "bg-gray-300 text-gray-500 cursor-not-allowed"
        }`}
      >
        <Video className="w-4 h-4 inline mr-2" />
        {status.allowed
          ? locale === "ru"
            ? "Войти в комнату"
            : "Enter Room"
          : locale === "ru"
            ? "Ожидание..."
            : "Waiting..."}
      </button>
      {!status.allowed && status.reason && (
        <p className="text-xs text-red-500 mt-2 text-center">{status.reason}</p>
      )}
    </div>
  );
}
