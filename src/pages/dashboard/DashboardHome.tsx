import { useEffect, useState } from "react";
import { CalendarClock, Calendar, FileText, ListChecks, Video, BookOpen, History, StickyNote, Files, Trophy, User, AlertCircle, Bookmark, Sparkles, Bell, CheckCircle, AlertTriangle, Trash2, ChevronDown, ChevronUp, Infinity, Flag, Megaphone, BarChart3, Zap, TrendingUp, Target, ClipboardCheck, Send, Timer, BookMarked } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { quickAccessItems } from "@/config/dashboardCardItems";
import { useAuth } from "@/contexts/AuthContext";
import { useEnrollments } from "@/hooks/useEnrollments";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate, Link } from "react-router-dom";
import { setExamSourceList } from "@/lib/examSourceTracker";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getEmbedUrl } from "@/lib/videoUtils";
import { QuickAccessSortDialog, QUICK_ACCESS_ORDER_KEY } from "@/components/dashboard/QuickAccessSortDialog";
import { LiveCountdown } from "@/components/shared/LiveCountdown";

const TUTORIAL_VIDEO_KEY = "dashboard_tutorial_video_url";

// Define shape of dashboard data
interface DashboardData {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    next_class: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    active_live_classes: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    active_live_exams: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    next_exam: any;
}

// Safe Date Helper to prevent crashes
const formatDate = (dateStr: string | null | undefined, options?: Intl.DateTimeFormatOptions) => {
    if (!dateStr) return "N/A";
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return "Invalid Date";
        return date.toLocaleString([], options);
    } catch (e) {
        console.error("Date formatting error", e);
        return "Error";
    }
};

