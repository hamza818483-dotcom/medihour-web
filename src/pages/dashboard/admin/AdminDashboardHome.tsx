import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, GraduationCap, CreditCard, DollarSign, CalendarClock, ListChecks, StickyNote, Database, Megaphone, Flag, BookOpen, PenTool, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";

const AdminDashboardHome = () => {
  const navigate = useNavigate();
  useEffect(() => {
    document.title = "Admin Overview – Atlas";
  }, []);

    const [isMuted, setIsMuted] = useState(() => localStorage.getItem("admin_sound_muted") === "true");

  useEffect(() => {
    // Check for pending reports and beep
    const checkForPendingReports = async () => {
        const { count } = await supabase
            .from("question_reports")
            .select("*", { count: 'exact', head: true })
            .eq("status", "pending");

        if (count && count > 0) {
            // Play beep if not muted
            if (!isMuted) {
                const audio = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
                audio.play().catch(e => console.error("Audio play failed", e));
            }
        }
    };

    const interval = setInterval(checkForPendingReports, 60000); // 60s
    checkForPendingReports();

    return () => clearInterval(interval);
  }, [isMuted]);

  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      // Fetch counts in parallel
      const [students, courses, pendingPayments, pendingReports, revenue, recentEnrollments] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("courses").select("id", { count: "exact", head: true }).eq("is_active", true),
        supabase.from("payment_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.from("question_reports").select("id", { count: "exact", head: true }).eq("status", "pending"),
        supabase.rpc("get_total_revenue"),
        supabase.from("enrollments").select("id, created_at, profiles(id, full_name, registration_id), courses(name)").order("created_at", { ascending: false }).limit(5)
      ]);

      return {
        students: students.count || 0,
        courses: courses.count || 0,
        pendingPayments: pendingPayments.count || 0,
        pendingReports: pendingReports.count || 0,
        recentEnrollments: (recentEnrollments.data || []) as any[]
      };
    },
  });

  const quickLinks = [
    { title: "Courses", icon: GraduationCap, url: "/admin/courses", color: "text-green-600", bg: "bg-green-50 dark:bg-green-950" },
    { title: "Students", icon: Users, url: "/admin/students", color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-950" },
    { title: "Classes", icon: CalendarClock, url: "/admin/classes", color: "text-red-600", bg: "bg-red-50 dark:bg-red-950" },
    { title: "Exams", icon: ListChecks, url: "/admin/exams", color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950" },
    { title: "Question Bank", icon: Database, url: "/admin/question-bank", color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950" },
    { title: "Content Creator", icon: StickyNote, url: "/admin/content-creator", color: "text-teal-600", bg: "bg-teal-50 dark:bg-teal-950" },
    { title: "Notices", icon: Megaphone, url: "/admin/announcements", color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-950" },
    { title: "Payments", icon: CreditCard, url: "/admin/payments", color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950" },
    { title: "Archive", icon: BookOpen, url: "/admin/archive", color: "text-slate-600", bg: "bg-slate-50 dark:bg-slate-950" },
    { title: "Routines", icon: Flag, url: "/admin/routines", color: "text-cyan-600", bg: "bg-cyan-50 dark:bg-cyan-950" },
    { title: "Exam Routine", icon: CalendarClock, url: "/admin/calendar", color: "text-indigo-600", bg: "bg-indigo-50 dark:bg-indigo-950" },
    { title: "Reviews", icon: PenTool, url: "/admin/reviews", color: "text-pink-600", bg: "bg-pink-50 dark:bg-pink-950" },
    { title: "Promo Codes", icon: DollarSign, url: "/admin/promo-codes", color: "text-lime-600", bg: "bg-lime-50 dark:bg-lime-950" },
    { title: "Mentors", icon: GraduationCap, url: "/admin/mentors", color: "text-indigo-600", bg: "bg-indigo-50 dark:bg-indigo-950" },
    { title: "Heroes", icon: Users, url: "/admin/heroes", color: "text-rose-600", bg: "bg-rose-50 dark:bg-rose-950" },
    { title: "Community", icon: Megaphone, url: "/admin/community", color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-950" },
    { title: "Reports", icon: Flag, url: "/admin/reports", color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950" },
    { title: "Quick Practice", icon: Zap, url: "/admin/quick-practice", color: "text-violet-500", bg: "bg-violet-50 dark:bg-violet-950" },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold tracking-tight">Dashboard Overview</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Students</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{isLoading ? "..." : stats?.students}</div>
            <p className="text-xs text-muted-foreground">Registered users</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Courses</CardTitle>
            <GraduationCap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{isLoading ? "..." : stats?.courses}</div>
            <p className="text-xs text-muted-foreground">Publicly available</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Payments</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{isLoading ? "..." : stats?.pendingPayments}</div>
            <p className="text-xs text-muted-foreground">Requires approval</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Reports</CardTitle>
            <Flag className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-red-600">{isLoading ? "..." : stats?.pendingReports}</div>
            <p className="text-xs text-muted-foreground">Unresolved questions</p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 pt-6">
           <h2 className="text-xl font-semibold tracking-tight">Quick Access</h2>
           <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
               {quickLinks.map((item, index) => (
                   <Card
                        key={index}
                        className="group hover:border-primary/50 transition-all cursor-pointer border-muted-foreground/20 relative overflow-visible"
                        onClick={() => navigate(item.url)}
                    >
                       {item.title === "Reports" && !isLoading && (stats?.pendingReports ?? 0) > 0 && (
                           <span className="absolute -top-3 -right-3 min-w-[24px] h-[24px] px-1.5 flex items-center justify-center rounded-full bg-red-600 text-white text-xs font-bold shadow-lg z-20 animate-[focus-blink_1s_ease-in-out_infinite] ring-2 ring-white dark:ring-background">
                               {stats.pendingReports}
                           </span>
                       )}
                       <CardContent className="p-4 flex flex-col items-center justify-center text-center gap-3">
                           <div className={`p-3 rounded-full ${item.bg} group-hover:scale-110 transition-transform duration-300`}>
                               <item.icon className={`h-6 w-6 ${item.color}`} />
                           </div>
                           <p className="font-medium text-sm">{item.title}</p>
                       </CardContent>
                   </Card>
               ))}
           </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
           <Card>
               <CardHeader>
                   <CardTitle className="text-base font-semibold">Recent Enrollments</CardTitle>
               </CardHeader>
               <CardContent className="space-y-4">
                   {stats?.recentEnrollments && stats.recentEnrollments.length > 0 ? (
                       stats.recentEnrollments.map((enrollment: any) => (
                           <div key={enrollment.id} className="flex justify-between items-center text-sm border-b pb-2 last:border-0 last:pb-0">
                               <div>
                                   <p className="font-medium">{enrollment.profiles?.full_name}</p>
                                   <p className="text-xs text-muted-foreground">{enrollment.courses?.name}</p>
                               </div>
                               <div className="text-right">
                                   <p className="text-xs font-mono text-muted-foreground">
                                       {new Date(enrollment.created_at).toLocaleDateString()}
                                   </p>
                                   <p className="text-[10px] text-primary cursor-pointer hover:underline" onClick={() => navigate(`/admin/student/${enrollment.profiles?.id}`)}>View Profile</p>
                               </div>
                           </div>
                       ))
                   ) : (
                       <p className="text-center py-4 text-muted-foreground text-sm">No recent enrollments found.</p>
                   )}
               </CardContent>
           </Card>
      </div>
    </div>
  );
};

export default AdminDashboardHome;
