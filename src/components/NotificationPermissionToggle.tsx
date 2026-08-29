import { useState } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Bell, Loader2 } from "lucide-react";
import { useNotification } from "@/contexts/NotificationContext";

// Lets the student turn push notifications on/off for their own device,
// right on the Announcements page. "On" requests browser permission (and
// subscribes); "off" unsubscribes this device so no more push arrives here.
// If the browser permission itself is denied at the OS/browser level, we
// can't re-request it from JS — the switch stays off and a short hint
// explains they need to allow it from browser settings.
export const NotificationPermissionToggle = () => {
  const { permission, isSubscribed, requestPermission, disablePush } = useNotification();
  const [pending, setPending] = useState(false);
  // Optimistic value shown immediately on tap, before the async subscribe/
  // unsubscribe round-trip (browser permission prompt + network + DB write)
  // finishes — otherwise the switch looks unresponsive for a second or two.
  const [optimistic, setOptimistic] = useState<boolean | null>(null);

  if (!("Notification" in window)) return null;

  const actualChecked = permission === "granted" && isSubscribed;
  const checked = optimistic !== null ? optimistic : actualChecked;
  const blocked = permission === "denied";

  const handleChange = async (next: boolean) => {
    setOptimistic(next);
    setPending(true);
    try {
      if (next) {
        await requestPermission();
      } else {
        await disablePush();
      }
    } finally {
      setPending(false);
      setOptimistic(null);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1 shrink-0">
      <div className="flex items-center gap-2 rounded-full border bg-background px-3 py-1.5">
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
        ) : (
          <Bell className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <Label htmlFor="push-toggle" className="text-xs text-muted-foreground cursor-pointer">
          নোটিফিকেশন
        </Label>
        <Switch id="push-toggle" checked={checked} onCheckedChange={handleChange} disabled={blocked || pending} />
      </div>
      {blocked && (
        <span className="text-[10px] text-muted-foreground max-w-[160px] text-right">
          ব্রাউজার সেটিংস থেকে Allow করুন
        </span>
      )}
    </div>
  );
};