const DashboardHome = () => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [showTrackerReady, setShowTrackerReady] = useState(false);

  useEffect(() => {
    if (user && sessionStorage.getItem("study_tracker_pending") === "1") {
      sessionStorage.removeItem("study_tracker_pending");
      setShowTrackerReady(true);
    }
  }, [user]);
  const { data: enrollments, isLoading: enrollmentsLoading } = useEnrollments();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedNotifIds, setExpandedNotifIds] = useState<string[]>([]);
  const [unreadNoticeCount, setUnreadNoticeCount] = useState(0);
  const [showTutorialVideo, setShowTutorialVideo] = useState(false);
  const [showQuickAccessSort, setShowQuickAccessSort] = useState(false);

  const { data: tutorialVideoUrl } = useQuery({
    queryKey: ["dashboard-tutorial-video"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("value").eq("key", TUTORIAL_VIDEO_KEY).maybeSingle();
      if (error) throw error;
      const v = data?.value;
      return typeof v === "string" ? v : (v ? String(v) : null);
    },
  });

  useEffect(() => {
    const updateCount = () => {
      const stored = localStorage.getItem("unread_notification_count");
      setUnreadNoticeCount(stored ? parseInt(stored, 10) : 0);
    };
    updateCount();
    window.addEventListener("unread-notifications-updated", updateCount);
    return () => window.removeEventListener("unread-notifications-updated", updateCount);
  }, []);

  useEffect(() => {
    document.title = "Dashboard – Atlas";
  }, []);

  // Fetch Personal Notifications
  const { data: userNotifications } = useQuery({
      queryKey: ["user-notifications-dashboard", user?.id],
      queryFn: async () => {
          if (!user) return [];
          const { data, error } = await supabase
              .from("user_notifications")
              .select("*")
              .eq("user_id", user.id)
              // We only want recent relevant notifications on dashboard, but user asked for "approval and decline"
              // Filters: payment_approved, payment_rejected, course_request_declined
              .in("type", ["payment_approved", "payment_rejected", "course_request_declined"])
              .order("created_at", { ascending: false });
          if (error) throw error;
          return data;
      },
      enabled: !!user
  });

  const deleteNotificationMutation = useMutation({
      mutationFn: async (id: string) => {
          const { error } = await supabase
              .from("user_notifications")
              .delete()
              .eq("id", id);
          if (error) throw error;
      },
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["user-notifications-dashboard"] });
          queryClient.invalidateQueries({ queryKey: ["user-notifications"] }); // Refresh main list too
          toast({ title: "Notification dismissed" });
      },
      onError: () => {
          toast({ title: "Failed to dismiss", variant: "destructive" });
      }
  });

  const toggleExpandNotification = (id: string) => {
    if (expandedNotifIds.includes(id)) {
        setExpandedNotifIds(expandedNotifIds.filter(e => e !== id));
    } else {
        setExpandedNotifIds([...expandedNotifIds, id]);
    }
  };

  const { data: pendingPayments } = useQuery({
    queryKey: ["pending-payments", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data } = await supabase
        .from("payment_requests")
        .select("id")
        .eq("user_id", user.id)
        .eq("status", "pending");
      return data || [];
    },
    enabled: !!user,
  });

  const { data: dashboardData, isLoading: dashboardLoading, isError } = useQuery({
    queryKey: ["dashboard-data", user?.id],
    queryFn: async () => {
      if (!user) return null;
      // Fetch aggregated data via RPC
      const { data, error } = await supabase.rpc("get_dashboard_data");

      if (error) {
        console.error("Dashboard data fetch error:", error);
        throw error;
      }
      return data as unknown as DashboardData;
    },
    enabled: !!user,
  });

  const { data: pendingReportsCount } = useQuery({
    queryKey: ["admin-pending-reports-count"],
    queryFn: async () => {
      const { count } = await supabase
        .from("question_reports")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending");
      return count || 0;
    },
    enabled: !!isAdmin,
  });

  const { data: telegramSupportCards } = useQuery({
    queryKey: ["telegram-support-cards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("telegram_support_cards")
        .select("*, topics:telegram_support_topics(*)")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data || []).map((c: any) => ({
        ...c,
        topics: (c.topics || []).sort((a: any, b: any) => a.sort_order - b.sort_order),
      }));
    },
  });

  const { data: quickAccessOrder } = useQuery({
    queryKey: ["quick-access-order"],
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("value").eq("key", QUICK_ACCESS_ORDER_KEY).maybeSingle();
      if (error) return [];
      return Array.isArray(data?.value) ? (data.value as string[]) : [];
    },
  });

  const { data: qpPoints } = useQuery({
    queryKey: ["qp-user-points", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("qp_user_points")
        .select("total_points")
        .eq("user_id", user!.id)
        .maybeSingle();
      if (error) return 0;
      return data?.total_points ?? 0;
    },
  });

  if (dashboardLoading) {
    return <div className="p-8 text-center text-sm text-muted-foreground">Loading dashboard...</div>;
  }

  if (isError) {
      return (
          <div className="p-8 text-center">
              <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-2" />
              <h2 className="text-lg font-semibold text-destructive">Failed to load dashboard data.</h2>
              <p className="text-sm text-muted-foreground">Please check your connection and try again.</p>
              <Button onClick={() => window.location.reload()} size="sm" className="mt-4">Retry</Button>
          </div>
      );
  }

  // Extract data with fallbacks
  const nextClass = dashboardData?.next_class;
  const activeLiveClasses = dashboardData?.active_live_classes || [];
  const activeLiveExams = dashboardData?.active_live_exams || [];
  const nextExam = dashboardData?.next_exam;

  const hasLiveActivity = activeLiveClasses.length > 0 || activeLiveExams.length > 0;
  const hasUpcomingActivity = !!nextClass || !!nextExam;

  const navigationItems = quickAccessItems;

  const orderedNavigationItems = (() => {
    if (!quickAccessOrder || quickAccessOrder.length === 0) return navigationItems;
    const byTitle = new Map(navigationItems.map((item) => [item.title, item]));
    const ordered = quickAccessOrder.map((t) => byTitle.get(t)).filter(Boolean) as typeof navigationItems;
    const remaining = navigationItems.filter((item) => !quickAccessOrder.includes(item.title));
    return [...ordered, ...remaining];
  })();

  return (
    <div className="space-y-4 animate-in fade-in duration-500 dashboard-home-page">
      {/* Fixed floating WhatsApp + Telegram support buttons, bottom-left corner */}
      <div className="fixed bottom-4 left-4 z-40 flex flex-col gap-2">
        <a
          href="https://wa.me/8801639787547"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="WhatsApp Support"
          className="h-12 w-12 rounded-full bg-[#25D366] shadow-lg flex items-center justify-center hover:scale-105 transition-transform"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6 fill-white"><path d="M17.6 6.32A7.85 7.85 0 0 0 12.05 4a7.94 7.94 0 0 0-6.87 11.87L4 20l4.24-1.11a7.9 7.9 0 0 0 3.8.97h.01A7.94 7.94 0 0 0 20 12a7.85 7.85 0 0 0-2.4-5.68Zm-5.55 12.2a6.6 6.6 0 0 1-3.36-.92l-.24-.14-2.5.66.67-2.44-.16-.25a6.58 6.58 0 0 1 5.6-10.11 6.53 6.53 0 0 1 4.63 1.92 6.53 6.53 0 0 1 1.92 4.63 6.6 6.6 0 0 1-6.56 6.55Zm3.6-4.9c-.2-.1-1.16-.57-1.34-.64-.18-.07-.31-.1-.44.1-.13.2-.5.63-.62.76-.11.13-.23.14-.42.05a5.4 5.4 0 0 1-1.6-.98 5.98 5.98 0 0 1-1.1-1.37c-.12-.2 0-.3.09-.4.1-.1.2-.24.3-.36.1-.12.13-.2.2-.34.07-.13.03-.25-.02-.35-.05-.1-.44-1.06-.6-1.45-.16-.38-.32-.33-.44-.34h-.38c-.13 0-.35.05-.53.25-.18.2-.7.68-.7 1.66s.72 1.92.82 2.06c.1.13 1.4 2.15 3.4 3.01.48.2.85.33 1.14.42.48.15.91.13 1.26.08.38-.06 1.16-.47 1.33-.93.16-.46.16-.85.11-.93-.05-.08-.18-.13-.38-.23Z"/></svg>
        </a>
        <a
          href="https://t.me/AtlasWeb_Robot"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Telegram Support"
          className="h-12 w-12 rounded-full bg-[#26A5E4] shadow-lg flex items-center justify-center hover:scale-105 transition-transform"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6 fill-white"><path d="M21.05 3.92 2.87 11.02c-1.24.5-1.23 1.19-.23 1.5l4.66 1.45 1.8 5.5c.22.6.11.84.75.84.5 0 .72-.23 1-.5l2.4-2.32 4.7 3.47c.87.48 1.5.23 1.72-.8l3.1-14.6c.32-1.26-.48-1.83-1.72-1.64Zm-4.6 3.53-7.6 6.87-.3 3.24-1.5-4.7 9.68-6.1c.46-.28.88-.13.53.18Z"/></svg>
        </a>
      </div>

      <Card className="w-full">
        <CardContent className="p-3 flex flex-col items-center gap-2">
          <h1 className="text-2xl font-extrabold tracking-tight whitespace-nowrap animate-text-fade-sweep">Welcome to Dashboard</h1>
          {tutorialVideoUrl && (
            <Button
              size="sm"
              variant="outline"
              className="shrink-0 gap-1.5 h-7 px-3 text-xs"
              onClick={() => setShowTutorialVideo(true)}
            >
              <Video className="h-3.5 w-3.5 animate-icon-float text-primary" />
              Watch Tutorial
            </Button>
          )}
        </CardContent>
      </Card>

      <Dialog open={showTutorialVideo} onOpenChange={setShowTutorialVideo}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle>Dashboard Tutorial</DialogTitle>
          </DialogHeader>
          {tutorialVideoUrl && (
            <div className="aspect-video w-full">
              <iframe
                src={getEmbedUrl(tutorialVideoUrl)}
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title="Dashboard Tutorial"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 1. Live Activity Section (Priority 1) */}
      {hasLiveActivity && (
        <div className="space-y-4">
           <div className="flex items-center gap-2">
                <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <h2 className="text-lg font-semibold tracking-tight">Live Now</h2>
           </div>
           <div className="flex flex-col gap-4 max-w-xl mx-auto w-full">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {activeLiveClasses.map((classItem: any) => (
                  <Card key={classItem?.id || Math.random()} className="border transition-all border-emerald-600 shadow-[0_0_15px_rgba(5,150,105,0.5)] dark:shadow-[0_0_20px_rgba(5,150,105,0.3)] bg-emerald-50/50 dark:bg-emerald-900/20">
                    <CardHeader className="space-y-1 pb-2">
                      <div className="flex justify-between items-start gap-2">
                          <p className="text-sm font-mono uppercase text-muted-foreground">
                              {classItem?.course?.name || "Unknown Course"}
                          </p>
                          <span className="animate-pulse inline-flex items-center px-2 py-0.5 rounded text-sm font-medium bg-red-100 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800">
                              LIVE CLASS
                          </span>
                      </div>
                      <CardTitle className="text-base break-words">{classItem?.title || "Live Class"}</CardTitle>
                      <CardDescription className="text-sm">
                        Started: {formatDate(classItem?.start_at, { hour: '2-digit', minute: '2-digit' })}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                       <Button size="sm" onClick={() => navigate(`/dashboard/class/${classItem?.id}`)} className="w-full bg-emerald-700 hover:bg-emerald-800 text-white border-none">
                          Join Class
                       </Button>
                    </CardContent>
                  </Card>
              ))}

              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {activeLiveExams.map((exam: any) => (
                  <Card key={exam?.id || Math.random()} className="relative border transition-all border-emerald-600 shadow-[0_0_15px_rgba(5,150,105,0.5)] dark:shadow-[0_0_20px_rgba(5,150,105,0.3)] bg-emerald-50/50 dark:bg-emerald-900/20 overflow-hidden">
                    <CardHeader className="space-y-2 px-4 pt-4 pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-[10px] font-mono uppercase text-emerald-800 dark:text-emerald-200 break-words">
                            {exam?.course?.name || "Unknown Course"}
                        </span>
                        <span className="animate-pulse shrink-0 inline-flex items-center whitespace-nowrap px-2.5 py-1 rounded text-xs font-bold bg-red-100 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800">
                            LIVE EXAM
                        </span>
                      </div>
                      <CardTitle
                        className="font-extrabold text-center whitespace-nowrap overflow-hidden leading-tight"
                        style={{ fontSize: `${Math.max(1.3, Math.min(2.5, 22 / Math.max((exam?.title || "Live Exam").length, 6)))}rem` }}
                      >
                        {exam?.title || "Live Exam"}
                      </CardTitle>
                      <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                        <span>এক্সাম শেষ: {formatDate(exam?.time_window_end, { hour: '2-digit', minute: '2-digit' })}</span>
                        {exam?.time_window_end && (
                          <>
                            <span className="text-muted-foreground/50">•</span>
                            <span>সময় বাকি: <LiveCountdown endTime={exam.time_window_end} /></span>
                          </>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-2 pt-1">
                       <Button size="lg" onClick={() => { if (exam?.id) setExamSourceList(exam.id, "/dashboard/live-exam"); navigate(`/dashboard/take-exam/${exam?.id}`); }} className="w-full bg-emerald-700 hover:bg-emerald-800 text-white border-none font-bold h-12" style={{ fontSize: "1.4rem" }}>
                          Start Exam
                       </Button>
                    </CardContent>
                  </Card>
              ))}
           </div>
        </div>
      )}

      {/* 2. Upcoming Activity Section */}
      {!hasLiveActivity && hasUpcomingActivity && (
        <div className="space-y-4">
           <h2 className="text-lg font-semibold tracking-tight">Upcoming Activities</h2>
           <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {/* Next Live Class Card */}
                {nextClass && (
                <Card className="border shadow-sm flex flex-col hover:border-primary/50 transition-colors">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-base">Next Live Class</CardTitle>
                            <CalendarClock className="h-4 w-4 text-primary" />
                        </div>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col justify-between">
                        <div className="mb-4 space-y-1">
                            <p className="text-lg font-bold line-clamp-2 leading-tight">{nextClass.title}</p>
                            <p className="text-sm text-muted-foreground">
                                {nextClass.course?.name || "Unknown Course"}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                                <span className="inline-flex items-center px-2 py-1 rounded-md text-sm font-medium bg-primary/10 text-primary">
                                    {formatDate(nextClass.start_at, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        </div>
                        {nextClass.video_url && (
                            <Button size="sm" variant="outline" className="w-full mt-auto" onClick={() => navigate(`/dashboard/class/${nextClass.id}`)}>
                                Join Class
                            </Button>
                        )}
                    </CardContent>
                </Card>
                )}

                {/* Upcoming Exam Card */}
                {nextExam && (
                <Card className="border shadow-sm flex flex-col hover:border-primary/50 transition-colors">
                    <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-base">Upcoming Exam</CardTitle>
                            <ListChecks className="h-4 w-4 text-primary" />
                        </div>
                    </CardHeader>
                    <CardContent className="flex-1 flex flex-col justify-between">
                        <div className="mb-4 space-y-1">
                            <p className="text-lg font-bold line-clamp-2 leading-tight">{nextExam.title}</p>
                            <p className="text-sm text-muted-foreground">
                                {nextExam.course?.name || "Unknown Course"}
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                                <span className="inline-flex items-center px-2 py-1 rounded-md text-sm font-medium bg-primary/10 text-primary">
                                    {formatDate(nextExam.time_window_start, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
                                </span>
                            </div>
                        </div>
                        <Button size="sm" variant="outline" className="w-full mt-auto" onClick={() => navigate('/dashboard/live-exam')}>
                            View Exams
                        </Button>
                    </CardContent>
                </Card>
                )}
           </div>
        </div>
      )}

      {/* User Notifications (Approvals/Declines) */}
      {userNotifications && userNotifications.length > 0 && (
        <div className="space-y-2 animate-in fade-in slide-in-from-top-4 duration-500">
             {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
             {userNotifications.map((notif: any) => {
                const isExpanded = expandedNotifIds.includes(notif.id);
                const isSuccess = notif.type === 'payment_approved';
                return (
                <Card key={notif.id}
                      className={`border cursor-pointer transition-colors shadow-sm ${isSuccess ? 'border-green-500/50 bg-green-500/5' : 'border-red-500/50 bg-red-500/5'}`}
                      onClick={() => toggleExpandNotification(notif.id)}
                >
                    <CardHeader className="space-y-0 p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                {isSuccess ? <CheckCircle className="h-5 w-5 text-green-600 shrink-0" /> : <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />}
                                <div>
                                    <CardTitle className="text-sm font-semibold">{notif.title}</CardTitle>
                                    <p className="text-sm text-muted-foreground">{new Date(notif.created_at).toLocaleString()}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if(confirm("Dismiss this notification?")) deleteNotificationMutation.mutate(notif.id);
                                    }}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground">
                                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </Button>
                            </div>
                        </div>
                    </CardHeader>
                    {isExpanded && (
                        <CardContent className="px-4 pb-4 pt-0">
                            <div className="h-px w-full bg-border/20 mb-3" />
                            <p className="text-sm text-foreground/90">{notif.body}</p>
                        </CardContent>
                    )}
                </Card>
            )})}
        </div>
      )}

      {/* Enrollment Warning Card */}
      {!enrollmentsLoading && enrollments && enrollments.length === 0 && (
        <>
          {pendingPayments && pendingPayments.length > 0 ? (
             <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-900/10 dark:border-yellow-800">
                <CardContent className="flex flex-col gap-4 p-6">
                    <div className="flex items-start gap-4">
                        <div className="p-3 bg-yellow-100 text-yellow-600 rounded-full dark:bg-yellow-900/30 dark:text-yellow-400">
                            <AlertCircle className="h-6 w-6" />
                        </div>
                        <div className="space-y-2">
                            <h3 className="font-semibold text-lg text-yellow-900 dark:text-yellow-200">
                                এটলাসের কোর্সে আপনাকে স্বাগতম।
                            </h3>
                            <div className="text-yellow-800 dark:text-yellow-300 space-y-2 text-sm">
                                <p>
                                    <a href="https://t.me/atlasweb_robot" target="_blank" rel="noreferrer" className="font-semibold underline hover:text-yellow-900">
                                        @atlasweb_robot
                                    </a> এ আপনার পেমেন্ট এর স্ক্রিনশট দিয়ে যোগাযোগ করুন। ২৪ ঘন্টার মাঝে এটলাস টিম যাবতীয় তথ্য চেক করে ওয়েবসাইটে এক্সেস দিয়ে দিবে।
                                </p>
                                <p>এক্সেস পেলে নোটিশ এ মেসেজ আসবে।</p>
                                <p>
                                    ২৪ ঘন্টার মাঝে এক্সেস না পেলে মেসেজ দিন এই নাম্বারে <a href="http://wa.me/8801639787547" target="_blank" rel="noreferrer" className="underline font-bold hover:text-yellow-900">01639787547</a> (WhatsApp)
                                </p>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>
          ) : (
            <Card className="border-red-200 bg-red-50 dark:bg-red-900/10 dark:border-red-800">
                <CardContent className="flex flex-col md:flex-row items-center justify-between gap-4 p-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-red-100 text-red-600 rounded-full dark:bg-red-900/30 dark:text-red-400">
                            <AlertCircle className="h-6 w-6" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-lg text-red-900 dark:text-red-200">
                                আপনার কোনো কোর্স চালু নেই
                            </h3>
                            <p className="text-red-700 dark:text-red-300">
                                আপনি কোনো কোর্সে এনরোল করেননি। শুরু করতে একটি কোর্স কিনুন।
                            </p>
                            <p className="text-red-800 dark:text-red-300 mt-2 text-sm font-medium">
                                কোর্সে পেমেন্ট করে থাকলে শীঘ্রই যোগাযোগ করুন হোয়াটসঅ্যাপে <a href="https://wa.me/8801639787547" target="_blank" rel="noreferrer" className="underline hover:text-red-950">01639787547</a>
                            </p>
                        </div>
                    </div>
                    <Button
                        onClick={() => navigate("/courses")}
                        className="bg-red-600 hover:bg-red-700 text-white whitespace-nowrap"
                    >
                        Browse Courses
                    </Button>
                </CardContent>
            </Card>
          )}
        </>
      )}

      {/* Telegram Support Section */}
      {telegramSupportCards && telegramSupportCards.length > 0 && (
        <div className="space-y-3">
          <div className="rounded-lg border p-4">
            <h2 className="text-lg font-semibold tracking-tight text-center">Telegram Support</h2>
            <hr className="mt-3 border-border" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {telegramSupportCards.map((card: any) => (
              <div
                key={card.id}
                className="flex flex-col gap-2 rounded-xl border border-sky-500/20 bg-gradient-to-br from-sky-500/10 to-blue-600/10 p-4"
              >
                <div className="flex items-center gap-2">
                  <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-sm shrink-0">
                    <Send className="h-4 w-4 text-white" />
                  </div>
                  <p className="font-semibold text-sm leading-tight">{card.title}</p>
                </div>
                {card.description && (
                  <p className="text-xs text-muted-foreground leading-snug">{card.description}</p>
                )}
                {card.topics && card.topics.length > 0 && (
                  <div className="flex flex-col gap-1.5 mt-1">
                    {card.topics.map((topic: any) => (
                      <a
                        key={topic.id}
                        href={topic.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-sky-600 dark:text-sky-400 hover:underline bg-background/60 rounded-md px-2 py-1.5 border border-sky-500/10"
                      >
                        {topic.title}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Navigation Cards Section */}
      <div className="space-y-4">
           <div className="rounded-lg border p-4">
             <div className="flex items-center justify-center relative">
               <h2 className="text-lg font-semibold tracking-tight text-center">Quick Access</h2>
               {isAdmin && !showQuickAccessSort && (
                 <Button
                   size="sm"
                   variant="ghost"
                   className="absolute right-0 text-xs text-muted-foreground hover:text-primary"
                   onClick={() => setShowQuickAccessSort(true)}
                 >
                   Reorder
                 </Button>
               )}
             </div>
             <hr className="mt-3 border-border" />
           </div>
           {isAdmin && showQuickAccessSort ? (
             <QuickAccessSortDialog
               titles={orderedNavigationItems.map((item) => item.title)}
               onClose={() => setShowQuickAccessSort(false)}
             />
           ) : (
           <>
           <Link
             to="/dashboard/routine"
             className="flex items-center justify-center gap-2 w-full rounded-lg border bg-indigo-50 dark:bg-indigo-950 hover:bg-indigo-100 dark:hover:bg-indigo-900 transition-colors py-3 font-medium text-indigo-600 dark:text-indigo-300"
           >
             <Calendar className="h-4 w-4" /> Routine
           </Link>
           <div className="grid grid-cols-2 gap-3">
             <Link
               to="/focus-timer"
               className="flex items-center justify-center gap-2 w-full rounded-lg border border-violet-500/30 bg-violet-50 dark:bg-violet-950 hover:bg-violet-100 dark:hover:bg-violet-900 transition-colors py-3 font-semibold text-violet-600 dark:text-violet-300"
             >
               <Timer className="h-4 w-4" /> Live Study Room
             </Link>
             <Link
               to="/syllabus-tracker"
               className="flex items-center justify-center gap-2 w-full rounded-lg border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950 hover:bg-emerald-100 dark:hover:bg-emerald-900 transition-colors py-3 font-semibold text-emerald-600 dark:text-emerald-300"
             >
               <BookMarked className="h-4 w-4" /> Syllabus Tracker
             </Link>
           </div>
           <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
               {orderedNavigationItems.map((item, index) => (
                   <Card
                        key={index}
                        className={`group hover:shadow-md transition-all cursor-pointer ${
                            item.isExternal
                                ? 'border-violet-500/50 hover:border-violet-500 shadow-[0_0_10px_rgba(139,92,246,0.2)] dark:shadow-[0_0_15px_rgba(139,92,246,0.3)]'
                                : 'border-muted-foreground/20 hover:border-primary/50'
                        }`}
                        onClick={() => {
                            if (item.isExternal) {
                                window.open(item.url, "_blank");
                            } else {
                                navigate(item.url);
                            }
                        }}
                    >
                       <CardContent className="p-4 flex flex-col items-center justify-center text-center gap-3 min-h-[132px]">
                           <div className={`p-3 rounded-full ${item.bg} group-hover:scale-110 transition-transform duration-300 relative`}>
                               {item.isExternal && (
                                   <div className="absolute inset-0 rounded-full bg-violet-400/20 animate-ping" />
                               )}
                               {item.title === "Notice" && unreadNoticeCount > 0 && (
                                   <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold">
                                       {unreadNoticeCount > 9 ? "9+" : unreadNoticeCount}
                                   </span>
                               )}
                               <item.icon className={`h-6 w-6 ${item.color} ${item.isExternal ? 'animate-pulse' : 'animate-icon-float'}`} />
                           </div>
                           <p className="font-semibold text-lg">{item.title}</p>
                       </CardContent>
                   </Card>
               ))}
           </div>
           </>
           )}
      </div>

      <Dialog open={showTrackerReady} onOpenChange={setShowTrackerReady}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>অ্যাকাউন্ট তৈরি সম্পন্ন! 🎉</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">এখন আপনি Study Tracker ব্যবহার করতে পারবেন।</p>
          <Button
            onClick={() => {
              setShowTrackerReady(false);
              navigate("/syllabus-tracker");
            }}
            className="w-full font-bold"
          >
            Study Tracker চালু করুন
          </Button>
        </DialogContent>
      </Dialog>

    </div>
  );
};

export default DashboardHome;
