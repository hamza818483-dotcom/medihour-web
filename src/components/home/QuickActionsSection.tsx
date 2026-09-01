import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { LayoutGrid, Video, FileQuestion, Timer, BookMarked, Star } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useEnrollments } from "@/hooks/useEnrollments";

const scrollToId = (id: string) => {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
};

export const QuickActionsSection = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: enrollments } = useEnrollments();
  const isEnrolled = !!user && (enrollments?.length ?? 0) > 0;
  const [showPaidOnlyDialog, setShowPaidOnlyDialog] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const activeBtnClass = "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground border-primary shadow-md";

  const handleRestrictedNavigate = (path: string, key: string) => {
    setActiveKey(key);
    if (isEnrolled) {
      navigate(path);
    } else {
      setShowPaidOnlyDialog(true);
    }
  };

  const handleNavigate = (path: string, key: string) => {
    setActiveKey(key);
    navigate(path);
  };

  const handleScroll = (id: string, key: string) => {
    setActiveKey(key);
    scrollToId(id);
  };

  return (
    <section className="rounded-2xl border border-white/30 bg-white/20 backdrop-blur-md px-0.5 py-2.5 sm:px-1.5 space-y-2 -mt-1 dark:border-white/10 dark:bg-white/5">
      {/* Row 1: All Courses / Course Review */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          onClick={() => handleScroll("courses", "courses")}
          className="w-full h-10 text-sm font-bold rounded-xl border-0 bg-gradient-to-r from-primary to-primary/80 hover:opacity-90 shadow-sm hover:shadow-md transition-all"
        >
          <LayoutGrid className="mr-2 h-4 w-4" /> All Courses
        </Button>
        <Button
          onClick={() => handleNavigate("/reviews", "reviews")}
          variant="outline"
          className={`w-full h-10 text-sm font-bold rounded-xl border-0 transition-all ${
            activeKey === "reviews" ? activeBtnClass : "bg-white/30 backdrop-blur-sm hover:bg-primary/10 dark:bg-white/10"
          }`}
        >
          <Star className="mr-2 h-4 w-4" /> Course Review
        </Button>
      </div>

      {/* Row 2: Free Class / Free Exam */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => handleNavigate("/free-class", "free-class")}
          className={`group flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 border-2 transition-all ${
            activeKey === "free-class" ? activeBtnClass : "border-primary/30 bg-white/20 backdrop-blur-sm hover:border-primary hover:bg-primary/10 dark:bg-white/5"
          }`}
        >
          <Video className={`h-4 w-4 ${activeKey === "free-class" ? "text-primary-foreground" : "text-primary"}`} />
          <span className="text-sm font-semibold">Free Class</span>
        </button>
        <button
          onClick={() => handleNavigate("/free-exam", "free-exam")}
          className={`group flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 border-2 transition-all ${
            activeKey === "free-exam" ? activeBtnClass : "border-primary/30 bg-white/20 backdrop-blur-sm hover:border-primary hover:bg-primary/10 dark:bg-white/5"
          }`}
        >
          <FileQuestion className={`h-4 w-4 ${activeKey === "free-exam" ? "text-primary-foreground" : "text-primary"}`} />
          <span className="text-sm font-semibold">Free Exam</span>
        </button>
      </div>

      {/* Row 3: Live Study Room / Syllabus Tracker */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => handleRestrictedNavigate("/focus-timer", "focus-timer")}
          className={`group flex flex-col items-center justify-center gap-1.5 rounded-xl py-2.5 border transition-all ${
            activeKey === "focus-timer" ? activeBtnClass : "bg-white/20 backdrop-blur-sm border-violet-500/20 hover:border-violet-500/50 hover:shadow-md dark:bg-white/5"
          }`}
        >
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shadow-sm">
            <Timer className="h-4 w-4 text-white" />
          </div>
          <span className="text-xs sm:text-sm font-bold text-center leading-tight px-0.5">Live Study Room</span>
        </button>
        <button
          onClick={() => handleRestrictedNavigate("/syllabus-tracker", "syllabus-tracker")}
          className={`group flex flex-col items-center justify-center gap-1.5 rounded-xl py-2.5 border transition-all ${
            activeKey === "syllabus-tracker" ? activeBtnClass : "bg-white/20 backdrop-blur-sm border-emerald-500/20 hover:border-emerald-500/50 hover:shadow-md dark:bg-white/5"
          }`}
        >
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-sm">
            <BookMarked className="h-4 w-4 text-white" />
          </div>
          <span className="text-xs sm:text-sm font-bold text-center leading-tight px-0.5">Syllabus Tracker</span>
        </button>
      </div>

      <AlertDialog open={showPaidOnlyDialog} onOpenChange={setShowPaidOnlyDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Paid Batch Feature</AlertDialogTitle>
            <AlertDialogDescription>
              এটি শুধুমাত্র পেইড ব্যাচের স্টুডেন্টদের জন্য। এই ফিচার ব্যবহার করতে হলে কোর্সে ভর্তি হতে হবে।
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => scrollToId("courses")}>কোর্সে ভর্তি হও</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
};
