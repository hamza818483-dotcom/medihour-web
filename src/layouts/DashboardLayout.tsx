import { Outlet, Link } from "react-router-dom";
import {
  ArrowLeft, Menu, Moon, Sun, Megaphone,
  LayoutDashboard, Video, PenTool, BookOpen,
  History, StickyNote, Files, Calendar,
  User, BarChart, Bell, HelpCircle,
  Settings, Users, Library, Trophy, CreditCard, Bookmark, VolumeX, Volume2, ShieldAlert,
  Tag, LayoutTemplate, AlertCircle, Archive, Database, GraduationCap, Images
} from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useNotification } from "@/contexts/NotificationContext";
import { useNavigate, useLocation } from "react-router-dom";
import { useTheme } from "next-themes";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetDescription } from "@/components/ui/sheet";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEnrollments } from "@/hooks/useEnrollments";
import FloatingStudyTools from "@/components/study/FloatingStudyTools";
import ProfileCompletionReminder from "@/components/ProfileCompletionReminder";
import { ReportFeedbackAlert } from "@/components/ReportFeedbackAlert";
import { CommunityJoinReminder } from "@/components/CommunityJoinReminder";
import { AdminReportAlert } from "@/components/AdminReportAlert";
import { StudyToolsProvider } from "@/contexts/StudyToolsContext";
import { PushPermissionPrompt } from "@/components/PushPermissionPrompt";

