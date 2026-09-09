import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { openPlainSolvePdf, generatePlainSolvePdfHtml } from "@/lib/solvePdf";
import { useToast } from "@/hooks/use-toast";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ResultCard = ({ attempt, isLive, navigate, profile }: { attempt: any, isLive: boolean, navigate: any, profile: any }) => {
    let gpaScore = 0;
    if (profile?.ssc_gpa && profile?.hsc_gpa) {
        gpaScore = (Number(profile.ssc_gpa) * 8) + (Number(profile.hsc_gpa) * 12);
    }
    const totalScoreWithGpa = Number(attempt.score) + gpaScore;
    const percentage = attempt.exam.total_marks > 0 ? ((Number(attempt.score) / Number(attempt.exam.total_marks)) * 100).toFixed(1) : null;

    const { toast } = useToast();
    const [pdfLoading, setPdfLoading] = useState(false);

    const handleSheetPdf = async () => {
        const pdfWindow = window.open("", "_blank");
        setPdfLoading(true);
        try {
            const { data, error } = await supabase
                .from("exam_questions")
                .select("question_text, option_a, option_b, option_c, option_d, option_e, correct_option, explanation")
                .eq("exam_id", attempt.exam.id)
                .order("question_index", { ascending: true });
            if (error) throw error;
            if (!data || data.length === 0) {
                toast({ title: "কোনো প্রশ্ন পাওয়া যায়নি", variant: "destructive" });
                pdfWindow?.close();
                return;
            }
            const userAnswers = (attempt.answers as any[]) || [];
            const html = generatePlainSolvePdfHtml({
                examName: attempt.exam.title,
                questions: data.map((q: any, idx: number) => ({
                    question_text: q.question_text,
                    option_a: q.option_a,
                    option_b: q.option_b,
                    option_c: q.option_c,
                    option_d: q.option_d,
                    option_e: q.option_e,
                    correct_option: q.correct_option,
                    user_answer: userAnswers[idx]?.selected_option || null,
                    explanation: q.explanation,
                })),
                totalMarks: data.length,
            });
            if (pdfWindow) {
                pdfWindow.document.open();
                pdfWindow.document.write(html);
                pdfWindow.document.close();
            } else {
                openPlainSolvePdf({
                    examName: attempt.exam.title,
                    questions: data.map((q: any, idx: number) => ({
                        question_text: q.question_text,
                        option_a: q.option_a,
                        option_b: q.option_b,
                        option_c: q.option_c,
                        option_d: q.option_d,
                        option_e: q.option_e,
                        correct_option: q.correct_option,
                        user_answer: userAnswers[idx]?.selected_option || null,
                        explanation: q.explanation,
                    })),
                    totalMarks: data.length,
                });
            }
        } catch (e: any) {
            pdfWindow?.close();
            toast({ title: "PDF তৈরি করা যায়নি", description: e.message, variant: "destructive" });
        } finally {
            setPdfLoading(false);
        }
    };

    return (
    <Card className="border rounded-2xl shadow-md hover:shadow-lg transition-all flex flex-col h-full border-emerald-100 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900">
        <CardHeader className="space-y-0.5 p-3 pb-2">
            <div className="flex justify-between items-start gap-2">
                <p className="text-[10px] font-mono uppercase text-muted-foreground truncate">
                    {attempt.exam.course?.name || "Public Exam"}
                </p>
                <div className="flex items-center gap-1 shrink-0">
                    {isLive && <span className="text-[9px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-bold">LIVE</span>}
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-1.5 text-[9px] bg-blue-500 hover:bg-blue-600 text-white hover:text-white border-none"
                        disabled={pdfLoading}
                        onClick={handleSheetPdf}
                    >
                        {pdfLoading ? "..." : "Practice Sheet"}
                    </Button>
                </div>
            </div>
            <CardTitle className="text-sm leading-tight">{attempt.exam.title}</CardTitle>
            <CardDescription className="text-[11px] leading-snug">
                <div>Score: <span className="font-bold text-foreground">{attempt.score}</span> / {attempt.exam.total_marks} {percentage && <span className="text-muted-foreground">({percentage}%)</span>}</div>
                {gpaScore > 0 && <div>With GPA: <span className="font-bold text-primary">{totalScoreWithGpa.toFixed(2)}</span></div>}
                <div className="text-muted-foreground">{attempt.submitted_at && new Date(attempt.submitted_at).toLocaleDateString()}</div>
            </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col flex-1 p-3 pt-0">
            <div className={`grid gap-1.5 mt-auto ${attempt.exam.chapter === "Custom" ? "grid-cols-2" : "grid-cols-3"}`}>
                <Button
                    size="sm"
                    className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white border-none text-[10px] h-8 px-1 leading-tight whitespace-pre-line"
                    onClick={() => navigate(`/dashboard/exam-review/${attempt.id}`)}
                >
                    Your Result
                </Button>
                <Button
                    size="sm"
                    className="rounded-lg bg-blue-600 hover:bg-blue-700 text-white border-none text-[10px] h-8 px-1 leading-tight whitespace-pre-line"
                    onClick={() => navigate(`/dashboard/take-exam/${attempt.exam.id}`)}
                >
                    Practice Again
                </Button>

                {attempt.exam.chapter !== "Custom" && (
                    <Button
                        size="sm"
                        onClick={() => navigate(`/dashboard/leaderboard/${attempt.exam.id}`)}
                        className="rounded-lg bg-purple-600 hover:bg-purple-700 text-white border-none text-[10px] h-8 px-1 leading-tight whitespace-pre-line"
                    >
                        Leaderboard
                    </Button>
                )}
            </div>
        </CardContent>
    </Card>
    );
};

