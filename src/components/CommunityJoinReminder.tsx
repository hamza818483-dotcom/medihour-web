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
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Users, ExternalLink, CheckCircle2 } from "lucide-react";

interface CommunityLink {
  id: string;
  title: string;
  url: string;
  course_name: string | null;
}

// Reminds a student every 10 minutes (while active) to join any FB/Telegram
// community link for their enrolled courses that they haven't clicked yet.
// They can confirm "যোগ হয়েছে" (already joined) to stop being asked about
// that specific link, or click "যোগ দিন" to open it (which also marks it
// as clicked automatically). Suppressed while watching a class or taking an exam.
const CHECK_INTERVAL_MS = 10 * 60 * 1000;

const SUPPRESSED_ROUTE_PATTERNS = [
  /^\/dashboard\/class\//,
  /^\/dashboard\/take-exam\//,
  /^\/take-exam\//,
];

function isOnSuppressedPage(pathname: string): boolean {
  return SUPPRESSED_ROUTE_PATTERNS.some((re) => re.test(pathname));
}

export const CommunityJoinReminder = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [pendingLinks, setPendingLinks] = useState<CommunityLink[]>([]);
  const [urlToIds, setUrlToIds] = useState<Record<string, string[]>>({});
  const [open, setOpen] = useState(false);
  const lastActivityRef = useRef(Date.now());
  const snoozedUntilRef = useRef(0);

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
    if (!user) return;

    const checkPending = async () => {
      const isActive = document.visibilityState === "visible" && Date.now() - lastActivityRef.current < 15 * 60 * 1000;
      if (!isActive) return;
      if (isOnSuppressedPage(window.location.pathname)) return;
      if (Date.now() < snoozedUntilRef.current) return;

      const { data: links, error: linksError } = await supabase.rpc("get_student_community_links");
      if (linksError || !links || links.length === 0) return;

      const { data: clicks, error: clicksError } = await supabase
        .from("community_link_clicks")
        .select("resource_id")
        .eq("profile_id", user.id);
      if (clicksError) return;

      const clickedIds = new Set((clicks || []).map((c) => c.resource_id));
      const unclicked = (links as CommunityLink[]).filter((l) => !clickedIds.has(l.id));

      // Same group/channel can be attached to more than one enrolled course
      // (shared link) — show it once, not once per course, but remember all
      // the resource ids behind that URL so confirming marks every duplicate
      // as clicked too.
      const idsByUrl: Record<string, string[]> = {};
      unclicked.forEach((l) => {
        if (!idsByUrl[l.url]) idsByUrl[l.url] = [];
        idsByUrl[l.url].push(l.id);
      });
      const seenUrls = new Set<string>();
      const deduped = unclicked.filter((l) => {
        if (seenUrls.has(l.url)) return false;
        seenUrls.add(l.url);
        return true;
      });

      if (deduped.length > 0 && !isOnSuppressedPage(window.location.pathname)) {
        setPendingLinks(deduped);
        setUrlToIds(idsByUrl);
        setOpen(true);
      }
    };

    // Don't interrupt the user the instant a page loads — wait a bit first,
    // then re-check every CHECK_INTERVAL_MS after that.
    const initialTimeout = setTimeout(checkPending, 30 * 1000);
    const interval = setInterval(checkPending, CHECK_INTERVAL_MS);
    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [user]);

  const markJoined = async (link: CommunityLink) => {
    if (!user) return;
    const allIds = urlToIds[link.url] || [link.id];
    await Promise.all(
      allIds.map((id) => supabase.rpc("record_community_link_click", { p_resource_id: id }))
    );
    setPendingLinks((prev) => {
      const next = prev.filter((l) => l.url !== link.url);
      if (next.length === 0) setOpen(false);
      return next;
    });
  };

  const openLink = (link: CommunityLink) => {
    window.open(link.url, "_blank", "noopener,noreferrer");
    markJoined(link);
  };

  if (!user || pendingLinks.length === 0) return null;

  return (
    <AlertDialog open={open} onOpenChange={(next) => { if (!next) snoozedUntilRef.current = Date.now() + CHECK_INTERVAL_MS; setOpen(next); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-blue-600" />
            কোর্সের গ্রুপে যোগ দিন
          </AlertDialogTitle>
          <AlertDialogDescription>
            আপনার কোর্সের নিচের গ্রুপ/চ্যানেলগুলোতে এখনো যোগ দেননি। গুরুত্বপূর্ণ আপডেট মিস না করতে দ্রুত যোগ দিন।
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {pendingLinks.map((link) => (
            <div key={link.id} className="flex items-center justify-between gap-2 border rounded-lg px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{link.title}</p>
                {link.course_name && (
                  <p className="text-xs text-muted-foreground truncate">{link.course_name}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <Button size="sm" variant="outline" className="h-8 px-2 text-xs" onClick={() => markJoined(link)}>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                  যোগ হয়েছে
                </Button>
                <Button size="sm" className="h-8 px-2 text-xs" onClick={() => openLink(link)}>
                  <ExternalLink className="h-3.5 w-3.5 mr-1" />
                  যোগ দিন
                </Button>
              </div>
            </div>
          ))}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => { snoozedUntilRef.current = Date.now() + CHECK_INTERVAL_MS; setOpen(false); }}>পরে করব</AlertDialogCancel>
          <AlertDialogAction onClick={() => navigate("/dashboard/community")}>
            সব গ্রুপ দেখুন
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
