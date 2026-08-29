import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { MessageCircleWarning } from "lucide-react";

// Shows a popup alert for unread "report_reply" notifications (admin feedback on
// a reported MCQ). Re-prompts every ~12 minutes while the user is active on the
// site, until the user opens Announcements (which marks them read) or clicks "দেখুন".
const CHECK_INTERVAL_MS = 12 * 60 * 1000;

export const ReportFeedbackAlert = () => {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [pendingCount, setPendingCount] = useState(0);
  const [open, setOpen] = useState(false);
  const lastActivityRef = useRef(Date.now());

  useEffect(() => {
    const markActive = () => {
      lastActivityRef.current = Date.now();
    };
    window.addEventListener("mousemove", markActive);
    window.addEventListener("keydown", markActive);
    window.addEventListener("click", markActive);
    window.addEventListener("touchstart", markActive);
    return () => {
      window.removeEventListener("mousemove", markActive);
      window.removeEventListener("keydown", markActive);
      window.removeEventListener("click", markActive);
      window.removeEventListener("touchstart", markActive);
    };
  }, []);

  useEffect(() => {
    if (!profile) return;

    const checkUnread = async () => {
      // Only pop up while the tab is visible and the user has interacted
      // recently — avoids nagging an idle/inactive tab.
      const isActive = document.visibilityState === "visible" && Date.now() - lastActivityRef.current < 15 * 60 * 1000;
      if (!isActive) return;

      const { count, error } = await supabase
        .from("user_notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", profile.id)
        .eq("type", "report_reply")
        .eq("is_read", false);

      if (error) return;
      const n = count || 0;
      setPendingCount(n);
      if (n > 0) setOpen(true);
    };

    checkUnread();
    const interval = setInterval(checkUnread, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [profile]);

  const handleView = () => {
    setOpen(false);
    navigate("/dashboard/announcements");
  };

  if (!profile) return null;

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <MessageCircleWarning className="h-5 w-5 text-blue-600" />
            রিপোর্টের ফিডব্যাক এসেছে
          </AlertDialogTitle>
          <AlertDialogDescription>
            আপনার রিপোর্ট করা {pendingCount > 1 ? `${pendingCount}টি প্রশ্নের` : "প্রশ্নের"} ব্যাপারে অ্যাডমিন ফিডব্যাক দিয়েছেন। বিস্তারিত দেখতে নিচে ক্লিক করুন।
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction onClick={handleView}>দেখুন</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
