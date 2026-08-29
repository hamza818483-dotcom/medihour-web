import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bell } from "lucide-react";
import { useNotification } from "@/contexts/NotificationContext";

const DISMISS_KEY = "medihour_push_prompt_dismissed_v1";

// Shows a small custom dialog once per login session asking the user to enable
// notifications. Clicking "Allow" triggers the real browser permission popup —
// browsers require that user gesture, it can't be skipped. Once granted (or
// explicitly dismissed), this never asks again on this device.
export const PushPermissionPrompt = () => {
  const { permission, requestPermission } = useNotification();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!("Notification" in window)) return;
    if (permission !== "default") return;
    if (localStorage.getItem(DISMISS_KEY)) return;
    const t = setTimeout(() => setOpen(true), 1500);
    return () => clearTimeout(t);
  }, [permission]);

  const handleAllow = async () => {
    setOpen(false);
    await requestPermission();
    localStorage.setItem(DISMISS_KEY, "1");
  };

  const handleDismiss = () => {
    setOpen(false);
    localStorage.setItem(DISMISS_KEY, "1");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleDismiss(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="mx-auto mb-2 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Bell className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-center">নোটিফিকেশন চালু করুন</DialogTitle>
          <DialogDescription className="text-center">
            গুরুত্বপূর্ণ নোটিস, ক্লাস ও এক্সাম আপডেট সরাসরি আপনার ফোনে পেতে Allow করুন।
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button className="w-full" onClick={handleAllow}>Allow করুন</Button>
          <Button variant="ghost" className="w-full" onClick={handleDismiss}>এখন না</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
