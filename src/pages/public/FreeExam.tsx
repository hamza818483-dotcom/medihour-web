import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import PublicHeader from "@/components/PublicHeader";
import Footer from "@/components/Footer";
import { ClipboardCheck, Clock } from "lucide-react";
import { useNavigate } from "react-router-dom";

const FreeExam = () => {
  const navigate = useNavigate();

  const { data: exams, isLoading } = useQuery({
    queryKey: ["public-free-exams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exams")
        .select("id, title, duration_minutes, total_marks, free_exam_category, subject, is_published")
        .is("course_id", null)
        .eq("is_published", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">ফ্রি এক্সাম</h1>
          <p className="mt-2 text-sm text-muted-foreground">সবার জন্য উন্মুক্ত পরীক্ষা</p>
        </div>

        {isLoading ? (
          <p className="text-center text-sm text-muted-foreground">লোড হচ্ছে...</p>
        ) : !exams || exams.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">এই মুহূর্তে কোনো ফ্রি এক্সাম নেই।</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {exams.map((exam: any) => (
              <button
                key={exam.id}
                onClick={() => navigate(`/take-exam/${exam.id}`)}
                className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <ClipboardCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="line-clamp-2 font-bold leading-snug">{exam.title}</h3>
                  {exam.free_exam_category && (
                    <p className="mt-1 text-xs text-muted-foreground">{exam.free_exam_category}</p>
                  )}
                </div>
                <div className="mt-auto flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> {exam.duration_minutes} মিনিট
                  </span>
                  {exam.total_marks != null && <span>{exam.total_marks} নম্বর</span>}
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default FreeExam;
