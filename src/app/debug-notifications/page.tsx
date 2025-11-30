"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";

type UserType = {
  id: string;
  email: string;
  name: string;
};

export default function DebugNotifications() {
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<any>({});
  const { data: session } = useSession();
  const user = session?.user as UserType | undefined;

  const addLog = (message: string) => {
    setLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${message}`]);
    console.log(message);
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    const checks: any = {
      hasNotificationAPI: 'Notification' in window,
      hasServiceWorker: 'serviceWorker' in navigator,
      notificationPermission: Notification?.permission || 'N/A',
      userId: user?.id || 'Not logged in',
    };

    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      checks.serviceWorkerRegistered = !!reg;
      
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        checks.hasPushSubscription = !!sub;
        if (sub) {
          checks.subscriptionEndpoint = sub.endpoint.substring(0, 50) + '...';
        }
      }
    }

    setStatus(checks);
    addLog('Status check completed');
  };

  const registerServiceWorker = async () => {
    try {
      addLog('Registering service worker...');
      const reg = await navigator.serviceWorker.register('/sw.js');
      addLog('✅ Service worker registered: ' + reg.scope);
      await checkStatus();
    } catch (err: any) {
      addLog('❌ Service worker registration failed: ' + err.message);
    }
  };

  const requestPermission = async () => {
    try {
      addLog('Requesting notification permission...');
      const permission = await Notification.requestPermission();
      addLog(`Permission result: ${permission}`);
      await checkStatus();
    } catch (err: any) {
      addLog('❌ Permission request failed: ' + err.message);
    }
  };

  const subscribeToPush = async () => {
    try {
      addLog('Subscribing to push notifications...');
      
      const reg = await navigator.serviceWorker.ready;
      addLog('Service worker ready');

      const publicKey = process.env.NEXT_PUBLIC_PUBLIC_KEY;
      if (!publicKey) {
        addLog('❌ No VAPID public key found');
        return;
      }

      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      addLog('✅ Push subscription created');
      addLog('Endpoint: ' + subscription.endpoint.substring(0, 50) + '...');

      // Send to backend
      addLog('Sending subscription to backend...');
      const response = await fetch('/api/subscribe-notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          subscription,
          userId: user?.id,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        addLog('✅ Subscription saved: ' + JSON.stringify(result));
      } else {
        const error = await response.text();
        addLog('❌ Failed to save subscription: ' + error);
      }

      await checkStatus();
    } catch (err: any) {
      addLog('❌ Push subscription failed: ' + err.message);
    }
  };



  const showLocalNotification = () => {
    if (Notification.permission === 'granted') {
      addLog('Showing local notification...');
      new Notification('Test Notification', {
        body: 'This is a test notification',
        icon: '/favicon.avif',
      });
      addLog('✅ Local notification shown');
    } else {
      addLog('❌ No notification permission');
    }
  };

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">🔔 Notification Debug Panel</h1>

      <div className="bg-gray-100 p-4 rounded-lg mb-6">
        <h2 className="text-xl font-semibold mb-3">Status</h2>
        <pre className="text-sm overflow-auto">
          {JSON.stringify(status, null, 2)}
        </pre>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <button
          onClick={registerServiceWorker}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          1. Register Service Worker
        </button>

        <button
          onClick={requestPermission}
          className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
        >
          2. Request Permission
        </button>

        <button
          onClick={subscribeToPush}
          className="bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600"
        >
          3. Subscribe to Push
        </button>

        <button
          onClick={showLocalNotification}
          className="bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600"
        >
          4. Test Local Notification
        </button>

        <button
          onClick={checkStatus}
          className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
        >
          🔄 Refresh Status
        </button>
      </div>

      <div className="bg-black text-green-400 p-4 rounded-lg font-mono text-sm">
        <h2 className="text-lg font-semibold mb-2">Console Logs:</h2>
        <div className="max-h-96 overflow-auto">
          {logs.map((log, i) => (
            <div key={i} className="mb-1">{log}</div>
          ))}
        </div>
      </div>
    </div>
  );
}