const ExamResults = () => {
  const [section, setSectionState] = useState<"exam" | "class">(
    () => (sessionStorage.getItem("examHistorySection") as any) || "exam"
  );
  const setSection = (s: "exam" | "class") => {
    setSectionState(s);
    sessionStorage.setItem("examHistorySection", s);
  };
  const [classCategory, setClassCategoryState] = useState<"live" | "recorded" | "archive">(
    () => (sessionStorage.getItem("classHistoryCategory") as any) || "recorded"
  );
  const setClassCategory = (c: "live" | "recorded" | "archive") => {
    setClassCategoryState(c);
    sessionStorage.setItem("classHistoryCategory", c);
  };
  const [category, setCategoryState] = useState<"all" | "live" | "practice">(
    () => (sessionStorage.getItem("examHistoryCategory") as any) || "all"
  );
  const setCategory = (c: "all" | "live" | "practice") => {
    setCategoryState(c);
    sessionStorage.setItem("examHistoryCategory", c);
  };
  const { user, profile } = useAuth();
  const navigate = useNavigate();

  // --- CLASS HISTORY ---
  const { data: classHistoryData, isLoading: classHistoryLoading } = useQuery({
    queryKey: ["class-history", classCategory],
    queryFn: async () => {
      const now = new Date().toISOString();
      let query = supabase.from("classes").select("*, course:courses(name)");

      if (classCategory === "live") {
        query = query.eq("class_type", "live").or(`end_at.gt.${now},end_at.is.null`).not("is_archive", "is", true);
      } else if (classCategory === "recorded") {
        query = query
          .or(`class_type.eq.recorded,and(class_type.eq.live,end_at.lt.${now})`)
          .not("is_archive", "is", true);
      } else {
        query = query.eq("is_archive", true);
      }

      query = query.order("start_at", { ascending: classCategory === "live" }).limit(200);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: section === "class",
  });

  useEffect(() => {
    document.title = "Exam History – Atlas";
  }, []);

  const { data: attempts, isLoading } = useQuery({
    queryKey: ["exam-results", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("exam_attempts")
        .select("*, exam:exams(*, course:courses(*))")
        .eq("profile_id", user.id)
        .order("submitted_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const categorize = (attempt: any) => {
    const exam = attempt.exam;
    if (!exam) return "practice";
    // If the student actually attempted this live exam, it stays "Live" in
    // their history regardless of whether the window has since expired —
    // "Practice" is only for live exams they never attended (missed).
    if (exam.exam_type === "live") return "live";
    return "practice";
  };

  const filteredAttempts = (attempts || []).filter(a => {
    const cat = categorize(a);
    if (category === "all") return true;
    return cat === category;
  });

  const isLoadingAny = isLoading;

  return (
    <div className="w-full px-0.5 py-3 space-y-3">
      <header className="space-y-0.5 px-1">
        <h1 className="text-lg font-bold leading-tight">{section === "exam" ? "Exam History" : "Class History"}</h1>
        <p className="text-xs text-muted-foreground">
          {section === "exam" ? "Review your scores and answer scripts." : "Review your live, recorded, and archived classes."}
        </p>
      </header>

      {/* Top-level section toggle: Exam History / Class History */}
      <div className="grid grid-cols-2 gap-1.5 px-1">
        <Button
          size="sm"
          variant={section === "exam" ? "default" : "outline"}
          className="h-8 text-xs"
          onClick={() => setSection("exam")}
        >
          Exam History
        </Button>
        <Button
          size="sm"
          variant={section === "class" ? "default" : "outline"}
          className="h-8 text-xs"
          onClick={() => setSection("class")}
        >
          Class History
        </Button>
      </div>

      {section === "class" ? (
        <div className="space-y-3">
          {/* Class category row */}
          <div className="flex flex-nowrap gap-1.5 px-1 overflow-x-auto no-scrollbar">
            {([
              { key: "live", label: "Live" },
              { key: "recorded", label: "Recorded" },
              { key: "archive", label: "Archive" },
            ] as const).map(c => (
              <Button
                key={c.key}
                size="sm"
                variant={classCategory === c.key ? "default" : "outline"}
                className="h-7 px-2.5 text-xs shrink-0"
                onClick={() => setClassCategory(c.key)}
              >
                {c.label}
              </Button>
            ))}
          </div>

          {classHistoryLoading ? (
            <div className="text-center py-12 text-muted-foreground text-sm">Loading...</div>
          ) : !classHistoryData || classHistoryData.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">No classes found in this category.</div>
          ) : (
            <div className="space-y-2 px-1">
              {classHistoryData.map((cls: any) => {
                const startDate = cls.start_at ? new Date(cls.start_at) : null;
                const dateStr = startDate ? startDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";
                const timeStr = startDate ? startDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "";
                const durationMin = cls.start_at && cls.end_at
                  ? Math.max(0, Math.round((new Date(cls.end_at).getTime() - new Date(cls.start_at).getTime()) / 60000))
                  : null;
                return (
                  <Card key={cls.id}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold leading-tight truncate">{cls.title}</p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {cls.course?.name && <span>{cls.course.name} · </span>}
                          {dateStr}{timeStr && ` · ${timeStr}`}{durationMin !== null && ` · ${durationMin} min`}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        <Button size="sm" className="h-7 text-xs px-2.5" onClick={() => navigate(`/dashboard/class/${cls.id}`)}>
                          Rewatch
                        </Button>
                        {cls.notes_url && (
                          <a href={cls.notes_url} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="outline" className="h-7 text-xs px-2.5 w-full">
                              Class Note
                            </Button>
                          </a>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ) : (
      <>
      {/* Category Row */}
      <div className="flex flex-nowrap gap-1.5 px-1 overflow-x-auto no-scrollbar">
        {([
          { key: "all", label: "All" },
          { key: "live", label: "Live Exam" },
          { key: "practice", label: "Practice Exam" },
        ] as const).map(c => (
          <Button
            key={c.key}
            size="sm"
            variant={category === c.key ? "default" : "outline"}
            className="h-7 px-2.5 text-xs shrink-0"
            onClick={() => setCategory(category === c.key ? "all" : c.key)}
          >
            {c.label}
          </Button>
        ))}
      </div>

      {isLoadingAny ? (
        <div className="text-sm text-muted-foreground px-1">Loading...</div>
      ) : filteredAttempts.length === 0 ? (
        <Card className="border border-foreground/50 mx-1">
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            No exam results found.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 px-0.5">
          {filteredAttempts.map((attempt) => (
            <ResultCard
              key={attempt.id}
              attempt={attempt}
              isLive={categorize(attempt) === "live"}
              navigate={navigate}
              profile={profile}
            />
          ))}
        </div>
      )}
      </>
      )}
    </div>
  );
};

export default ExamResults;
