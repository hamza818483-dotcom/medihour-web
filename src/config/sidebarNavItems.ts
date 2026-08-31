import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Send,
  CalendarClock,
  CalendarRange,
  FileText,
  GraduationCap,
  ListChecks,
  Megaphone,
  Settings2,
  User,
  Users,
  ClipboardList,
  CreditCard,
  Bookmark,
  Sparkles,
  StickyNote,
  PenTool,
  LayoutTemplate,
  Tag,
  AlertCircle,
  Archive,
  Database,
  Flag,
  Zap,
  BarChart3,
  Infinity,
  Trophy,
  LayoutDashboard,
} from "lucide-react";

export interface SidebarNavItem {
  title: string;
  url: string;
  icon: LucideIcon;
  color?: string;
  hasDot?: boolean;
}

export interface AdminSidebarNavItem extends SidebarNavItem {
  roles: ("admin" | "teacher")[];
}

export const studentItems: SidebarNavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, color: "text-blue-500" },
  { title: "My Courses", url: "/dashboard/my-courses", icon: GraduationCap, color: "text-indigo-500" },
  { title: "Extra Courses", url: "/dashboard/extra-courses", icon: GraduationCap, color: "text-fuchsia-500" },
  { title: "Routine", url: "/dashboard/routine", icon: CalendarClock, color: "text-indigo-500" },
  { title: "Profile", url: "/dashboard/profile", icon: User, color: "text-green-500" },
  { title: "Live Class", url: "/dashboard/live-class", icon: CalendarClock, color: "text-red-500" },
  { title: "Live Exam", url: "/dashboard/live-exam", icon: ListChecks, color: "text-purple-500" },
  { title: "Record Class", url: "/dashboard/recordings", icon: BookOpen, color: "text-orange-500" },
  { title: "Past Exams", url: "/dashboard/past-exam", icon: FileText, color: "text-yellow-500" },
  { title: "Quick Practice", url: "/quick-practice", icon: Zap, color: "text-violet-500" },
  { title: "Study Tracker", url: "/syllabus-tracker", icon: BarChart3, color: "text-sky-600" },
  { title: "Archive Class & Exam", url: "/dashboard/archive", icon: Archive, color: "text-gray-500" },
  { title: "Class & Exam History", url: "/dashboard/results", icon: ClipboardList, color: "text-teal-500" },
  { title: "My Progress & History", url: "/dashboard/my-progress", icon: BarChart3, color: "text-blue-600" },
  { title: "Top Performer", url: "/dashboard/top-performer", icon: Trophy, color: "text-yellow-500" },
  { title: "My Mistakes", url: "/dashboard/my-mistakes", icon: AlertCircle, color: "text-red-600" },
  { title: "Class Notes", url: "/dashboard/class-notes", icon: StickyNote, color: "text-pink-500" },
  { title: "Notice", url: "/dashboard/announcements", icon: Megaphone, hasDot: true, color: "text-rose-500" },
  { title: "Bookmarks", url: "/dashboard/bookmarks", icon: Bookmark, color: "text-emerald-500" },
  { title: "FB & Telegram Group", url: "/dashboard/community", icon: Users, color: "text-cyan-500" },
  { title: "Exam Analytics", url: "/dashboard/analytics", icon: Settings2, color: "text-slate-500" },
  { title: "Exam Routine", url: "/dashboard/calendar", icon: CalendarClock, color: "text-indigo-500" },
];

export const adminItems: AdminSidebarNavItem[] = [
  { title: "Overview", url: "/admin", icon: LayoutDashboard, roles: ["admin", "teacher"], color: "text-blue-600" },
  { title: "Courses", url: "/admin/courses", icon: GraduationCap, roles: ["admin"], color: "text-green-600" },
  { title: "Students", url: "/admin/students", icon: Users, roles: ["admin"], color: "text-purple-600" },
  { title: "Class Schedule", url: "/admin/classes", icon: CalendarClock, roles: ["admin", "teacher"], color: "text-red-600" },
  { title: "Routine Manager", url: "/admin/routines", icon: CalendarClock, roles: ["admin", "teacher"], color: "text-indigo-600" },
  { title: "Exams", url: "/admin/exams", icon: ListChecks, roles: ["admin", "teacher"], color: "text-orange-600" },
  { title: "Content Creator", url: "/admin/content-creator", icon: StickyNote, roles: ["admin", "teacher"], color: "text-teal-600" },
  { title: "Question Bank", url: "/admin/question-bank", icon: Database, roles: ["admin", "teacher"], color: "text-blue-500" },
  { title: "Notice", url: "/admin/announcements", icon: Megaphone, roles: ["admin", "teacher"], color: "text-yellow-600" },
  { title: "Community Manager", url: "/admin/community", icon: Users, roles: ["admin", "teacher"], color: "text-teal-600" },
  { title: "Notes Manager", url: "/admin/notes", icon: StickyNote, roles: ["admin", "teacher"], color: "text-pink-600" },
  { title: "Archive Manager", url: "/admin/archive", icon: BookOpen, roles: ["admin", "teacher"], color: "text-purple-500" },
  { title: "Exam Routine Manager", url: "/admin/calendar", icon: CalendarRange, roles: ["admin", "teacher"], color: "text-rose-500" },
  { title: "Free Manager", url: "/admin/free-content", icon: StickyNote, roles: ["admin"], color: "text-indigo-500" },
  { title: "Payments", url: "/admin/payments", icon: CreditCard, roles: ["admin"], color: "text-emerald-600" },
  { title: "Promo Codes", url: "/admin/promos", icon: Tag, roles: ["admin"], color: "text-cyan-600" },
  { title: "Site Heroes", url: "/admin/heroes", icon: LayoutTemplate, roles: ["admin"], color: "text-indigo-600" },
  { title: "Mentors/Founders", url: "/admin/mentors", icon: PenTool, roles: ["admin"], color: "text-violet-600" },
  { title: "Reviews", url: "/admin/reviews", icon: Megaphone, roles: ["admin"], color: "text-pink-600" },
  { title: "Quick Practice", url: "/admin/quick-practice", icon: Zap, roles: ["admin", "teacher"], color: "text-violet-500" },
  { title: "Study Tracker", url: "/admin/syllabus-tracker", icon: BarChart3, roles: ["admin", "teacher"], color: "text-sky-600" },
  { title: "Telegram Channels", url: "/admin/telegram-channels", icon: Send, roles: ["admin"], color: "text-blue-500" },
  { title: "Reports", url: "/admin/reports", icon: Flag, roles: ["admin", "teacher"], color: "text-red-500" },
];
