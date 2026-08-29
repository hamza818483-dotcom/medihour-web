import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface NotificationContextType {
  requestPermission: () => Promise<void>;
  sendNotification: (title: string, options?: NotificationOptions) => void;
  permission: NotificationPermission;
  isSubscribed: boolean;
  disablePush: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

// Public VAPID key — safe to expose client-side, pairs with the private key held by the worker.
const VAPID_PUBLIC_KEY = "BFL06Cf7jFt5fQNITBDHxr88SIMgus-wtrmabfxZ95QgNlPbmkDH5CV7S5CgzgR99G3NqXFncBN8WpRaXmaOzkE";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

// Subscribes the current device to Web Push and saves the subscription against
// the logged-in user, so admin notices can reach this device even when the
// site/tab is closed. Silently no-ops if push isn't supported (e.g. iOS Safari
// not installed as a home-screen app) or the user isn't logged in.
async function subscribeToPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;
    // Fire-and-forget the DB write — the browser subscription itself is what
    // the UI's checked-state depends on, so we don't need to block the
    // toggle on this network round-trip finishing.
    supabase.from("push_subscriptions").upsert(
      {
        user_id: user.id,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      },
      { onConflict: "endpoint" }
    ).then(({ error }) => {
      if (error) console.error("Push subscription DB save failed:", error);
    });
  } catch (error) {
    console.error("Push subscription failed:", error);
  }
}

// Removes this device's push subscription — both from the browser and from
// the database — so the user stops receiving push notifications. Browsers
// don't let a page revoke Notification permission itself, so this is the
// practical "turn off" switch: no subscription, no more push delivery.
async function unsubscribeFromPush() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    const endpoint = subscription.endpoint;
    await subscription.unsubscribe();
    // Fire-and-forget — the browser-side unsubscribe is what the UI's
    // checked-state depends on.
    supabase.from("push_subscriptions").delete().eq("endpoint", endpoint).then(({ error }) => {
      if (error) console.error("Push subscription DB delete failed:", error);
    });
  } catch (error) {
    console.error("Push unsubscribe failed:", error);
  }
}

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const { toast } = useToast();

  const refreshSubscriptionState = useCallback(async () => {
    if (!("serviceWorker" in navigator)) return;
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const sub = await registration?.pushManager.getSubscription();
      setIsSubscribed(!!sub);
    } catch {
      setIsSubscribed(false);
    }
  }, []);

  useEffect(() => {
    if ("Notification" in window) {
      setPermission(Notification.permission);
      if (Notification.permission === "granted") {
        subscribeToPush().then(refreshSubscriptionState);
      } else {
        refreshSubscriptionState();
      }
    }
  }, [refreshSubscriptionState]);

  const requestPermission = useCallback(async () => {
    if (!("Notification" in window)) {
      console.log("This browser does not support desktop notification");
      return;
    }
    try {
      const p = await Notification.requestPermission();
      setPermission(p);
      if (p === 'granted') {
          toast({ title: "Notifications enabled" });
          await subscribeToPush();
          await refreshSubscriptionState();
      }
    } catch (error) {
      console.error("Error requesting notification permission:", error);
    }
  }, [toast, refreshSubscriptionState]);

  const disablePush = useCallback(async () => {
    await unsubscribeFromPush();
    await refreshSubscriptionState();
    toast({ title: "Notifications বন্ধ করা হয়েছে" });
  }, [toast, refreshSubscriptionState]);

  const sendNotification = useCallback((title: string, options?: NotificationOptions) => {
    if (permission === "granted") {
      new Notification(title, {
          icon: "/favicon.png", // Assuming a favicon exists, or use a logo URL
          ...options
      });
    } else {
        // Fallback to toast if permission not granted
        toast({ title: title, description: options?.body });
    }
  }, [permission, toast]);

  return (
    <NotificationContext.Provider value={{ requestPermission, sendNotification, permission, isSubscribed, disablePush }}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error("useNotification must be used within a NotificationProvider");
  }
  return context;
};
