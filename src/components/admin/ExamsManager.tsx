import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Exam, Course } from "@/types/admin";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { FileUp, Trash2, Trophy, FileQuestion, Clock, CheckCircle, ChevronLeft, ChevronRight, Lock, Copy, MoreHorizontal, Edit, ExternalLink, Plus, LayoutGrid, List, FileText, RotateCw, Archive, Search, Download } from "lucide-react";
import Papa from "papaparse";
import { SUBJECTS } from "@/lib/constants";
import { toDhakaTimeISO, fromDhakaTimeToUTC } from "@/lib/dateUtils";
import { MultiSelect } from "@/components/ui/multi-select";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { ExamForm } from "@/components/admin/ExamForm";
import { ExternalExamForm } from "@/components/admin/ExternalExamForm";
import { AdminCourseView } from "@/components/admin/AdminCourseView";
import { openSolvePdf } from "@/lib/solvePdf";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ExamSortableList } from "@/components/admin/ExamSortableList";
import { ArrowUpDown } from "lucide-react";

const PAGE_SIZE = 15;

interface ExamsManagerProps {
    isFreeMode?: boolean;
}

const ExamsManager = ({ isFreeMode = false }: ExamsManagerProps) => {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("editId");
  const [editingExam, setEditingExam] = useState<any>(null);
  const [editingExternalExam, setEditingExternalExam] = useState<any>(null);
  const [sheetExam, setSheetExam] = useState<{ id: string; title: string } | null>(null);
  const [showForm, setShowFormRaw] = useState(() => sessionStorage.getItem("examManager_showForm") === "1");
  const setShowForm = (val: boolean) => {
    setShowFormRaw(val);
    if (val) sessionStorage.setItem("examManager_showForm", "1");
    else sessionStorage.removeItem("examManager_showForm");
  };
  const [showExternalForm, setShowExternalForm] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "course">("list");
  const [isReordering, setIsReordering] = useState(false);

  const [subjectFilter, setSubjectFilter] = useState<string>("all");
  const [courseFilter, setCourseFilter] = useState<string>("all");
  const [mainCategory, setMainCategory] = useState<"all" | "live" | "practice" | "readymade" | "free">("all");
  const [readymadeSubCategory, setReadymadeSubCategory] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
        setDebouncedSearch(searchQuery);
        if (searchQuery) setPage(0);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    document.title = isFreeMode ? "Free Exams Manager" : "Admin Exams";
  }, [isFreeMode]);

  const { data: courses } = useQuery({
    queryKey: ["admin-courses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id, name")
        .order("name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !isFreeMode
  });

  const { data: readymadeCategories } = useQuery({
    queryKey: ["admin-exams-readymade-topics"],
    queryFn: async () => {
      const set = new Set<string>();
      const BATCH = 1000;
      let from = 0;
      // Paginate through ALL readymade exams — a plain select() is capped at
      // 1000 rows by Supabase/PostgREST, which was silently dropping
      // topics that only appeared later in the table.
      while (true) {
        const { data, error } = await supabase
          .from("exams")
          .select("readymade_topic")
          .eq("is_readymade", true)
          .is("split_start", null)
          .not("readymade_topic", "is", null)
          .range(from, from + BATCH - 1);
        if (error) throw error;
        (data || []).forEach((r: any) => { if (r.readymade_topic) set.add(r.readymade_topic); });
        if (!data || data.length < BATCH) break;
        from += BATCH;
      }
      return Array.from(set).sort();
    },
  });

  const { data: examsData, isLoading } = useQuery({
    queryKey: ["admin-exams", isFreeMode, subjectFilter, courseFilter, page, debouncedSearch, mainCategory, readymadeSubCategory],
    staleTime: 30000,
    queryFn: async () => {
      let query = supabase
        .from("exams")
        .select("*, course:courses(id, name)", { count: "exact" })
        .is("split_start", null)
        .not("category", "cs", '{"Custom Exam"}')
        .order("created_at", { ascending: false });

      if (isFreeMode) {
          query = query.is("course_id", null);
      } else {
          if (courseFilter !== "all") {
              query = query.eq("course_id", courseFilter);
          }
      }

      if (subjectFilter !== "all") {
        query = query.contains("subject", [subjectFilter]);
      }
      if (debouncedSearch) {
          query = query.ilike("title", `%${debouncedSearch}%`);
      }

      if (mainCategory === "readymade") {
          query = query.eq("is_readymade", true);
          if (readymadeSubCategory !== "all") {
              query = query.eq("readymade_topic", readymadeSubCategory);
          }
      } else if (mainCategory === "live") {
          query = query.eq("is_readymade", false).eq("exam_type", "live");
      } else if (mainCategory === "practice") {
          query = query.eq("is_readymade", false).eq("exam_type", "practice");
      } else if (mainCategory === "free") {
          query = query.eq("is_visible_on_free", true).eq("is_readymade", false);
      }

      const { data, error, count } = await query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      return { data: data || [], count: count || 0 };
    },
  });

  const exams = examsData?.data || [];

  // When browsing "Readymade" → "All", group exams by their Parent Topic
  // (readymade_topic) so each topic appears as its own section with a
  // header, instead of one flat undifferentiated list.
  const isReadymadeGroupedView = mainCategory === "readymade" && readymadeSubCategory === "all";
  const displayExams = isReadymadeGroupedView
      ? [...exams].sort((a: any, b: any) => {
          const ta = a.readymade_topic || "";
          const tb = b.readymade_topic || "";
          if (ta === tb) return 0;
          if (!ta) return 1; // untagged exams go last
          if (!tb) return -1;
          return ta.localeCompare(tb);
        })
      : exams;
  const getGroupHeaderTopic = (index: number): string | null => {
      if (!isReadymadeGroupedView) return null;
      const exam = displayExams[index];
      const topic = exam?.readymade_topic || "অন্যান্য (Uncategorized)";
      const prevTopic = index === 0 ? null : (displayExams[index - 1]?.readymade_topic || "অন্যান্য (Uncategorized)");
      return topic !== prevTopic ? topic : null;
  };
  const totalCount = examsData?.count || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const deleteExamMutation = useMutation({
    mutationFn: async (id: string) => {
      // Note: If ON DELETE CASCADE is set on foreign keys in DB, deleting exam is enough.
      // If not, we should manually delete questions/attempts.
      // Assuming CASCADE is set or we do best effort cleanup here.
      // First, delete questions to be safe (if no cascade)
      await supabase.from("exam_questions").delete().eq("exam_id", id);
      await supabase.from("exam_attempts").delete().eq("exam_id", id);

      const { error } = await supabase.from("exams").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Exam deleted" });
      queryClient.invalidateQueries({ queryKey: ["admin-exams"] });
      queryClient.invalidateQueries({ queryKey: ["public-free-exams"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error deleting exam",
        description: error.message ?? "Please try again",
        variant: "destructive",
      });
    },
  });

  const duplicateExamMutation = useMutation({
    mutationFn: async (exam: any) => {
      const {
        id, created_at, updated_at, course: _course,
        ...rest
      } = exam;
      const { data, error } = await supabase
        .from("exams")
        .insert({
          ...rest,
          title: exam.title,
          duration_minutes: 0,
          total_marks: 0,
          is_published: false,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: "Exam duplicated", description: "Upload a new CSV to add questions." });
      queryClient.invalidateQueries({ queryKey: ["admin-exams"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error duplicating exam",
        description: error.message ?? "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleDownloadCSV = async (examId: string, examTitle: string) => {
    try {
        const { data: questions, error } = await supabase
            .from("exam_questions")
            .select("*")
            .eq("exam_id", examId)
            .order("question_index", { ascending: true });

        if (error) throw error;
        if (!questions || questions.length === 0) {
            toast({ title: "No questions found", variant: "destructive" });
            return;
        }

        const rows = questions.map((q: any) => {
            const answerLetter = String(q.correct_option || "").toUpperCase();
            const answerNum =
                answerLetter === "A" ? "1" :
                answerLetter === "B" ? "2" :
                answerLetter === "C" ? "3" :
                answerLetter === "D" ? "4" :
                answerLetter === "E" ? "5" : "";
            return {
                questions: q.question_text || "",
                option1: q.option_a || "",
                option2: q.option_b || "",
                option3: q.option_c || "",
                option4: q.option_d || "",
                option5: q.option_e || "",
                answer: answerNum,
                explanation: q.explanation || "",
                type: "1",
                section: "1",
            };
        });

        const csv = Papa.unparse(rows, {
            columns: ["questions", "option1", "option2", "option3", "option4", "option5", "answer", "explanation", "type", "section"],
        });

        const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", (examTitle || "quiz") + ".csv");
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);

        toast({ title: "CSV Downloaded", description: `Exported ${questions.length} questions.` });
    } catch (error) {
        console.error("CSV download failed", error);
        toast({ title: "CSV Download Failed", variant: "destructive" });
    }
  };

  const handleGenerateSolvesheet = (examId: string, examTitle: string) => {
    setSheetExam({ id: examId, title: examTitle });
  };

  const handleDownloadSolveSheetStyle = async (style: "style1" | "style2" | "style3" | "style4") => {
    if (!sheetExam) return;
    try {
        const { data: questions, error } = await supabase
            .from("exam_questions")
            .select("*")
            .eq("exam_id", sheetExam.id)
            .order("question_index", { ascending: true });

        if (error) throw error;
        if (!questions || questions.length === 0) {
            toast({ title: "No questions found", variant: "destructive" });
            return;
        }

        openSolvePdf({
            examName: sheetExam.title,
            style,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            questions: questions.map((q: any) => ({
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
            totalMarks: questions.length,
        });
        setSheetExam(null);
    } catch (err: any) {
        console.error(err);
        toast({ title: "Failed to generate Solvesheet", description: err.message, variant: "destructive" });
    }
  };

  const handleRecalculateResults = async (examId: string) => {
    if (!window.confirm("Are you sure you want to recalculate all results for this exam? This will update all student scores based on the current answer key.")) return;
    
    try {
        const { error } = await (supabase.rpc as any)("recalculate_exam_results", { p_exam_id: examId });
        if (error) throw error;
        toast({ title: "Success", description: "All results have been recalculated." });
    } catch (err: any) {
        toast({ title: "Recalculation failed", description: err.message, variant: "destructive" });
    }
  };

  useEffect(() => {
    if (editId && exams.length > 0) {
        const examToEdit = exams.find((e: any) => e.id === editId);
        if (examToEdit) {
            if (examToEdit.external_exam_link) {
                 setEditingExternalExam(examToEdit);
            } else {
                 setEditingExam(examToEdit);
            }
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }
  }, [editId, exams]);

  return (
    <section className="space-y-6">
      <Dialog open={!!sheetExam} onOpenChange={(o) => !o && setSheetExam(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Solution PDF স্টাইল বেছে নিন</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Button variant="outline" className="justify-start h-auto py-2 w-full" onClick={() => handleDownloadSolveSheetStyle("style1")}>
              <div className="text-left">
                <div className="font-medium">Revision Style</div>
                <div className="text-xs font-normal text-muted-foreground">প্রশ্ন, উত্তর, ব্যাখ্যা একই সাথে</div>
              </div>
            </Button>
            <Button variant="outline" className="justify-start h-auto py-2 w-full" onClick={() => handleDownloadSolveSheetStyle("style2")}>
              <div className="text-left">
                <div className="font-medium">Practice Style</div>
                <div className="text-xs font-normal text-muted-foreground">প্রশ্নের শেষে উত্তর + ব্যাখ্যা (Answer Table)</div>
              </div>
            </Button>
            <Button variant="outline" className="justify-start h-auto py-2 w-full" onClick={() => handleDownloadSolveSheetStyle("style3")}>
              <div className="text-left">
                <div className="font-medium">Compact Style (3 Column)</div>
                <div className="text-xs font-normal text-muted-foreground">প্রতি পেজে ৫০টি প্রশ্ন, ৩ কলাম</div>
              </div>
            </Button>
            <Button variant="outline" className="justify-start h-auto py-2 w-full" onClick={() => handleDownloadSolveSheetStyle("style4")}>
              <div className="text-left">
                <div className="font-medium">OMR Style</div>
                <div className="text-xs font-normal text-muted-foreground">ল্যান্ডস্কেপ, ১ম পেজে OMR শিট + ৩৯টি প্রশ্ন, পরের পেজে ৩ কলাম</div>
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <header className="space-y-1">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
                <h1 className="text-xl font-semibold tracking-tight">
                    {isFreeMode ? "Manage Free Exams" : "Admin: Exams"}
                </h1>
                <p className="text-sm text-muted-foreground">
                Configure exams and optionally bulk-import questions from JSON.
                </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                {!isFreeMode && (
                    <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)} className="w-full sm:w-auto">
                        <TabsList className="flex flex-wrap h-auto w-full justify-start">
                            <TabsTrigger value="list"><List className="h-4 w-4 mr-2" /> List</TabsTrigger>
                            <TabsTrigger value="course"><LayoutGrid className="h-4 w-4 mr-2" /> Courses</TabsTrigger>
                        </TabsList>
                    </Tabs>
                )}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant={showForm || showExternalForm || editingExam || editingExternalExam ? "secondary" : "default"}>
                            {showForm || showExternalForm || editingExam || editingExternalExam ? "Close Form" : <><Plus className="h-4 w-4 mr-2" /> Create Exam</>}
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => {
                            if (showForm || showExternalForm || editingExam || editingExternalExam) {
                                setShowForm(false); setShowExternalForm(false); setEditingExam(null); setEditingExternalExam(null);
                            } else {
                                setShowForm(true); setShowExternalForm(false); setEditingExam(null); setEditingExternalExam(null);
                            }
                        }}>
                            {showForm || showExternalForm || editingExam || editingExternalExam ? "Cancel Action" : "Standard Exam"}
                        </DropdownMenuItem>
                        {!(showForm || showExternalForm || editingExam || editingExternalExam) && (
                            <DropdownMenuItem onClick={() => { setShowExternalForm(true); setShowForm(false); setEditingExam(null); setEditingExternalExam(null); }}>
                                External Exam
                            </DropdownMenuItem>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="outline" onClick={() => navigate("/admin/exams/question-maker")}>
                    Question Maker
                </Button>
            </div>
        </div>
      </header>

      <div className="grid gap-6">
        {(showForm || editingExam) && (
            <div className="bg-card border rounded-lg shadow-sm mb-4 animate-in fade-in slide-in-from-top-4 duration-300">
                <ExamForm
                    exam={editingExam}
                    onSuccess={() => { setEditingExam(null); setShowForm(false); queryClient.invalidateQueries({ queryKey: ["admin-exams"] }); }}
                    onCancel={() => { setEditingExam(null); setShowForm(false); }}
                    isFreeMode={isFreeMode}
                />
            </div>
        )}

        {(showExternalForm || editingExternalExam) && (
            <div className="bg-card border rounded-lg shadow-sm mb-4 animate-in fade-in slide-in-from-top-4 duration-300">
                <ExternalExamForm
                    exam={editingExternalExam}
                    onSuccess={() => { setEditingExternalExam(null); setShowExternalForm(false); queryClient.invalidateQueries({ queryKey: ["admin-exams"] }); }}
                    onCancel={() => { setEditingExternalExam(null); setShowExternalForm(false); }}
                    isFreeMode={isFreeMode}
                />
            </div>
        )}

        {!isFreeMode && viewMode === "course" ? (
            <AdminCourseView resourceType="exams" />
        ) : (
        <Card className="border border-foreground/60 overflow-hidden">
        <div className="p-6 space-y-4">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                <h2 className="text-lg font-semibold">
                    {isFreeMode ? "Free Exams" : "Exams"}
                </h2>
                <p className="text-sm text-muted-foreground">
                    Existing exams by course, with type, duration, and publish status.
                </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                    {!isFreeMode && (
                        <Select
                            value={courseFilter}
                            onValueChange={(v) => {
                                setCourseFilter(v);
                                setPage(0);
                            }}
                        >
                            <SelectTrigger className="w-full sm:w-[180px]">
                                <SelectValue placeholder="Filter by Course" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Courses</SelectItem>
                                {courses?.map(c => (
                                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}

                    <Select
                        value={subjectFilter}
                        onValueChange={(v) => {
                            setSubjectFilter(v);
                            setPage(0);
                        }}
                    >
                        <SelectTrigger className="w-full sm:w-[180px]">
                        <SelectValue placeholder="Filter by subject" />
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

                    <Input
                        placeholder="Search Title..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full sm:w-[200px]"
                    />
                    {courseFilter !== 'all' ? (
                        <Button variant="outline" onClick={() => setIsReordering(true)} disabled={!exams || exams.length === 0} title="Reorder exams for this course">
                            <ArrowUpDown className="h-4 w-4 mr-2" /> Reorder
                        </Button>
                    ) : (
                        <Button variant="outline" onClick={() => setIsReordering(true)} disabled={!exams || exams.length === 0}>
                            <ArrowUpDown className="h-4 w-4 mr-2" /> Reorder Page
                        </Button>
                    )}
                </div>
            </div>

            {/* Main Category Tabs */}
            <div className="flex flex-wrap gap-1.5 sm:gap-2">
                {([
                    { key: "all", label: "All" },
                    { key: "live", label: "Live" },
                    { key: "practice", label: "Practice" },
                    { key: "free", label: "Free" },
                ] as const).map((c) => (
                    <button
                        key={c.key}
                        type="button"
                        onClick={() => { setMainCategory(c.key); setReadymadeSubCategory("all"); setPage(0); }}
                        className={cn(
                            "px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-lg border text-xs sm:text-sm font-bold uppercase tracking-wide transition-colors whitespace-nowrap",
                            mainCategory === c.key ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/70 hover:bg-secondary"
                        )}
                    >
                        {c.label}
                    </button>
                ))}
            </div>

            {mainCategory === "readymade" && readymadeCategories && readymadeCategories.length > 0 && (
                <div className="flex flex-wrap gap-1.5 sm:gap-2 pl-1">
                    <button
                        type="button"
                        onClick={() => { setReadymadeSubCategory("all"); setPage(0); }}
                        className={cn(
                            "px-2.5 py-1.5 rounded-full border text-xs font-medium transition-colors whitespace-nowrap",
                            readymadeSubCategory === "all" ? "bg-foreground text-background border-foreground" : "bg-muted hover:bg-muted/70"
                        )}
                    >
                        All
                    </button>
                    {readymadeCategories.map((cat) => (
                        <button
                            key={cat}
                            type="button"
                            onClick={() => { setReadymadeSubCategory(cat); setPage(0); }}
                            className={cn(
                                "px-2.5 py-1.5 rounded-full border text-xs font-medium transition-colors whitespace-nowrap",
                                readymadeSubCategory === cat ? "bg-foreground text-background border-foreground" : "bg-muted hover:bg-muted/70"
                            )}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            )}

            {isLoading ? (
                <div className="text-sm text-muted-foreground">Loading exams...</div>
            ) : !exams || exams.length === 0 ? (
                <div className="text-sm text-muted-foreground">No exams defined yet.</div>
            ) : isReordering ? (
                <ExamSortableList
                    exams={exams}
                    onClose={() => setIsReordering(false)}
                    sortColumn={isFreeMode ? "free_sort_order" : "sort_order"}
                />
            ) : (
                <>
                {/* Desktop Table View */}
                <div className="hidden md:block rounded-md border border-border/60 bg-card overflow-hidden overflow-x-auto no-scrollbar scroll-smooth">
                    <Table className="w-full">
                        <TableHeader>
                        <TableRow>
                            {!isFreeMode && <TableHead className="whitespace-nowrap">Course</TableHead>}
                            <TableHead className="whitespace-nowrap">Title</TableHead>
                            <TableHead className="whitespace-nowrap">Subject</TableHead>
                            <TableHead className="whitespace-nowrap">Type</TableHead>
                            <TableHead className="whitespace-nowrap">Duration</TableHead>
                            <TableHead className="whitespace-nowrap">Negative</TableHead>
                            <TableHead className="whitespace-nowrap">Published</TableHead>
                            <TableHead className="whitespace-nowrap">Restricted</TableHead>
                            <TableHead className="text-right whitespace-nowrap">Actions</TableHead>
                        </TableRow>
                        </TableHeader>
                        <TableBody>
                        {displayExams.map((exam: any, idx: number) => {
                            const groupHeader = getGroupHeaderTopic(idx);
                            return (
                            <React.Fragment key={exam.id}>
                            {groupHeader && (
                                <TableRow className="hover:bg-transparent">
                                    <TableCell colSpan={isFreeMode ? 8 : 9} className="bg-muted/40 font-bold text-sm py-2">
                                        {groupHeader}
                                    </TableCell>
                                </TableRow>
                            )}
                            <TableRow className="hover:bg-muted/50 transition-colors">
                            {!isFreeMode && (
                                <TableCell className="whitespace-nowrap font-medium">
                                    {exam.course?.name || <Badge variant="secondary">Public</Badge>}
                                </TableCell>
                            )}
                            <TableCell className="whitespace-nowrap">{exam.title}</TableCell>
                            <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                                <div className="flex flex-wrap gap-1">
                                    {Array.isArray(exam.subject) && exam.subject.map((s: string) => (
                                        <Badge key={s} variant="outline" className="text-[10px] py-0 h-4">{s}</Badge>
                                    ))}
                                </div>
                            </TableCell>
                            <TableCell className="capitalize whitespace-nowrap">{exam.exam_type}</TableCell>
                            <TableCell className="text-xs whitespace-nowrap">{exam.duration_minutes} min</TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                                {exam.negative_mark_per_question ?? 0}
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                                {exam.is_published ? "Yes" : "No"}
                            </TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                                {exam.restrict_solution ? <Lock className="h-3 w-3 text-red-500 inline mr-1" /> : ""}
                                {exam.restrict_solution ? "Yes" : "No"}
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-2">
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8"
                                    title="Edit Details"
                                    onClick={() => {
                                        if (exam.external_exam_link) {
                                             setEditingExternalExam(exam);
                                        } else {
                                             setEditingExam(exam);
                                        }
                                        window.scrollTo({ top: 0, behavior: 'smooth' });
                                    }}
                                >
                                    <Edit className="h-4 w-4" />
                                </Button>
                                <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    className="h-8 w-8 text-blue-500"
                                    title="Copy Exam Link"
                                    onClick={() => {
                                        const path = exam.course_id ? `/dashboard/take-exam/${exam.id}` : `/open-exam/${exam.id}`;
                                        const url = `${window.location.origin}${path}`;
                                        navigator.clipboard.writeText(url);
                                        toast({ title: "Copied!", description: "Exam link copied to clipboard." });
                                    }}
                                >
                                    <Copy className="h-4 w-4" />
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-8"
                                    onClick={() => navigate(`/admin/exams/question-maker/${exam.id}`)}
                                >
                                    <FileQuestion className="h-4 w-4 mr-1" /> Questions
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-8"
                                    onClick={() => navigate(`/dashboard/leaderboard/${exam.id}`)}
                                >
                                    <Trophy className="h-4 w-4 mr-1 text-yellow-500" /> Rank
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 text-emerald-600"
                                    onClick={() => handleGenerateSolvesheet(exam.id, exam.title)}
                                >
                                    <FileText className="h-4 w-4 mr-1" /> Solution
                                </Button>
                                {isAdmin && (
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8 text-orange-600"
                                        title="Recalculate Results"
                                        onClick={() => handleRecalculateResults(exam.id)}
                                    >
                                        <RotateCw className="h-4 w-4" />
                                    </Button>
                                )}
                                {isAdmin && (
                                  <Button
                                      type="button"
                                      size="icon"
                                      variant="ghost"
                                      className="h-8 w-8 text-destructive"
                                      onClick={() => {
                                      if (window.confirm("Delete this exam? This cannot be undone. Questions and results will be deleted.")) {
                                          deleteExamMutation.mutate(exam.id);
                                      }
                                      }}
                                  >
                                      <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                                </div>
                            </TableCell>
                            </TableRow>
                            </React.Fragment>
                            );
                        })}
                        </TableBody>
                    </Table>
                </div>

                {/* Mobile Card View */}
                <div className="md:hidden grid sm:grid-cols-2 gap-4">
                    {displayExams.map((exam: any, idx: number) => {
                        const groupHeader = getGroupHeaderTopic(idx);
                        return (
                        <React.Fragment key={exam.id}>
                        {groupHeader && (
                            <div className="col-span-full bg-muted/40 rounded-lg font-bold text-sm py-2 px-3">
                                {groupHeader}
                            </div>
                        )}
                        <Card className="hover:border-primary/50 transition-colors w-full overflow-hidden">
                            <CardContent className="p-4 space-y-3">
                                <div className="flex justify-between items-start gap-2">
                                    <div className="space-y-1 min-w-0">
                                        {!isFreeMode && <div className="font-semibold text-sm text-primary truncate max-w-full">{exam.course?.name}</div>}
                                        <h3 className="font-bold leading-tight">{exam.title}</h3>
                                        {Array.isArray(exam.subject) && (
                                            <div className="flex flex-wrap gap-1">
                                                {exam.subject.map((s: string) => (
                                                    <span key={s} className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80">
                                                        {s}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className={`text-xs px-2 py-1 rounded-full font-medium ${exam.is_published ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'}`}>
                                        {exam.is_published ? 'Published' : 'Draft'}
                                    </div>
                                </div>

                                {/* ... (rest of mobile view is same) */}
                                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                                    <div className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {exam.duration_minutes} min
                                    </div>
                                    <div className="flex items-center gap-1 capitalize">
                                        {exam.exam_type === 'live' ? <CheckCircle className="h-3 w-3 text-red-500" /> : <CheckCircle className="h-3 w-3" />}
                                        {exam.exam_type}
                                    </div>
                                    {exam.restrict_solution && (
                                        <div className="flex items-center gap-1 text-red-500">
                                            <Lock className="h-3 w-3" />
                                            Restricted
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-center justify-between pt-2 border-t mt-2">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        className="h-8 text-xs"
                                        onClick={() => navigate(`/admin/exams/question-maker/${exam.id}`)}
                                    >
                                        <FileQuestion className="h-3 w-3 mr-1" /> Questions
                                    </Button>

                                    <div className="flex gap-1">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            className="h-8 w-8 p-0"
                                            onClick={() => {
                                                const path = exam.course_id ? `/dashboard/take-exam/${exam.id}` : `/open-exam/${exam.id}`;
                                                const url = `${window.location.origin}${path}`;
                                                navigator.clipboard.writeText(url);
                                                toast({ title: "Copied!", description: "Link copied." });
                                            }}
                                        >
                                            <Copy className="h-4 w-4" />
                                        </Button>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" className="h-8 w-8 p-0">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                <DropdownMenuItem onClick={() => {
                                                    if (exam.external_exam_link) {
                                                        setEditingExternalExam(exam);
                                                    } else {
                                                        setEditingExam(exam);
                                                    }
                                                    window.scrollTo({ top: 0, behavior: 'smooth' });
                                                }}>
                                                    <Edit className="mr-2 h-4 w-4" /> Edit Details
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => navigate(`/dashboard/leaderboard/${exam.id}`)}>
                                                    <Trophy className="mr-2 h-4 w-4 text-yellow-500" /> Leaderboard
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => {
                                                    const path = exam.external_exam_link ? exam.external_exam_link : (exam.course_id ? `/dashboard/take-exam/${exam.id}` : `/open-exam/${exam.id}`);
                                                    window.open(path, "_blank");
                                                }}>
                                                    <ExternalLink className="mr-2 h-4 w-4" /> Open Exam
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => handleGenerateSolvesheet(exam.id, exam.title)}>
                                                    <FileText className="mr-2 h-4 w-4 text-emerald-600" /> Print Solution
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => handleDownloadCSV(exam.id, exam.title)}>
                                                    <Download className="mr-2 h-4 w-4 text-blue-600" /> Download CSV
                                                </DropdownMenuItem>
                                                <DropdownMenuItem onClick={() => duplicateExamMutation.mutate(exam)}>
                                                    <Copy className="mr-2 h-4 w-4 text-purple-600" /> Duplicate
                                                </DropdownMenuItem>
                                                {isAdmin && (
                                                    <DropdownMenuItem onClick={() => handleRecalculateResults(exam.id)}>
                                                        <RotateCw className="mr-2 h-4 w-4 text-orange-600" /> Recalculate
                                                    </DropdownMenuItem>
                                                )}
                                                {isAdmin && (
                                                  <>
                                                    <DropdownMenuSeparator />
                                                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => {
                                                        if (window.confirm("Delete this exam?")) deleteExamMutation.mutate(exam.id);
                                                    }}>
                                                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                                                    </DropdownMenuItem>
                                                  </>
                                                )}
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        </React.Fragment>
                        );
                    })}
                </div>

                {/* Pagination Controls */}
                <div className="flex items-center justify-between border-t pt-4">
                     <div className="text-xs text-muted-foreground">
                         Page {page + 1} of {totalPages || 1}
                     </div>
                     <div className="flex gap-2">
                         <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                            disabled={page === 0}
                         >
                             <ChevronLeft className="h-4 w-4" />
                             Previous
                         </Button>
                         <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => p + 1)}
                            disabled={page >= totalPages - 1}
                         >
                             Next
                             <ChevronRight className="h-4 w-4" />
                         </Button>
                     </div>
                </div>
                </>
            )}
        </div>
        </Card>
        )}
      </div>
    </section>
  );
};

export default ExamsManager;
