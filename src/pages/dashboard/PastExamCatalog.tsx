import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEnrollments } from "@/hooks/useEnrollments";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Search, Trophy, FileDown, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SUBJECTS } from "@/lib/constants";
import { setExamSourceList } from "@/lib/examSourceTracker";
import { openSolvePdf } from "@/lib/solvePdf";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const PastExamCatalog = () => {
  const [selectedCourse, setSelectedCourse] = useState<string>("all");
  const [selectedSubject, setSelectedSubject] = useState<string>("all");
  const [sortOrder, setSortOrder] = useState<string>("recent");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [pdfDialogExam, setPdfDialogExam] = useState<any>(null);
  const { data: enrollments, isLoading: enrollmentsLoading } = useEnrollments();
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    document.title = "Past Exams – Atlas";
  }, []);

  const { data: exams, isLoading: examsLoading } = useQuery({
    queryKey: ["past-exam-catalog", user?.id, selectedCourse, selectedSubject, sortOrder, searchQuery, enrollments?.length],
    queryFn: async () => {
        if (!user || !enrollments || enrollments.length === 0) return [];

        // Only courses the user actually has access to (enrolled + bonus/shared courses).
        const courseIds = enrollments.map(e => e.course_id);
        const now = new Date().toISOString();

        let query = supabase
            .from("exams")
            .select("*, course:courses(*)")
            .or(`course_id.in.(${courseIds.join(',')}),shared_course_ids.ov.{${courseIds.join(',')}}`)
            .eq("is_published", true)
            // Either a dedicated practice exam OR a live exam whose window has ended (missed).
            .or(`exam_type.eq.practice,and(exam_type.eq.live,time_window_end.lt.${now})`)
            .eq("is_readymade", false);

        query = sortOrder === "old"
          ? query.order("time_window_start", { ascending: true }).order("created_at", { ascending: true })
          : query.order("time_window_start", { ascending: false }).order("created_at", { ascending: false });

        const { data, error } = await query;
        if (error) throw error;

        let filteredData = data || [];

        if (selectedCourse !== "all") {
            filteredData = filteredData.filter(e => {
                if (e.course_id === selectedCourse) return true;
                // @ts-ignore
                if (e.shared_course_ids && Array.isArray(e.shared_course_ids) && e.shared_course_ids.includes(selectedCourse)) return true;
                return false;
            });
        }

        if (selectedSubject !== "all") {
            const norm = (s: string) => (s || "").trim().toLowerCase();
            const target = norm(selectedSubject);
            filteredData = filteredData.filter(e =>
              Array.isArray(e.subject)
                ? e.subject.some((s: string) => norm(s) === target)
                : norm(e.subject) === target
            );
        }

        if (searchQuery.trim()) {
            filteredData = filteredData.filter(e => e.title?.toLowerCase().includes(searchQuery.trim().toLowerCase()));
        }

        return filteredData;
    },
    enabled: !!user && !!enrollments,
  });

  // Question count per exam (for the Duration + MCQ count line).
  const examIds = (exams || []).map((e: any) => e.id);
  const { data: questionCounts } = useQuery({
    queryKey: ["past-exam-question-counts", examIds.join(",")],
    queryFn: async () => {
      if (examIds.length === 0) return {} as Record<string, number>;
      const { data, error } = await supabase
        .from("exam_questions")
        .select("exam_id")
        .in("exam_id", examIds);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((row: any) => {
        counts[row.exam_id] = (counts[row.exam_id] || 0) + 1;
      });
      return counts;
    },
    enabled: examIds.length > 0,
  });

  const isLoading = enrollmentsLoading || examsLoading;

  const handleStartPractice = (exam: any) => {
    setExamSourceList(exam.id, "/dashboard/past-exam");
    navigate(`/dashboard/take-exam/${exam.id}`);
  };

  const handleDownloadPdf = async (exam: any, style: "style2" | "style3" = "style2") => {
    if (downloadingId) return;
    setDownloadingId(exam.id);
    try {
      const { data, error } = await supabase
        .from("exam_questions")
        .select("question_text, option_a, option_b, option_c, option_d, option_e, correct_option, explanation")
        .eq("exam_id", exam.id)
        .order("question_index", { ascending: true });
      if (error) throw error;
      if (!data || data.length === 0) {
        toast({ title: "No questions found", description: "This exam has no questions to export.", variant: "destructive" });
        return;
      }
      openSolvePdf({
        examName: exam.title,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        questions: data.map((q: any) => ({
          question_text: q.question_text,
          option_a: q.option_a,
          option_b: q.option_b,
          option_c: q.option_c,
          option_d: q.option_d,
          option_e: q.option_e,
          correct_option: q.correct_option,
          user_answer: null,
          explanation: q.explanation,
        })),
        totalMarks: data.length,
        style,
      });
    } catch (err: any) {
      toast({ title: "PDF তৈরি করা যায়নি", description: err?.message || "Please try again.", variant: "destructive" });
    } finally {
      setDownloadingId(null);
    }
  };

  const fmtDate = (iso: string | null) => {
    if (!iso) return null;
    return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  };

  return (
    <div className="space-y-3">
      <header className="space-y-0.5">
        <h1 className="text-xl font-semibold tracking-tight">Past Exams</h1>
        <p className="text-xs text-muted-foreground">
            Practice with expired live exams or dedicated practice tests.
        </p>
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search exams by name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-10"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Select value={selectedCourse} onValueChange={setSelectedCourse}>
          <SelectTrigger className="h-10">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Courses</SelectItem>
            {enrollments?.map((enrollment) => (
              <SelectItem key={enrollment.course_id} value={enrollment.course_id}>
                {enrollment.course.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={selectedSubject} onValueChange={setSelectedSubject}>
          <SelectTrigger className="h-10">
            <SelectValue placeholder="All Subjects" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Subjects</SelectItem>
            {SUBJECTS.map((subject) => (
              <SelectItem key={subject} value={subject}>
                {subject}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Subject category quick-filter: 2 per row, "All Subjects" first */}
      <div className="grid grid-cols-2 gap-2">
        {["all", ...SUBJECTS].map((s) => (
          <button
            key={s}
            onClick={() => setSelectedSubject(s)}
            className={cn(
              "h-10 rounded-lg border-2 px-2 text-xs font-semibold truncate transition-colors",
              selectedSubject === s
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/40"
            )}
          >
            {s === "all" ? "All Subjects" : s}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : !exams || exams.length === 0 ? (
        <Card className="border border-foreground/50">
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            No practice exams available at the moment.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-2.5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {exams.map((exam: any) => {
            const qCount = questionCounts?.[exam.id];
            const startDate = fmtDate(exam.time_window_start);
            return (
            <Card key={exam.id} className="border border-emerald-100 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900 rounded-2xl shadow-md hover:shadow-lg transition-all flex flex-col h-full overflow-hidden">
              <CardHeader className="space-y-1 py-3 px-4">
                <div className="flex justify-between items-start gap-2">
                    <p className="text-xs font-mono uppercase text-muted-foreground">
                    {exam.course?.name || "Public Exam"}
                    </p>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${exam.exam_type === 'live' ? 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-100 dark:border-emerald-800' : 'bg-transparent text-emerald-700 border-emerald-200 dark:text-emerald-200 dark:border-emerald-800'}`}>
                          {exam.exam_type === 'live' ? 'Expired Live' : 'Practice'}
                      </span>
                      {Array.isArray(exam.subject) && (
                        <div className="flex flex-wrap gap-1 justify-end">
                            {exam.subject.map((s: string) => (
                                <span key={s} className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition-colors border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-100 dark:border-emerald-800">
                                    {s}
                                </span>
                            ))}
                        </div>
                      )}
                    </div>
                </div>
                <CardTitle className="text-base">{exam.title}</CardTitle>
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  <span>Duration: {exam.duration_minutes} mins{qCount ? ` · ${qCount} MCQ` : ""}</span>
                  {startDate && (
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3 w-3" /> {startDate}
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex flex-col flex-1 pt-0 pb-3 px-4 overflow-hidden">
                <div className="mt-auto flex items-center gap-1.5 flex-wrap min-w-0">
                  <Button
                    size="sm"
                    onClick={() => handleStartPractice(exam)}
                    className="flex-1 min-w-0 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full border-none text-xs px-2"
                  >
                    Start
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (isAdmin) {
                        setPdfDialogExam(exam);
                      } else {
                        handleDownloadPdf(exam);
                      }
                    }}
                    disabled={downloadingId === exam.id}
                    className="rounded-full text-xs px-2 shrink-0"
                  >
                    <FileDown className="h-3.5 w-3.5 mr-1" /> Practice Sheet
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => navigate(`/dashboard/leaderboard/${exam.id}`)}
                    className="rounded-full text-xs px-2 shrink-0"
                  >
                    <Trophy className="h-3.5 w-3.5 mr-1" /> Leaderboard
                  </Button>
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!pdfDialogExam} onOpenChange={(o) => { if (!o) setPdfDialogExam(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Practice Sheet</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-2">
            <Button
              variant="outline"
              className="justify-start h-auto py-2.5"
              onClick={() => { handleDownloadPdf(pdfDialogExam); setPdfDialogExam(null); }}
            >
              <div className="text-left">
                <div className="font-medium">Normal Style</div>
              </div>
            </Button>
            <Button
              variant="outline"
              className="justify-start h-auto py-2.5"
              onClick={() => { handleDownloadPdf(pdfDialogExam, "style3"); setPdfDialogExam(null); }}
            >
              <div className="text-left">
                <div className="font-medium">Compact Style (3 Column)</div>
                <div className="text-[10px] font-normal text-muted-foreground">প্রতি পেজে ৫০টি প্রশ্ন, ৩ কলাম</div>
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PastExamCatalog;
