import { useNavigate } from "react-router-dom";
import { LayoutGrid, Video, FileQuestion, Zap, Timer, Star } from "lucide-react";

const scrollToId = (id: string) => {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
};

const glassCard =
  "group flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/30 bg-white/20 backdrop-blur-md shadow-sm hover:shadow-lg hover:bg-white/30 transition-all aspect-video w-full dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10";

export const QuickActionsSection = () => {
  const navigate = useNavigate();

  const actions = [
    { label: "All Courses", icon: LayoutGrid, onClick: () => scrollToId("courses") },
    { label: "Course Review", icon: Star, onClick: () => navigate("/reviews") },
    { label: "Free Class", icon: Video, onClick: () => navigate("/free-class") },
    { label: "Free Exam", icon: FileQuestion, onClick: () => navigate("/free-exam") },
    { label: "Quick Practice", icon: Zap, onClick: () => navigate("/quick-practice") },
    { label: "Focus Timer", icon: Timer, onClick: () => navigate("/focus-timer") },
  ];

  return (
    <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {actions.map(({ label, icon: Icon, onClick }) => (
        <button key={label} onClick={onClick} className={glassCard}>
          <Icon className="h-7 w-7 text-primary" />
          <span className="text-sm font-bold text-center">{label}</span>
        </button>
      ))}
    </section>
  );
};