export const DashboardLayout = () => {
  const { profile, signOut, isAdmin, isTeacher, user } = useAuth();
  const { sendNotification, permission, requestPermission } = useNotification();
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const { data: enrollments } = useEnrollments();
  const [hasPendingPayments, setHasPendingPayments] = useState(false);
  const [isMuted, setIsMuted] = useState(() => localStorage.getItem("admin_sound_muted") === "true");
  const [isDevMode, setIsDevMode] = useState(() => localStorage.getItem("dev_mode") === "true");
  const [unreadNoticeCount, setUnreadNoticeCount] = useState(() => {
    const stored = localStorage.getItem("unread_notification_count");
    return stored ? parseInt(stored, 10) || 0 : 0;
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

  useEffect(() => {
    localStorage.setItem("admin_sound_muted", String(isMuted));
  }, [isMuted]);

  useEffect(() => {
    localStorage.setItem("dev_mode", String(isDevMode));
    if (isDevMode) {
      // Reload to apply changes (disable anti-cheat) if turning ON
      // Actually, we need to reload to disable the running anti-cheat hooks or just let the user reload.
      // But toggling it OFF -> ON (enabling dev mode) requires reload to stop existing intervals?
      // No, existing intervals are set on mount.
      // Easiest is to force reload if user toggles.
    }
  }, [isDevMode]);

  // Polling for admin notifications
  useEffect(() => {
    if (!isAdmin) return;

    const checkAdminNotifications = async () => {
      const { data, error } = await supabase.rpc('get_pending_payment_count');
      if (error) {
        console.error("Error fetching payment requests count:", error);
        setHasPendingPayments(false);
        return;
      }
      const pending = data > 0;
      setHasPendingPayments(pending);

      const audioEl = document.getElementById("notification-sound-loop") as HTMLAudioElement;
      if (pending && !isMuted) {
        if (audioEl && audioEl.paused) {
          audioEl.play().catch(e => console.log("Audio play prevented:", e));
        }
      } else {
        if (audioEl && !audioEl.paused) {
          audioEl.pause();
          audioEl.currentTime = 0;
        }
      }
    };

    const adminInterval = setInterval(checkAdminNotifications, 60000); // Reduced to 60s
    checkAdminNotifications();
    return () => clearInterval(adminInterval);
  }, [isAdmin, isMuted]);

  // Check for reminders and announcements (ONCE on mount/profile load)
  useEffect(() => {
    // Only check if user is logged in
    if (!profile) return;

    // Ask for permission if not granted yet (optional, maybe better on a button click)
    if (permission === 'default') {
       // requestPermission(); // Uncomment to auto-request
    }

    const checkReminders = async () => {
        if (!enrollments || enrollments.length === 0) return;
        const enrolledCourseIds = enrollments.map(e => e.course_id);
        const now = new Date();
        const fifteenMinsLater = new Date(now.getTime() + 15 * 60000);

        // Check Classes
        const { data: upcomingClasses } = await supabase
            .from("classes")
            .select("title, start_at")
            .in("course_id", enrolledCourseIds)
            .gt("start_at", now.toISOString())
            .lt("start_at", fifteenMinsLater.toISOString());

        upcomingClasses?.forEach(cls => {
            const clsKey = `notified-class-${cls.title}-${cls.start_at}`;
            if (!localStorage.getItem(clsKey)) {
                sendNotification("Upcoming Class", { body: `${cls.title} starts in less than 15 minutes!` });
                localStorage.setItem(clsKey, "true");
            }
        });

        // Check Exams
        const { data: upcomingExams } = await supabase
            .from("exams")
            .select("title, time_window_start")
            .in("course_id", enrolledCourseIds)
            .gt("time_window_start", now.toISOString())
            .lt("time_window_start", fifteenMinsLater.toISOString());

        upcomingExams?.forEach(exam => {
            const examKey = `notified-exam-${exam.title}-${exam.time_window_start}`;
            if (!localStorage.getItem(examKey)) {
                sendNotification("Upcoming Exam", { body: `${exam.title} starts in less than 15 minutes!` });
                localStorage.setItem(examKey, "true");
            }
        });

        // Check Personal Notifications (Unread) - User Notifications Table (System events)
        const { data: unreadUserNotifs } = await supabase
            .from("user_notifications")
            .select("title, body, type")
            .eq("user_id", profile.id)
            .eq("is_read", false);

        // Check Personal Announcements (Legacy/Direct messages)
        const { data: unreadDirectNotes } = await supabase
            .from("announcements")
            .select("title, body, type")
            .eq("recipient_profile_id", profile.id)
            .is('read_at', null);

        // Sound Logic for Payment Notifications
        // Monitor both tables for critical types
        const criticalTypes = [
          'payment_approved',
          'payment_rejected',
          'course_request_declined',
          'course_request_approved'
        ];

        const hasCriticalUserNotif = unreadUserNotifs?.some(n => criticalTypes.includes(n.type));
        const hasCriticalDirectNote = unreadDirectNotes?.some(n => criticalTypes.includes(n.type));
        const hasCriticalNotification = hasCriticalUserNotif || hasCriticalDirectNote;

        const audioEl = document.getElementById("notification-sound-loop") as HTMLAudioElement;

        if (hasCriticalNotification) {
            if (audioEl && audioEl.paused) {
                audioEl.play().catch(e => console.log("Audio play prevented:", e));
            }
            sendNotification("New Notification", { body: "You have important updates regarding your enrollment." });
        } else {
            if (audioEl && !audioEl.paused) {
                audioEl.pause();
                audioEl.currentTime = 0;
            }
        }

        // Check Announcements (General) — count only those NOT yet read by this user (server-truth via announcement_reads)
        let annQuery = supabase
            .from("announcements")
            .select("id");

        if (enrolledCourseIds.length > 0) {
             annQuery = annQuery.or(`course_id.in.(${enrolledCourseIds.join(',')}),course_id.is.null`);
        } else {
             annQuery = annQuery.is("course_id", null);
        }

        const { data: allAnnouncements } = await annQuery;

        const { data: readAnnouncementRows } = await supabase
            .from("announcement_reads")
            .select("announcement_id")
            .eq("user_id", profile.id);

        const readIds = new Set((readAnnouncementRows || []).map((r: any) => r.announcement_id));
        const unreadAnnouncementCount = (allAnnouncements || []).filter((a: any) => !readIds.has(a.id)).length;
        const hasNewAnnouncements = unreadAnnouncementCount > 0;

        const hasUnread = (unreadUserNotifs && unreadUserNotifs.length > 0) || (unreadDirectNotes && unreadDirectNotes.length > 0);

        const totalUnreadCount = (unreadUserNotifs?.length || 0) + (unreadDirectNotes?.length || 0) + unreadAnnouncementCount;
        localStorage.setItem("unread_notification_count", String(totalUnreadCount));
        setUnreadNoticeCount(totalUnreadCount);
        window.dispatchEvent(new Event("unread-notifications-updated"));

        if (hasNewAnnouncements || hasUnread) {
             document.getElementById("mobile-announcement-dot")?.classList.remove("hidden");
             document.getElementById("desktop-announcement-dot")?.classList.remove("hidden");
        } else {
             document.getElementById("mobile-announcement-dot")?.classList.add("hidden");
             document.getElementById("desktop-announcement-dot")?.classList.add("hidden");
        }
    };

    checkReminders(); // Run immediately
  }, [profile, enrollments, sendNotification, permission, isAdmin]);

  // Keep badge count in sync with localStorage updates (e.g. after visiting announcements page)
  useEffect(() => {
    const syncCount = () => {
      const stored = localStorage.getItem("unread_notification_count");
      setUnreadNoticeCount(stored ? parseInt(stored, 10) || 0 : 0);
    };
    window.addEventListener("unread-notifications-updated", syncCount);
    return () => window.removeEventListener("unread-notifications-updated", syncCount);
  }, []);
  
  return (
    <StudyToolsProvider>
    <SidebarProvider>
      <div className="min-h-screen w-full bg-background text-foreground flex flex-col print:block print:h-auto print:overflow-visible">
        <PushPermissionPrompt />
        <header className="sticky top-0 z-10 flex h-14 items-center border-b bg-background/95 backdrop-blur px-4 supports-[backdrop-filter]:bg-background/60 print:hidden">
          <SidebarTrigger className="mr-3 hidden sm:inline-flex" />
          <div className="flex flex-1 items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 sm:hidden"
                aria-label="Go back"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="shrink-0 hidden sm:inline-flex"
                aria-label="Go back"
                onClick={() => navigate(-1)}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2">
                {location.pathname === "/dashboard" ? (
                  <Link to="/" className="bg-white rounded p-1 shrink-0" aria-label="Go to homepage">
                    <img src="/logo.png" alt="Atlas Logo" className="h-8 w-auto object-contain" />
                  </Link>
                ) : (
                  <button
                    onClick={() => navigate("/dashboard")}
                    className="text-sm font-semibold hover:underline"
                  >
                    Dashboard
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="icon"
                className="shrink-0"
                aria-label="Toggle theme"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="relative shrink-0"
                aria-label="Notifications"
                onClick={() => navigate("/dashboard/announcements")}
              >
                <Bell className="h-4 w-4" />
                {unreadNoticeCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-red-600 text-[10px] font-bold text-white leading-none animate-pulse">
                    {unreadNoticeCount}
                  </span>
                )}
              </Button>
              {isAdmin && (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    className="hidden sm:inline-flex"
                    aria-label={isDevMode ? "Disable Dev Mode" : "Enable Dev Mode"}
                    onClick={async () => {
                        const newVal = !isDevMode;
                        setIsDevMode(newVal);
                        localStorage.setItem("dev_mode", String(newVal));

                        // Update Global Setting in Database
                        await supabase.rpc('toggle_anti_cheat', { p_enabled: !newVal }); // Logic inverted: if devMode ON, anti-cheat OFF.

                        window.location.reload();
                    }}
                    title={isDevMode ? "Disable Developer Mode (Enable Anti-Cheat Global)" : "Enable Developer Mode (Disable Anti-Cheat Global)"}
                  >
                    <ShieldAlert className={`h-4 w-4 ${isDevMode ? 'text-red-500' : 'text-muted-foreground'}`} />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="hidden sm:inline-flex"
                    aria-label={isMuted ? "Unmute notifications" : "Mute notifications"}
                    onClick={() => setIsMuted(!isMuted)}
                  >
                    {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                  </Button>
                </>
              )}
              {profile && (
                <span className="hidden text-xs text-muted-foreground sm:inline-flex">
                  Reg ID: {profile.registration_id}
                </span>
              )}

              <Button variant="outline" size="sm" onClick={() => signOut()} className="hidden sm:inline-flex">
                Logout
              </Button>

              {/* Notification Audio Element */}
              <audio id="notification-sound-loop" src="https://actions.google.com/sounds/v1/alarms/beep_short.ogg" loop className="hidden" />

              {/* Mobile hamburger */}
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label="Open menu"
                    className="sm:hidden"
                  >
                    <Menu className="h-4 w-4" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="flex flex-col gap-4 w-[280px] overflow-y-auto">
                  <SheetHeader className="text-left">
                    <SheetTitle>Menu</SheetTitle>
                    <SheetDescription className="text-xs text-muted-foreground">
                      {profile ? `Reg ID: ${profile.registration_id}` : 'Atlas'}
                    </SheetDescription>
                  </SheetHeader>
                  <nav className="flex flex-col gap-1 text-sm">
                    <Link to="/dashboard" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md font-medium">
                        <LayoutDashboard className="h-4 w-4 text-blue-500" />
                        Dashboard
                    </Link>
                    <Link to="/dashboard/my-courses" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md font-medium">
                        <GraduationCap className="h-4 w-4 text-indigo-500" />
                        My Courses
                    </Link>
                    <Link to="/dashboard/routine" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md font-medium">
                        <Calendar className="h-4 w-4 text-indigo-500" /> Routine
                    </Link>
                    <div className="my-1 border-t border-border/50"></div>

                    <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Student</p>
                    <Link to="/dashboard/profile" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md">
                        <User className="h-4 w-4 text-green-500" /> Profile
                    </Link>
                    <Link to="/dashboard/live-class" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md">
                        <Video className="h-4 w-4 text-red-500" /> Live Class
                    </Link>
                    <Link to="/dashboard/live-exam" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md">
                        <PenTool className="h-4 w-4 text-purple-500" /> Live Exam
                    </Link>
                    <Link to="/dashboard/recordings" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md">
                        <History className="h-4 w-4 text-orange-500" /> Record Class
                    </Link>
                    <Link to="/dashboard/past-exam" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md">
                        <BookOpen className="h-4 w-4 text-yellow-500" /> Past Exams
                    </Link>
                    <Link to="/dashboard/archive" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md">
                        <Archive className="h-4 w-4 text-gray-500" /> Archive Class & Exam
                    </Link>
                    <Link to="/dashboard/results" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md">
                        <Trophy className="h-4 w-4 text-teal-500" /> Exam History
                    </Link>
                    <Link to="/dashboard/my-mistakes" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md">
                        <AlertCircle className="h-4 w-4 text-red-600" /> My Mistakes
                    </Link>
                    <Link to="/dashboard/announcements" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md">
                        <Megaphone className="h-4 w-4 text-rose-500" /> Notice
                    </Link>
                    <Link to="/dashboard/bookmarks" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md">
                        <Bookmark className="h-4 w-4 text-emerald-500" /> Bookmarks
                    </Link>
                    <Link to="/dashboard/community" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md">
                        <Users className="h-4 w-4 text-cyan-500" /> Community
                    </Link>
                    <Link to="/dashboard/analytics" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md">
                        <BarChart className="h-4 w-4 text-slate-500" /> Exam Analytics
                    </Link>
                    <Link to="/dashboard/program" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md">
                        <Settings className="h-4 w-4 text-amber-500" /> Study Tools
                    </Link>

                    {(isAdmin || isTeacher) && (
                      <>
                        <div className="my-1 border-t border-border/50"></div>
                        <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{isAdmin ? "Admin" : "Teacher"}</p>

                        {/* Common Links for Admin & Teacher */}
                        <Link to="/admin" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md">
                            <LayoutDashboard className="h-4 w-4 text-blue-600" /> Overview
                        </Link>
                        <Link to="/admin/classes" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md">
                            <Video className="h-4 w-4 text-red-600" /> Classes
                        </Link>
                        <Link to="/admin/routines" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md">
                            <Calendar className="h-4 w-4 text-indigo-600" /> Routine Manager
                        </Link>
                        <Link to="/admin/exams" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md">
                            <PenTool className="h-4 w-4 text-orange-600" /> Exams
                        </Link>
                        <Link to="/admin/question-bank" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md">
                            <Database className="h-4 w-4 text-blue-600" /> Question Bank
                        </Link>
                        <Link to="/admin/announcements" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md">
                            <Megaphone className="h-4 w-4 text-yellow-600" /> Notice
                        </Link>
                        <Link to="/admin/community" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md">
                            <Users className="h-4 w-4 text-teal-600" /> Community Manager
                        </Link>
                        <Link to="/admin/notes" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md">
                            <StickyNote className="h-4 w-4 text-pink-600" /> Notes Manager
                        </Link>
                        <Link to="/admin/archive" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md">
                            <BookOpen className="h-4 w-4 text-purple-500" /> Archive Manager
                        </Link>

                        {/* Admin Only Links */}
                        {isAdmin && (
                          <>
                            <Link to="/admin/free-content" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md">
                                <StickyNote className="h-4 w-4 text-indigo-500" /> Free Manager
                            </Link>
                            <Link to="/admin/courses" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md">
                                <Settings className="h-4 w-4 text-green-600" /> Courses
                            </Link>
                            <Link to="/admin/students" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md">
                                <Users className="h-4 w-4 text-purple-600" /> Students
                            </Link>
                            <Link to="/admin/payments" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md">
                                <CreditCard className="h-4 w-4 text-emerald-600" /> Payments
                            </Link>
                            <Link to="/admin/promos" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md">
                                <Tag className="h-4 w-4 text-cyan-600" /> Promo Codes
                            </Link>
                            <Link to="/admin/heroes" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md">
                                <LayoutTemplate className="h-4 w-4 text-indigo-600" /> Site Heroes
                            </Link>
                            <Link to="/admin/mentors" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md">
                                <PenTool className="h-4 w-4 text-violet-600" /> Mentors/Founders
                            </Link>
                            <Link to="/admin/success-gallery" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md">
                                <Images className="h-4 w-4 text-fuchsia-600" /> Success Gallery
                            </Link>
                            <Link to="/admin/reviews" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md">
                                <Megaphone className="h-4 w-4 text-pink-600" /> Reviews
                            </Link>
                            <Link to="/admin/reports" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md">
                                <ShieldAlert className="h-4 w-4 text-red-500" /> Reports
                            </Link>
                          </>
                        )}
                      </>
                    )}

                    <div className="my-1 border-t border-border/50"></div>
                    <Link to="/" className="flex items-center gap-2 py-2 px-2 hover:bg-muted rounded-md">
                        <ArrowLeft className="h-4 w-4" /> Back to Home
                    </Link>
                  </nav>

                  <div className="mt-auto flex flex-col gap-4">
                    <div className="flex items-center justify-between gap-2 px-2">
                      <span className="text-sm">Theme</span>
                      <Button
                        variant="outline"
                        size="icon"
                        aria-label="Toggle theme"
                        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                      >
                        {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                      </Button>
                    </div>
                    <Button variant="destructive" size="sm" onClick={() => signOut()} className="w-full">
                      Logout
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </header>

        <div className="flex flex-1 w-full overflow-hidden pt-[1px] print:overflow-visible print:h-auto print:block">
          <div className="print:hidden">
            <AppSidebar hasPendingPayments={hasPendingPayments} />
          </div>
          <main className="flex-1 bg-background px-4 py-4 sm:px-6 sm:py-6 overflow-y-auto w-full print:overflow-visible print:h-auto print:w-full print:px-0 print:py-0">
            <Outlet />
          </main>
        </div>
        <FloatingStudyTools />
        <ProfileCompletionReminder />
        <ReportFeedbackAlert />
        {!isAdmin && !isTeacher && <CommunityJoinReminder />}
        {(isAdmin || isTeacher) && <AdminReportAlert />}
      </div>
    </SidebarProvider>
    </StudyToolsProvider>
  );
};

export default DashboardLayout;
