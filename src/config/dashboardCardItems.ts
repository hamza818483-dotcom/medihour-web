import type { LucideIcon } from "lucide-react";
import {
  ListChecks,
  Infinity,
  Video,
  BookOpen,
  History,
  Trophy,
  AlertCircle,
  Files,
  Bookmark,
  Sparkles,
  CalendarClock,
  User,
} from "lucide-react";

export interface QuickAccessItem {
  title: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  url: string;
  isExternal?: boolean;
}

// "Quick Access" grid shown on the student dashboard home page. Order can be
// overridden per-admin-setting via `quickAccessOrder` (see DashboardHome.tsx),
// this is just the base/default set and their destinations.
export const quickAccessItems: QuickAccessItem[] = [
  { title: "Live Exam", icon: ListChecks, color: "text-red-500", bg: "bg-red-50 dark:bg-red-950", url: "/dashboard/live-exam" },
  { title: "Live Class", icon: Video, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-950", url: "/dashboard/live-class" },
  { title: "My Courses", icon: BookOpen, color: "text-indigo-500", bg: "bg-indigo-50 dark:bg-indigo-950", url: "/dashboard/my-courses" },
  { title: "Record Class", icon: History, color: "text-purple-500", bg: "bg-purple-50 dark:bg-purple-950", url: "/dashboard/recordings" },
  { title: "Past Exams", icon: BookOpen, color: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-950", url: "/dashboard/past-exam" },
  { title: "Archive Class & Exam", icon: History, color: "text-gray-500", bg: "bg-gray-50 dark:bg-gray-950", url: "/dashboard/archive" },
  { title: "Class & Exam History", icon: Trophy, color: "text-yellow-500", bg: "bg-yellow-50 dark:bg-yellow-950", url: "/dashboard/results" },
  { title: "My Mistakes", icon: AlertCircle, color: "text-red-600", bg: "bg-red-50 dark:bg-red-950", url: "/dashboard/my-mistakes" },
  { title: "FB & Telegram Group", icon: Files, color: "text-cyan-500", bg: "bg-cyan-50 dark:bg-cyan-950", url: "/dashboard/community" },
  { title: "Bookmarks", icon: Bookmark, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-950", url: "/dashboard/bookmarks" },
  { title: "Exam Routine", icon: CalendarClock, color: "text-indigo-500", bg: "bg-indigo-50 dark:bg-indigo-950", url: "/dashboard/calendar" },
  { title: "Profile", icon: User, color: "text-slate-500", bg: "bg-slate-50 dark:bg-slate-950", url: "/dashboard/profile" },
];

// -----------------------------------------------------------------------
// Smart Tracking row (My Progress & History / Study Tracker / Top Performer)
// and Best Practice Tool row (Quick Practice / Unlimited Mock Test / Readymade
// Exam) destinations, for reference. These are rendered with more custom
// per-card styling directly in DashboardHome.tsx (icons, colors, click
// handlers), so they are documented here as plain route data rather than
// imported, to avoid disturbing their existing bespoke JSX.
// -----------------------------------------------------------------------
export const smartTrackingRoutes = {
  myProgressAndHistory: "/dashboard/my-progress",
  studyTracker: "/syllabus-tracker",
  topPerformer: "/dashboard/top-performer",
} as const;

export const bestPracticeToolRoutes = {
  quickPractice: "/quick-practice",
  unlimitedMockTest: "/mock-test",
  readymadeExam: "/dashboard/readymade",
} as const;

// Admin-only quick action cards on the dashboard (Reports / Notice / Study
// Tracker admin / Quick Practice admin / Mock Test admin). Documented here
// for reference; also rendered with custom JSX in DashboardHome.tsx.
export const adminQuickActionRoutes = {
  reports: "/admin/reports",
  notice: "/admin/announcements",
  studyTrackerAdmin: "/admin/syllabus-tracker",
  quickPracticeAdmin: "/admin/quick-practice",
  mockTestAdmin: "/admin/mock-test",
} as const;
