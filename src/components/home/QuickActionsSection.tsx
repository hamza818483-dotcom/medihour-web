import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LayoutGrid, Video, FileQuestion, Zap, Timer, Star } from "lucide-react";

const scrollToId = (id: string) => {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
};

export const QuickActionsSection = () => {
  const navigate = useNavigate();

  return (
    <section className="rounded-2xl border border-border/60 bg-muted/20 px-0.5 py-2.5 sm:px-1.5 space-y-2 -mt-1">
      {/* Row 1: All Courses / Course Review */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          onClick={() => scrollToId("courses")}
          className="animate-border-chase w-full h-10 text-sm font-bold rounded-xl border-0 bg-gradient-to-r from-primary to-primary/80 hover:opacity-90 shadow-sm hover:shadow-md transition-all"
          style={{ ["--border-chase-color" as any]: "hsl(var(--primary))" }}
        >
          <LayoutGrid className="mr-2 h-4 w-4 animate-icon-float" /> All Courses
        </Button>
        <Button
          onClick={() => navigate("/reviews")}
          variant="outline"
          className="animate-border-chase w-full h-10 text-sm font-bold rounded-xl border-0 hover:bg-primary/5 transition-all"
          style={{ ["--border-chase-color" as any]: "hsl(45 93% 55%)" }}
        >
          <Star className="mr-2 h-4 w-4 animate-icon-float" style={{ animationDelay: "0.15s" }} /> Course Review
        </Button>
      </div>

      {/* Row 2: Free Class / Free Exam */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => navigate("/free-class")}
          className="animate-border-chase group flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 border-2 border-primary/30 hover:border-primary hover:bg-primary/5 transition-all"
          style={{ ["--border-chase-color" as any]: "hsl(217 91% 60%)" }}
        >
          <Video className="h-4 w-4 text-primary animate-icon-float" />
          <span className="text-sm font-semibold">Free Class</span>
        </button>
        <button
          onClick={() => navigate("/free-exam")}
          className="animate-border-chase group flex flex-col items-center justify-center gap-1 rounded-xl py-2.5 border-2 border-primary/30 hover:border-primary hover:bg-primary/5 transition-all"
          style={{ ["--border-chase-color" as any]: "hsl(0 84% 60%)" }}
        >
          <FileQuestion className="h-4 w-4 text-primary animate-icon-float" style={{ animationDelay: "0.3s" }} />
          <span className="text-sm font-semibold">Free Exam</span>
        </button>
      </div>

      {/* Row 3: Quick Practice / Focus Timer */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => navigate("/quick-practice")}
          className="animate-border-chase group flex flex-col items-center justify-center gap-1.5 rounded-xl py-2.5 bg-gradient-to-br from-violet-500/10 to-indigo-500/10 border border-violet-500/20 hover:border-violet-500/50 hover:shadow-md transition-all"
          style={{ ["--border-chase-color" as any]: "hsl(271 81% 60%)" }}
        >
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shadow-sm">
            <Zap className="h-4 w-4 text-white animate-icon-float" style={{ animationDelay: "0.6s" }} />
          </div>
          <span className="text-xs sm:text-sm font-bold text-center leading-tight px-0.5">Quick Practice</span>
        </button>
        <button
          onClick={() => navigate("/focus-timer")}
          className="animate-border-chase group flex flex-col items-center justify-center gap-1.5 rounded-xl py-2.5 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 hover:border-emerald-500/50 hover:shadow-md transition-all"
          style={{ ["--border-chase-color" as any]: "hsl(160 84% 39%)" }}
        >
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-sm">
            <Timer className="h-4 w-4 text-white animate-icon-float" style={{ animationDelay: "0.9s" }} />
          </div>
          <span className="text-xs sm:text-sm font-bold text-center leading-tight px-0.5">Focus Timer</span>
        </button>
      </div>
    </section>
  );
};
