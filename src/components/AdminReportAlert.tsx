import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { AlertCircle } from "lucide-react";

// Popup alert for admins/teachers whenever there are pending question reports.
// Re-checks every 5 minutes while the admin is active, for as long as any
// report remains unresolved. Dismissing (either button) snoozes it until the
// next scheduled check — it does not re-check immediately on every page
// navigation or component remount.
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
const LAST_CHECK_KEY = "admin_report_alert_last_check";

export const AdminReportAlert = () => {
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
    const checkPending = async () => {
      const isActive = document.visibilityState === "visible" && Date.now() - lastActivityRef.current < 15 * 60 * 1000;
      if (!isActive) return;

      const { count, error } = await supabase
        .from("question_reports")
        .select("id", { count: "exact", head: true });
      if (error) return;

      sessionStorage.setItem(LAST_CHECK_KEY, String(Date.now()));

      const n = count || 0;
      setPendingCount(n);
      if (n > 0) setOpen(true);
    };

    // Only run an immediate check if we haven't checked recently (e.g. this
    // is a fresh session/tab). On a same-session remount (route change,
    // fast refresh, etc.) we wait for the next scheduled interval instead
    // of re-popping the dialog right away.
    const lastCheck = Number(sessionStorage.getItem(LAST_CHECK_KEY) || 0);
    const dueForCheck = Date.now() - lastCheck >= CHECK_INTERVAL_MS;
    if (dueForCheck) checkPending();

    const interval = setInterval(checkPending, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const handleView = () => {
    setOpen(false);
    navigate("/admin/reports");
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-600" />
            অমীমাংসিত প্রশ্ন রিপোর্ট আছে
          </AlertDialogTitle>
          <AlertDialogDescription>
            {pendingCount > 1 ? `${pendingCount}টি প্রশ্ন রিপোর্ট` : "একটি প্রশ্ন রিপোর্ট"} এখনো অমীমাংসিত আছে। দেখতে নিচে ক্লিক করুন।
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setOpen(false)}>পরে দেখব</AlertDialogCancel>
          <AlertDialogAction onClick={handleView}>দেখুন</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
