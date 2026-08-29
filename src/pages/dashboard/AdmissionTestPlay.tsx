import { useState, useEffect, useMemo, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Loader2, Clock, Check, X, ArrowLeft, LayoutGrid, Lock, Calculator, AlertTriangle, Repeat, FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { cn } from "@/lib/utils";
import MathText from "@/components/MathText";
import { openSolvePdf } from "@/lib/solvePdf";

type Mode = "subject_final" | "paper_final" | "full_model";

interface Q {
  id: string;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  option_e?: string | null;
  correct_option: string;
  marks: number;
  explanation?: string | null;
  _sliceLabel?: string;
}

export default function AdmissionTestPlay() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const mode = params.get("mode") as Mode;
  const refId = params.get("refId");
  const testId = params.get("testId")!;

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [isNavigatorOpen, setIsNavigatorOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "correct" | "incorrect" | "skipped">("all");
  const questionRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  const autoSubmitTriggered = useRef(false);

  useEffect(() => { window.scrollTo(0, 0); }, []);

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from("profiles")
        .select("is_second_timer, ssc_gpa, hsc_gpa")
        .eq("id", user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: test } = useQuery({
    queryKey: ["admission-test-single", testId],
    queryFn: async () => {
      const { data, error } = await supabase.from("admission_tests" as any).select("*").eq("id", testId).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: questions, isLoading } = useQuery({
    queryKey: ["admission-test-questions", mode, refId, testId],
    queryFn: async () => {
      if (mode === "subject_final") {
        const { data, error } = await supabase.rpc("get_admission_subject_questions" as any, { p_subject_id: refId });
        if (error) throw error;
        return (data || []) as Q[];
      }
      if (mode === "paper_final") {
        const { data, error } = await supabase.rpc("get_admission_paper_questions" as any, { p_paper_id: refId });
        if (error) throw error;
        return (data || []) as Q[];
      }
      const { data, error } = await supabase.rpc("get_admission_full_model_questions" as any, { p_admission_test_id: testId });
      if (error) throw error;
      return ((data || []) as any[]).map((row) => ({ ...row.question, _sliceLabel: row.slice_subject_name })) as Q[];
    },
    enabled: !!testId && (mode === "full_model" || !!refId),
  });

  useEffect(() => {
    if (test?.duration_minutes && secondsLeft === null) {
      setSecondsLeft(test.duration_minutes * 60);
    }
  }, [test, secondsLeft]);

  const results = useMemo(() => {
    if (!questions) return null;
    let correct = 0, wrong = 0, skipped = 0, score = 0;
    const negPerQ = Number(test?.negative_mark_per_question || 0);
    for (const q of questions) {
      const sel = answers[q.id];
      const perQMark = Number(q.marks) || 1;
      if (!sel) { skipped++; continue; }
      if (sel.toUpperCase() === String(q.correct_option).toUpperCase()) { correct++; score += perQMark; }
      else { wrong++; score -= negPerQ; }
    }
    // 2nd Timer: flat 3% deduction of the test's total MCQ marks (not raw score)
    const totalMarks = questions.reduce((s, q) => s + (Number(q.marks) || 1), 0);
    const secondTimerDeduction = profile?.is_second_timer ? totalMarks * 0.03 : 0;
    score -= secondTimerDeduction;
    return { correct, wrong, skipped, score, total: questions.length, secondTimerDeduction };
  }, [questions, answers, test, profile]);

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!questions) return;
      await supabase.from("admission_test_attempts" as any).insert({
        admission_test_id: testId,
        profile_id: user?.id,
        mode,
        ref_id: refId || null,
        ref_name: mode === "full_model" ? "Full Model Test" : (questions[0] as any)?._sliceLabel || null,
        question_ids: questions.map((q) => q.id),
        answers,
        score: results?.score ?? 0,
        total_marks: questions.reduce((s, q) => s + (Number(q.marks) || 1), 0),
        correct_count: results?.correct ?? 0,
        wrong_count: results?.wrong ?? 0,
        skipped_count: results?.skipped ?? 0,
        submitted_at: new Date().toISOString(),
      });
    },
    onSuccess: () => setSubmitted(true),
  });

  useEffect(() => {
    if (submitted || secondsLeft === null) return;
    if (secondsLeft <= 0) {
      if (!autoSubmitTriggered.current) {
        autoSubmitTriggered.current = true;
        submitMutation.mutate();
      }
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => (s !== null ? s - 1 : s)), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, submitted]);

  const scrollToQuestion = (index: number) => {
    const qId = questions?.[index]?.id;
    if (qId && questionRefs.current[qId]) {
      questionRefs.current[qId]?.scrollIntoView({ behavior: "smooth", block: "center" });
      setIsNavigatorOpen(false);
    }
  };

  const scrollToNextUnanswered = (currentQuestionId: string, latestAnswers: Record<string, string>) => {
    const list = questions;
    if (!list || list.length === 0) return;
    const currentIndex = list.findIndex((q) => q.id === currentQuestionId);
    if (currentIndex === -1) return;
    let targetId: string | null = null;
    for (let i = currentIndex + 1; i < list.length; i++) {
      if (!latestAnswers[list[i].id]) { targetId = list[i].id; break; }
    }
    if (!targetId) {
      for (let i = 0; i < currentIndex; i++) {
        if (!latestAnswers[list[i].id]) { targetId = list[i].id; break; }
      }
    }
    if (!targetId) return;
    const finalTargetId = targetId;
    setTimeout(() => {
      requestAnimationFrame(() => {
        questionRefs.current[finalTargetId]?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }, 250);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  if (isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  if (!questions || questions.length === 0) {
    return (
      <div className="text-center py-20 space-y-3">
        <p className="text-muted-foreground">কোনো প্রশ্ন পাওয়া যায়নি। Admin কে source সেট করতে বলুন।</p>
        <Button variant="outline" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
      </div>
    );
  }

  if (submitted && results) {
    const totalMarks = questions.reduce((s, q) => s + (Number(q.marks) || 1), 0);
    const correctMarks = questions.reduce((sum, q) => {
      const sel = answers[q.id];
      const isCorrect = sel && sel.toUpperCase() === String(q.correct_option).toUpperCase();
      return isCorrect ? sum + (Number(q.marks) || 1) : sum;
    }, 0);
    const negativeMarks = results.wrong * Number(test?.negative_mark_per_question || 0);
    const rawScore = correctMarks - negativeMarks;
    const finalScore = results.score;
    const deduction = Math.max(0, rawScore - finalScore);

    // GPA Calculation (Without GPA / With GPA) — same formula as ExamReview
    const sscGpa = Number(profile?.ssc_gpa) || 0;
    const hscGpa = Number(profile?.hsc_gpa) || 0;
    const gpaScore = (sscGpa * 8) + (hscGpa * 12);
    const gpaDeduction = 100 - gpaScore;
    const withGpaScore = finalScore + gpaScore;
    const withGpaTotalMarks = totalMarks + 100;
    const mainExamScoreDisplay = gpaScore > 0 ? finalScore - gpaDeduction : finalScore;

    const pieTotal = results.correct + results.wrong + results.skipped;
    const pieData = [
      { name: "Correct", value: results.correct, color: "#16a34a" },
      { name: "Wrong", value: results.wrong, color: "#ef4444" },
      { name: "Skipped", value: results.skipped, color: "#94a3b8" },
    ].filter((d) => d.value > 0).map((d) => ({ ...d, percent: pieTotal > 0 ? (d.value / pieTotal) * 100 : 0 }));

    const filteredQuestions = questions.filter((q) => {
      const sel = answers[q.id];
      const isCorrect = sel && sel.toUpperCase() === String(q.correct_option).toUpperCase();
      if (filter === "all") return true;
      if (filter === "correct") return isCorrect;
      if (filter === "incorrect") return sel && !isCorrect;
      if (filter === "skipped") return !sel;
      return true;
    });

    const handlePracticeAgain = () => {
      navigate(`/dashboard/admission-test/play?mode=${mode}&refId=${refId || ""}&testId=${testId}`);
      window.location.reload();
    };

    const handleSolvePdf = () => {
      openSolvePdf({
        examName: test?.title || "Admission Test",
        questions: questions.map((q) => ({
          question_text: q.question_text,
          option_a: q.option_a,
          option_b: q.option_b,
          option_c: q.option_c,
          option_d: q.option_d,
          option_e: q.option_e || undefined,
          correct_option: q.correct_option,
          user_answer: answers[q.id] || null,
          explanation: q.explanation || undefined,
        })),
        totalMarks,
        score: finalScore,
        style: "style1",
      });
    };

    return (
      <div className="min-h-screen bg-background font-sans pb-20 -mt-4">
        <div className="container max-w-4xl mx-auto px-[5px] pt-0 pb-2 md:pt-0 md:pb-6 md:px-6 space-y-2 overflow-x-hidden">
          <div className="flex flex-col gap-1">
            <Button variant="ghost" onClick={() => navigate("/dashboard/admission-test")} className="pl-0 h-7 self-start">
              <ArrowLeft className="h-4 w-4 mr-1.5" /> Back
            </Button>
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2">
              <Button variant="outline" onClick={handlePracticeAgain} className="h-10 px-3 py-2 w-full sm:w-auto">
                <Repeat className="h-5 w-5 mr-1.5 text-primary shrink-0" /> <span className="truncate">Practice Again</span>
              </Button>
              <Button variant="outline" onClick={handleSolvePdf} className="h-10 px-3 py-2 w-full sm:w-auto">
                <FileDown className="h-5 w-5 mr-1.5 text-blue-500 shrink-0" /> <span className="truncate">Solve PDF</span>
              </Button>
            </div>
          </div>

          {/* Score Card */}
          <Card className="bg-primary/5 border-primary/20">
            <CardContent className="px-2 py-3 md:p-4">
              <div className="flex flex-col md:flex-row justify-between items-center gap-2 md:gap-6">
                <div className="text-center md:text-left w-full md:w-auto pb-2 md:pb-0 border-b md:border-b-0 md:border-r border-border/60 md:pr-4">
                  <h1 className="text-2xl font-extrabold mb-0.5">{test?.title || "Admission Test"}</h1>
                  <p className="text-xs text-muted-foreground">Submitted just now</p>
                </div>

                <div className="flex-1 flex flex-row items-center justify-center gap-2 md:gap-6 w-full pb-2 md:pb-0 border-b md:border-b-0 md:border-r border-border/60 md:pr-4 overflow-x-hidden">
                  <div className="text-center flex-shrink min-w-0 pr-2 md:pr-4 border-r-2 border-border">
                    <div className="text-3xl md:text-4xl font-extrabold text-primary whitespace-nowrap">
                      {results.score.toFixed(2)}
                      <span className="text-3xl md:text-4xl text-muted-foreground font-extrabold"> / {totalMarks}</span>
                    </div>
                    <div className="text-[10px] uppercase font-bold text-muted-foreground mt-0.5">Marks Obtained</div>
                  </div>

                  <div className="shrink-0" style={{ height: 130, width: 155, minWidth: 155 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart margin={{ top: 10, right: 8, bottom: 10, left: 0 }}>
                        <Pie
                          data={pieData}
                          cx="30%"
                          cy="50%"
                          innerRadius={24}
                          outerRadius={38}
                          paddingAngle={2}
                          dataKey="value"
                          isAnimationActive={false}
                          label={({ cx, cy, midAngle, outerRadius: r, index }) => {
                            const RAD = Math.PI / 180;
                            const sx = cx + r * Math.cos(-midAngle * RAD);
                            const sy = cy + r * Math.sin(-midAngle * RAD);
                            const labelY = cy + (index - (pieData.length - 1) / 2) * 20;
                            const ex = cx + r + 20;
                            return (
                              <g>
                                <polyline points={`${sx},${sy} ${ex},${labelY}`} stroke="#94a3b8" fill="none" />
                                <text x={ex + 4} y={labelY} textAnchor="start" dominantBaseline="central" fontSize={12} fill={pieData[index as number]?.color}>
                                  {`${Math.round(pieData[index as number]?.percent ?? 0)}%`}
                                </text>
                              </g>
                            );
                          }}
                          minAngle={18}
                          labelLine={false}
                        >
                          {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number, name: string) => [`${value} (${pieTotal > 0 ? Math.round((value / pieTotal) * 100) : 0}%)`, name]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="flex gap-2 justify-between w-full md:w-auto md:flex-col md:gap-1.5 text-center">
                  <div className="flex-1 border rounded-lg p-1.5 flex flex-row md:flex-col items-center justify-center gap-2 bg-background/50 md:bg-transparent md:border-0 md:p-0">
                    <div className="text-[10px] uppercase font-bold text-muted-foreground order-1 md:order-2">Correct</div>
                    <div className="text-lg font-bold text-green-600 order-2 md:order-1">{results.correct}</div>
                  </div>
                  <div className="flex-1 border rounded-lg p-1.5 flex flex-row md:flex-col items-center justify-center gap-2 bg-background/50 md:bg-transparent md:border-0 md:p-0">
                    <div className="text-[10px] uppercase font-bold text-muted-foreground order-1 md:order-2">Wrong</div>
                    <div className="text-lg font-bold text-red-500 order-2 md:order-1">{results.wrong}</div>
                  </div>
                  <div className="flex-1 border rounded-lg p-1.5 flex flex-row md:flex-col items-center justify-center gap-2 bg-background/50 md:bg-transparent md:border-0 md:p-0">
                    <div className="text-[10px] uppercase font-bold text-muted-foreground order-1 md:order-2">Skipped</div>
                    <div className="text-lg font-bold text-slate-400 order-2 md:order-1">{results.skipped}</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Formula Card */}
          <Card className="bg-card border-border shadow-sm">
            <CardContent className="px-2 py-4 md:p-6">
              <h3 className="text-lg font-bold mb-4 flex items-center gap-2 text-muted-foreground">
                <Calculator className="h-5 w-5" /> Score Breakdown
              </h3>
              <div className={cn(
                "grid gap-2 text-xs md:text-sm",
                gpaScore > 0 && deduction > 0.01 ? "grid-cols-2 sm:grid-cols-4" :
                (gpaScore > 0 || deduction > 0.01) ? "grid-cols-3" : "grid-cols-2"
              )}>
                <div className="p-2 md:p-3 bg-green-500/5 rounded-lg border border-green-500/20 text-center">
                  <div className="text-[10px] md:text-xs text-muted-foreground font-bold uppercase mb-1">Correct</div>
                  <div className="text-base md:text-xl font-bold text-green-600 font-mono">+{correctMarks.toFixed(2)}</div>
                </div>
                <div className="p-2 md:p-3 bg-red-500/5 rounded-lg border border-red-500/20 text-center">
                  <div className="text-[10px] md:text-xs text-muted-foreground font-bold uppercase mb-1">Negative</div>
                  <div className="text-base md:text-xl font-bold text-red-500 font-mono">-{negativeMarks.toFixed(2)}</div>
                </div>

                {deduction > 0.01 && (
                  <div className="p-2 md:p-3 bg-orange-500/5 rounded-lg border border-orange-500/20 text-center">
                    <div className="text-[10px] md:text-xs text-muted-foreground font-bold uppercase mb-1">2nd Timer Deduction</div>
                    <div className="text-base md:text-xl font-bold text-orange-500 font-mono">-{deduction.toFixed(2)}</div>
                  </div>
                )}

                {gpaScore > 0 && (
                  <div className="p-2 md:p-3 bg-indigo-500/5 rounded-lg border border-indigo-500/20 text-center">
                    <div className="text-[10px] md:text-xs text-muted-foreground font-bold uppercase mb-1">GPA Deduction</div>
                    <div className="text-base md:text-xl font-bold text-indigo-600 font-mono">-{gpaDeduction.toFixed(2)}</div>
                  </div>
                )}
              </div>

              {gpaScore > 0 && (
                <div className="mt-2 p-2 md:p-3 bg-indigo-500/5 rounded-lg border border-indigo-500/20 text-[10px] md:text-xs text-muted-foreground space-y-1">
                  <div className="flex justify-between">
                    <span>SSC GPA ({sscGpa.toFixed(2)}) × 8</span>
                    <span className="font-mono font-semibold text-foreground">{(sscGpa * 8).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>HSC GPA ({hscGpa.toFixed(2)}) × 12</span>
                    <span className="font-mono font-semibold text-foreground">{(hscGpa * 12).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t border-dashed border-indigo-500/30 pt-1">
                    <span className="font-semibold">GPA Score (Total)</span>
                    <span className="font-mono font-semibold text-indigo-600">{gpaScore.toFixed(2)} / 100</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold">GPA Deduction (100 − {gpaScore.toFixed(2)})</span>
                    <span className="font-mono font-semibold text-red-500">-{gpaDeduction.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t border-dashed border-indigo-500/30 pt-1">
                    <span>Main Exam Score (Correct − Negative − 2nd Timer − GPA Deduction)</span>
                    <span className="font-mono font-semibold text-foreground">{mainExamScoreDisplay.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t border-indigo-500/30 pt-1">
                    <span className="font-bold text-indigo-700 dark:text-indigo-300">With GPA Total ({finalScore.toFixed(2)} + {gpaScore.toFixed(2)})</span>
                    <span className="font-mono font-bold text-indigo-600">{withGpaScore.toFixed(2)} / {withGpaTotalMarks}</span>
                  </div>
                </div>
              )}

              {/* Final Score */}
              <div className="mt-3 p-3 md:p-4 bg-primary/5 rounded-xl border border-primary/20">
                <div className="text-[10px] md:text-xs font-bold uppercase text-muted-foreground mb-2 text-center">Final Score</div>
                <div className={cn("grid gap-2", gpaScore > 0 ? "grid-cols-2" : "grid-cols-1")}>
                  <div className="text-center">
                    <div className="text-[10px] md:text-xs text-muted-foreground font-bold uppercase mb-0.5">Main Score</div>
                    <div className="text-lg md:text-2xl font-bold text-primary font-mono">{mainExamScoreDisplay.toFixed(2)}<span className="text-sm md:text-base text-muted-foreground font-bold"> /{totalMarks}</span></div>
                  </div>
                  {gpaScore > 0 && (
                    <div className="text-center border-l-2 border-border">
                      <div className="text-[10px] md:text-xs text-muted-foreground font-bold uppercase mb-0.5">With GPA Score</div>
                      <div className="text-lg md:text-2xl font-bold text-indigo-600 font-mono">{withGpaScore.toFixed(2)}<span className="text-sm md:text-base text-muted-foreground font-bold"> /{withGpaTotalMarks}</span></div>
                    </div>
                  )}
                </div>
              </div>

              {/* Second Timer Warning */}
              {profile?.is_second_timer && (
                <div className="mt-4 pt-4 border-t border-dashed flex items-start gap-2 text-xs text-muted-foreground">
                  <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
                  <p>
                    সেকেন্ড টাইমার হিসেবে আপনার প্রাপ্ত নম্বর থেকে ৩% নম্বর কর্তন করা হবে।
                  </p>
                </div>
              )}

            </CardContent>
          </Card>

          {/* Filters */}
          <div className="flex flex-wrap gap-2 pb-2 pt-2">
            {[
              { label: "All", value: "all", count: questions.length },
              { label: "Correct", value: "correct", count: results.correct },
              { label: "Incorrect", value: "incorrect", count: results.wrong },
              { label: "Skipped", value: "skipped", count: results.skipped },
            ].map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value as any)}
                className={cn(
                  "px-3 py-1 rounded-full text-xs sm:text-sm font-medium border transition-colors",
                  filter === f.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:bg-muted"
                )}
              >
                {f.label} ({f.count})
              </button>
            ))}
          </div>

          {/* Questions List */}
          <div className="space-y-6">
            {filteredQuestions.map((q) => {
              const idx = questions.findIndex((qq) => qq.id === q.id);
              const sel = answers[q.id];
              const isCorrect = sel && sel.toUpperCase() === String(q.correct_option).toUpperCase();
              const isSkipped = !sel;
              const isWrong = !isCorrect && !isSkipped;

              return (
                <Card key={q.id} className="rounded-[30px] overflow-hidden shadow-sm border max-w-full">
                  <CardContent className="px-2 py-5 space-y-2 max-w-full overflow-x-hidden">
                    <div className="flex items-center justify-between gap-2">
                      <span className={cn(
                        "text-xs font-bold px-2.5 py-1 rounded-full",
                        isCorrect ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                        isWrong ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                        "bg-muted text-muted-foreground"
                      )}>
                        {idx + 1}/{questions.length}
                      </span>
                      {q._sliceLabel && <Badge variant="outline">{q._sliceLabel}</Badge>}
                    </div>

                    <div className="flex items-start gap-4">
                      <div className="flex-1 min-w-0 pt-1 overflow-x-auto no-scrollbar scroll-smooth overscroll-x-contain">
                        <div className="text-lg font-medium leading-relaxed whitespace-pre-line min-w-0 break-words">
                          <MathText text={q.question_text} className="prose dark:prose-invert max-w-none whitespace-pre-line min-w-0 break-words" />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 pt-2">
                      {(["A", "B", "C", "D", "E"] as const).map((optionKey) => {
                        const optionText = (q as any)[`option_${optionKey.toLowerCase()}`];
                        if (!optionText) return null;
                        const isSelected = sel === optionKey;
                        const isCorrectOption = String(q.correct_option).toUpperCase() === optionKey;

                        let circleClass = "border-muted-foreground/30 text-muted-foreground";
                        let icon: JSX.Element = <span className="text-sm font-bold">{optionKey}</span>;

                        if (isCorrectOption) {
                          circleClass = "bg-green-500 border-green-500 text-white";
                          icon = <Check className="h-4 w-4" />;
                        } else if (isSelected) {
                          circleClass = "bg-red-500 border-red-500 text-white";
                          icon = <X className="h-4 w-4" />;
                        }

                        return (
                          <div key={optionKey} className="flex items-start gap-4 max-w-full">
                            <div className={cn("flex-shrink-0 h-8 w-8 rounded-full border-2 flex items-center justify-center transition-all mt-0.5", circleClass)}>
                              {icon}
                            </div>
                            <div className={cn(
                              "flex-1 min-w-0 text-base whitespace-pre-line pt-1 p-2.5 rounded-lg border overflow-x-auto no-scrollbar scroll-smooth overscroll-x-contain",
                              isCorrectOption ? "text-green-700 dark:text-green-400 font-medium bg-green-500/5 border-green-500/40" :
                              isSelected ? "text-red-600 dark:text-red-400 bg-red-500/5 border-red-500/40" : "text-foreground border-border/60"
                            )}>
                              <MathText text={optionText} className="prose dark:prose-invert max-w-none whitespace-pre-line min-w-0 break-words" />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {q.explanation && (
                      <div className="mt-4 pt-4 border-t border-dashed">
                        <h4 className="text-sm font-bold text-muted-foreground mb-1">Explanation:</h4>
                        <div className="text-sm text-foreground/80 whitespace-pre-line overflow-x-auto no-scrollbar scroll-smooth overscroll-x-contain break-words">
                          <MathText text={q.explanation} className="prose dark:prose-invert max-w-none whitespace-pre-line min-w-0 break-words" />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const answeredCount = Object.keys(answers).length;
  const isLowTime = secondsLeft !== null && secondsLeft < 300;

  return (
    <div className="min-h-screen bg-background pb-20 relative font-sans">
      <div className="container max-w-full lg:max-w-[92rem] mx-auto px-0.5 py-4 md:px-3 md:py-8 space-y-3 overflow-x-hidden">
        <div className="sticky top-0 z-40 bg-background/95 backdrop-blur py-2 -mx-[5px] px-[5px] md:mx-0 md:px-0 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="shrink-0"><ArrowLeft className="h-5 w-5" /></Button>
              <div className="min-w-0">
                <h1 className="text-xl md:text-2xl font-bold truncate">{test?.title || "Admission Test"}</h1>
                <p className="text-sm text-muted-foreground">Answered: {answeredCount} / {questions.length}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className={cn(
                "px-3 py-1.5 rounded-full font-mono font-bold shadow-sm border flex items-center gap-1.5 transition-all duration-300 text-sm",
                isLowTime ? "bg-red-600 text-white border-red-700 animate-pulse" : "bg-background border-primary/20 text-primary"
              )}>
                <Clock className="h-3.5 w-3.5" />
                {secondsLeft !== null ? formatTime(secondsLeft) : "--:--"}
              </div>
            </div>
          </div>
        </div>

        {questions.map((q, idx) => (
          <div key={q.id} ref={(el) => { questionRefs.current[q.id] = el; }} className="scroll-mt-28">
            {q._sliceLabel && q._sliceLabel !== (questions[idx - 1] as any)?._sliceLabel && (
              <div className="sticky top-16 z-10 mb-2 flex justify-center">
                <div className="rounded-full bg-primary text-primary-foreground text-xs font-bold px-4 py-1.5 shadow-md">
                  {q._sliceLabel}
                </div>
              </div>
            )}
            <Card className="shadow-sm rounded-[30px] overflow-hidden max-w-full">
              <CardContent className="p-4 md:p-5 space-y-2 max-w-full overflow-x-hidden">
                <div className="flex items-center justify-between gap-2 max-w-full">
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
                    {idx + 1}/{questions.length}
                  </span>
                </div>

                <div className="w-full min-w-0 overflow-x-auto no-scrollbar scroll-smooth overscroll-x-contain">
                  <div className="text-lg font-medium leading-relaxed whitespace-pre-line min-w-0 break-words text-black dark:text-white">
                    <MathText text={q.question_text} className="prose dark:prose-invert max-w-none whitespace-pre-line min-w-0 break-words text-black dark:text-white" />
                  </div>
                </div>

                <div className="space-y-2 pt-2 max-w-full">
                  {(["A", "B", "C", "D", "E"] as const).map((optionKey) => {
                    const optionText = (q as any)[`option_${optionKey.toLowerCase()}`];
                    if (!optionText) return null;
                    const isSelected = answers[q.id] === optionKey;
                    const isAnswered = !!answers[q.id];
                    const isDisabled = isAnswered && !isSelected;

                    return (
                      <div
                        key={optionKey}
                        onClick={() => {
                          if (!isAnswered) {
                            const updated = { ...answers, [q.id]: optionKey };
                            setAnswers(updated);
                            scrollToNextUnanswered(q.id, updated);
                          }
                        }}
                        className={cn("flex items-start gap-4 group max-w-full", !isAnswered && "cursor-pointer", isDisabled && "opacity-50 pointer-events-none")}
                      >
                        <div className={cn(
                          "flex-shrink-0 h-8 w-8 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-all mt-0.5",
                          isSelected ? "bg-primary border-primary text-primary-foreground scale-110" : "border-muted-foreground/30 text-muted-foreground",
                          !isAnswered && !isSelected && "group-hover:border-primary/50 group-hover:text-primary",
                          isDisabled && "border-muted-foreground/20 text-muted-foreground/50 cursor-not-allowed"
                        )}>
                          {optionKey}
                        </div>
                        <div className={cn(
                          "flex-1 min-w-0 text-base whitespace-pre-line pt-1 p-2.5 rounded-lg border overflow-x-auto no-scrollbar scroll-smooth overscroll-x-contain flex items-start justify-between gap-2",
                          isSelected ? "text-primary font-medium bg-primary/5 border-primary/40" : "text-black dark:text-white border-border/60"
                        )}>
                          <div className="flex-1 min-w-0">
                            <MathText text={optionText} className="prose dark:prose-invert max-w-none whitespace-pre-line min-w-0 break-words text-black dark:text-white" />
                          </div>
                          {isSelected && <Lock className="h-4 w-4 text-primary shrink-0 mt-0.5" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        ))}

        <div className="flex justify-center mt-8 pb-12">
          <Button
            size="lg"
            onClick={() => { if (confirm("Finish and submit exam?")) submitMutation.mutate(); }}
            disabled={submitMutation.isPending}
            className="bg-green-600 hover:bg-green-700 w-full max-w-sm h-12 text-lg rounded-full"
          >
            {submitMutation.isPending ? "Submitting..." : "Finish Exam"}
          </Button>
        </div>
      </div>

      <div className="fixed bottom-6 right-6 z-40">
        <Button
          size="default"
          className="h-12 rounded-full shadow-xl bg-green-600 hover:bg-green-700 text-white font-bold px-5"
          onClick={() => { if (confirm("Are you sure you want to submit?")) submitMutation.mutate(); }}
          disabled={submitMutation.isPending}
        >
          {submitMutation.isPending ? "Submitting..." : "Submit"}
        </Button>
      </div>

      <div className="fixed top-1/2 right-4 -translate-y-1/2 z-40">
        <Button size="icon" className="h-12 w-12 rounded-full shadow-xl bg-primary hover:bg-primary/90" onClick={() => setIsNavigatorOpen(true)}>
          <LayoutGrid className="h-6 w-6" />
        </Button>
      </div>

      <Dialog open={isNavigatorOpen} onOpenChange={setIsNavigatorOpen}>
        <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Question Navigator</DialogTitle></DialogHeader>
          <div className="grid grid-cols-5 gap-3 p-2">
            {questions.map((qq, idx) => {
              const isAnswered = !!answers[qq.id];
              return (
                <button
                  key={qq.id}
                  onClick={() => scrollToQuestion(idx)}
                  className={cn(
                    "h-10 w-10 rounded-lg flex items-center justify-center text-sm font-bold transition-all",
                    isAnswered ? "bg-primary text-primary-foreground shadow-sm" : "bg-muted text-muted-foreground hover:bg-muted/80 border border-border"
                  )}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
