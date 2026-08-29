import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEnrollments } from "@/hooks/useEnrollments";
import { useAuth } from "@/contexts/AuthContext";
import { setExamSourceList } from "@/lib/examSourceTracker";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ArrowLeft, ChevronRight, Sparkles, Loader2, ListChecks, Lock } from "lucide-react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isExamUnlocked = (exam: any, enrolledIds: string[], isAdmin: boolean, fullAccessCourseIds: string[] = [], subChapterGrants: Set<string> = new Set()): boolean => {
  if (isAdmin) return true;
  if (exam.is_visible_on_free) return true;
  if (enrolledIds.length === 0) return false;
  if (fullAccessCourseIds.length > 0 && fullAccessCourseIds.some((id) => enrolledIds.includes(id))) return true;
  if (exam.course_id && enrolledIds.includes(exam.course_id)) return true;
  if (Array.isArray(exam.shared_course_ids) && exam.shared_course_ids.some((id: string) => enrolledIds.includes(id))) return true;
  if (Array.isArray(exam.readymade_course_ids) && exam.readymade_course_ids.some((id: string) => enrolledIds.includes(id))) return true;
  const subs: string[] = Array.isArray(exam.subject) ? exam.subject : (typeof exam.subject === "string" ? [exam.subject] : []);
  const chapter = exam.chapter || "সাধারণ";
  const subChapter = exam.readymade_sub_chapter || "সাধারণ";
  for (const subject of subs) {
    for (const courseId of enrolledIds) {
      if (subChapterGrants.has(`${courseId}|||${subject}|||${chapter}|||${subChapter}`)) return true;
    }
  }
  return false;
};

type PickedExam = {
  id: string;
  title: string;
  subject: string;
  chapter: string | null;
  totalMcq: number;
  count: number; // user-editable MCQ count to pull from this exam
};

const SESSION_KEY = "customExamBuilderState";

type StoredState = {
  picked: [string, PickedExam][];
  targetMarks: number | null;
};

function loadStoredState(): StoredState | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

const CustomExamBuilder = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user, isAdmin } = useAuth();
  const { data: enrollments } = useEnrollments();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enrolledIds: string[] = enrollments?.map((e: any) => e.course_id) || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fullAccessCourseIds: string[] = enrollments?.filter((e: any) => e.course?.readymade_full_access).map((e: any) => e.course_id) || [];

  const { data: subChapterGrants } = useQuery({
    queryKey: ["course-readymade-subchapter-grants", enrolledIds.join(',')],
    queryFn: async () => {
      if (enrolledIds.length === 0) return new Set<string>();
      const { data, error } = await supabase
        .from("course_readymade_access")
        .select("course_id, subject, chapter, sub_chapter")
        .eq("mode", "readymade")
        .in("course_id", enrolledIds);
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return new Set((data || []).map((g: any) => `${g.course_id}|||${g.subject}|||${g.chapter}|||${g.sub_chapter}`));
    },
    enabled: enrolledIds.length > 0,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const initialStored = loadStoredState();

  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<string | null>(null);
  const [picked, setPicked] = useState<Map<string, PickedExam>>(new Map(initialStored?.picked || []));
  const [creating, setCreating] = useState(false);
  const [targetMarks, setTargetMarks] = useState<number | null>(initialStored?.targetMarks ?? null);
  const [showTargetDialog, setShowTargetDialog] = useState(!initialStored?.targetMarks);
  const [customTargetInput, setCustomTargetInput] = useState(initialStored?.targetMarks ? String(initialStored.targetMarks) : "");

  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        picked: Array.from(picked.entries()),
        targetMarks,
      }));
    } catch {
      // ignore quota errors
    }
  }, [picked, targetMarks]);

  // --- Subjects ---
  const { data: subjectsResult, isLoading: loadingSubjects } = useQuery({
    queryKey: ["custom-exam-subjects", enrolledIds.join(','), fullAccessCourseIds.join(','), isAdmin],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exams")
        .select("subject, chapter, course_id, shared_course_ids, readymade_course_ids, readymade_sub_chapter, is_visible_on_free")
        .eq("is_readymade", true).eq("is_published", true)
        .is("parent_exam_id", null);
      if (error) throw error;
      const unique = new Set<string>();
      const unlockMap: Record<string, boolean> = {};
      (data || []).forEach((row: any) => {
        const subs: string[] = Array.isArray(row.subject) ? row.subject : (typeof row.subject === "string" ? [row.subject] : []);
        subs.forEach((s: string) => {
          unique.add(s);
          if (!unlockMap[s]) {
            const rowUnlocked = isExamUnlocked({ ...row, subject: [s] }, enrolledIds, isAdmin, fullAccessCourseIds, subChapterGrants);
            if (rowUnlocked) unlockMap[s] = true;
          }
        });
      });
      const { data: settingsData } = await supabase.from("app_settings").select("value").eq("key", "subject_order_global").maybeSingle();
      const savedOrder: string[] = settingsData?.value ? (settingsData.value as string[]) : [];
      const sortedSubjects = Array.from(unique).sort((a, b) => {
        const iA = savedOrder.indexOf(a), iB = savedOrder.indexOf(b);
        if (iA !== -1 && iB !== -1) return iA - iB;
        if (iA !== -1) return -1; if (iB !== -1) return 1;
        return a.localeCompare(b);
      });
      return { subjects: sortedSubjects, unlockMap };
    },
  });
  const subjects = subjectsResult?.subjects;
  const subjectUnlockMap = subjectsResult?.unlockMap || {};

  // --- Chapters for selected subject ---
  const { data: chaptersResult, isLoading: loadingChapters } = useQuery({
    queryKey: ["custom-exam-chapters", selectedSubject, enrolledIds.join(','), fullAccessCourseIds.join(','), isAdmin],
    queryFn: async () => {
      if (!selectedSubject) return { chapters: [], unlockMap: {} as Record<string, boolean> };
      const { data, error } = await supabase
        .from("exams")
        .select("chapter, sort_order, course_id, shared_course_ids, readymade_course_ids, readymade_sub_chapter, is_visible_on_free")
        .eq("is_readymade", true).eq("is_published", true)
        .is("parent_exam_id", null)
        .contains("subject", [selectedSubject]);
      if (error) throw error;
      const unique = new Set<string>();
      const orderMap = new Map<string, number>();
      const unlockMap: Record<string, boolean> = {};
      const settingsKey = `chapter_order_global_${selectedSubject}`;
      const { data: sd } = await supabase.from("app_settings").select("value").eq("key", settingsKey).maybeSingle();
      const savedOrder: string[] = sd?.value ? (sd.value as string[]) : [];
      (data || []).forEach((row: any) => {
        if (row.chapter) {
          unique.add(row.chapter);
          const cur = orderMap.get(row.chapter) || 0;
          if ((row.sort_order || 0) > cur) orderMap.set(row.chapter, row.sort_order || 0);
          if (!unlockMap[row.chapter]) {
            const rowUnlocked = isExamUnlocked({ ...row, subject: [selectedSubject] }, enrolledIds, isAdmin, fullAccessCourseIds, subChapterGrants);
            if (rowUnlocked) unlockMap[row.chapter] = true;
          }
        }
      });
      const sortedChapters = Array.from(unique).sort((a, b) => {
        const iA = savedOrder.indexOf(a), iB = savedOrder.indexOf(b);
        if (iA !== -1 && iB !== -1) return iA - iB;
        if (iA !== -1) return -1; if (iB !== -1) return 1;
        const oA = orderMap.get(a) || 0, oB = orderMap.get(b) || 0;
        if (oA !== oB) return oB - oA;
        return a.localeCompare(b);
      });
      return { chapters: sortedChapters, unlockMap };
    },
    enabled: !!selectedSubject,
  });
  const chapters = chaptersResult?.chapters;
  const chapterUnlockMap = chaptersResult?.unlockMap || {};

  // --- Exams for selected subject+chapter ---
  const { data: chapterExams, isLoading: loadingExams } = useQuery({
    queryKey: ["custom-exam-exam-list", selectedSubject, selectedChapter],
    queryFn: async () => {
      if (!selectedSubject || !selectedChapter) return [];
      const { data, error } = await supabase
        .from("exams")
        .select("id, title, subject, chapter, readymade_sub_chapter, course_id, shared_course_ids, readymade_course_ids, is_visible_on_free, questions_count:exam_questions(count)")
        .eq("is_readymade", true).eq("is_published", true)
        .is("parent_exam_id", null)
        .contains("subject", [selectedSubject])
        .eq("chapter", selectedChapter)
        .order("sort_order", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedSubject && !!selectedChapter,
  });

  const pickedList = useMemo(() => Array.from(picked.values()), [picked]);

  // Whenever the picked set changes, rebalance every exam's count to an equal
  // average, floor-rounded, with the remainder distributed to the first exams.
  const rebalance = (map: Map<string, PickedExam>, target: number | null) => {
    const list = Array.from(map.values());
    if (list.length === 0) return map;
    const totalAvailable = list.reduce((sum, e) => sum + e.totalMcq, 0);
    const goal = target && target > 0 ? Math.min(target, totalAvailable) : totalAvailable;
    const base = Math.max(1, Math.floor(goal / list.length));
    let remainder = 0;
    const next = new Map<string, PickedExam>();
    list.forEach((e) => {
      const count = Math.min(base, e.totalMcq);
      remainder += base - count; // if capped below base, track leftover to redistribute
      next.set(e.id, { ...e, count: count || Math.min(1, e.totalMcq) });
    });
    // Redistribute any leftover (from capped exams) to exams that have headroom
    let idx = 0;
    while (remainder > 0 && idx < list.length * 3) {
      const e = list[idx % list.length];
      const cur = next.get(e.id)!;
      if (cur.count < e.totalMcq) {
        next.set(e.id, { ...cur, count: cur.count + 1 });
        remainder--;
      }
      idx++;
    }
    return next;
  };

  const toggleExam = (exam: any) => {
    const totalMcq = exam.questions_count?.[0]?.count || 0;
    if (totalMcq <= 0) {
      toast({ title: "এই এক্সামে কোনো MCQ নেই", variant: "destructive" });
      return;
    }
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(exam.id)) {
        next.delete(exam.id);
      } else {
        next.set(exam.id, {
          id: exam.id,
          title: exam.title,
          subject: selectedSubject!,
          chapter: selectedChapter,
          totalMcq,
          count: totalMcq,
        });
      }
      return rebalance(next, targetMarks);
    });
  };

  // Track which subject/chapter cards have been bulk-selected, purely for
  // checkbox display — actual selection truth lives in `picked`.
  const [bulkPickedSubjects, setBulkPickedSubjects] = useState<Set<string>>(new Set());
  const [bulkPickedChapters, setBulkPickedChapters] = useState<Set<string>>(new Set()); // key: "subject::chapter"
  const [selectingWholeSubject, setSelectingWholeSubject] = useState<string | null>(null);
  const [selectingWholeChapter, setSelectingWholeChapter] = useState<string | null>(null);

  // Toggle every unlocked exam under a given subject (checkbox on subject card)
  const toggleAllInSubject = async (subjectName: string) => {
    setSelectingWholeSubject(subjectName);
    try {
      const { data, error } = await supabase
        .from("exams")
        .select("id, title, subject, chapter, readymade_sub_chapter, course_id, shared_course_ids, readymade_course_ids, is_visible_on_free, questions_count:exam_questions(count)")
        .eq("is_readymade", true).eq("is_published", true)
        .is("parent_exam_id", null)
        .contains("subject", [subjectName]);
      if (error) throw error;
      const eligible = (data || []).filter((exam: any) => isExamUnlocked(exam, enrolledIds, isAdmin, fullAccessCourseIds, subChapterGrants) && (exam.questions_count?.[0]?.count || 0) > 0);
      const wasBulkPicked = bulkPickedSubjects.has(subjectName);
      setPicked((prev) => {
        const next = new Map(prev);
        if (wasBulkPicked) {
          eligible.forEach((exam: any) => next.delete(exam.id));
        } else {
          eligible.forEach((exam: any) => {
            if (!next.has(exam.id)) {
              const totalMcq = exam.questions_count?.[0]?.count || 0;
              next.set(exam.id, {
                id: exam.id,
                title: exam.title,
                subject: subjectName,
                chapter: exam.chapter,
                totalMcq,
                count: totalMcq,
              });
            }
          });
        }
        return rebalance(next, targetMarks);
      });
      setBulkPickedSubjects((prev) => {
        const next = new Set(prev);
        if (wasBulkPicked) next.delete(subjectName); else next.add(subjectName);
        return next;
      });
      if (eligible.length === 0) {
        toast({ title: "এই বিষয়ে সিলেক্ট করার মতো কোনো এক্সাম নেই", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "সিলেক্ট করা যায়নি", description: err.message, variant: "destructive" });
    } finally {
      setSelectingWholeSubject(null);
    }
  };

  // Toggle every unlocked exam under a given chapter name within the
  // currently open subject (checkbox on chapter card)
  const toggleAllInChapterByName = async (chapterName: string) => {
    if (!selectedSubject) return;
    setSelectingWholeChapter(chapterName);
    const bulkKey = `${selectedSubject}::${chapterName}`;
    try {
      const { data, error } = await supabase
        .from("exams")
        .select("id, title, subject, chapter, readymade_sub_chapter, course_id, shared_course_ids, readymade_course_ids, is_visible_on_free, questions_count:exam_questions(count)")
        .eq("is_readymade", true).eq("is_published", true)
        .is("parent_exam_id", null)
        .contains("subject", [selectedSubject])
        .eq("chapter", chapterName);
      if (error) throw error;
      const eligible = (data || []).filter((exam: any) => isExamUnlocked(exam, enrolledIds, isAdmin, fullAccessCourseIds, subChapterGrants) && (exam.questions_count?.[0]?.count || 0) > 0);
      const wasBulkPicked = bulkPickedChapters.has(bulkKey);
      setPicked((prev) => {
        const next = new Map(prev);
        if (wasBulkPicked) {
          eligible.forEach((exam: any) => next.delete(exam.id));
        } else {
          eligible.forEach((exam: any) => {
            if (!next.has(exam.id)) {
              const totalMcq = exam.questions_count?.[0]?.count || 0;
              next.set(exam.id, {
                id: exam.id,
                title: exam.title,
                subject: selectedSubject,
                chapter: chapterName,
                totalMcq,
                count: totalMcq,
              });
            }
          });
        }
        return rebalance(next, targetMarks);
      });
      setBulkPickedChapters((prev) => {
        const next = new Set(prev);
        if (wasBulkPicked) next.delete(bulkKey); else next.add(bulkKey);
        return next;
      });
      if (eligible.length === 0) {
        toast({ title: "এই চ্যাপ্টারে সিলেক্ট করার মতো কোনো এক্সাম নেই", variant: "destructive" });
      }
    } catch (err: any) {
      toast({ title: "সিলেক্ট করা যায়নি", description: err.message, variant: "destructive" });
    } finally {
      setSelectingWholeChapter(null);
    }
  };

  const updateCount = (id: string, rawValue: string) => {
    setPicked((prev) => {
      const next = new Map(prev);
      const cur = next.get(id);
      if (!cur) return prev;
      if (rawValue === "") {
        next.set(id, { ...cur, count: 0 });
        return next;
      }
      const parsed = parseInt(rawValue, 10);
      if (isNaN(parsed)) return prev;
      const clamped = Math.min(Math.max(parsed, 0), cur.totalMcq);
      next.set(id, { ...cur, count: clamped });
      return next;
    });
  };

  const finalizeCount = (id: string) => {
    setPicked((prev) => {
      const next = new Map(prev);
      const cur = next.get(id);
      if (!cur) return prev;
      if (!cur.count || cur.count < 1) {
        next.set(id, { ...cur, count: 1 });
      }
      return next;
    });
  };

  const removeExam = (id: string) => {
    setPicked((prev) => {
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  const totalSelectedMcq = pickedList.reduce((sum, e) => sum + e.count, 0);

  const handleCreate = async () => {
    if (pickedList.length === 0) return;
    setCreating(true);
    try {
      const { data, error } = await supabase.rpc("create_custom_exam", {
        p_exam_ids: pickedList.map((e) => e.id),
        p_counts: pickedList.map((e) => e.count),
        p_title: `Custom Exam (${pickedList.length} sources)`,
      });
      if (error) throw error;
      toast({ title: "কাস্টম এক্সাম তৈরি হয়েছে!" });
      setExamSourceList(data, "/dashboard/readymade");
      navigate(`/dashboard/take-exam/${data}`);
    } catch (err: any) {
      toast({ title: "এক্সাম তৈরি করা যায়নি", description: err.message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4 pb-24">
      <Dialog
        open={showTargetDialog}
        onOpenChange={(open) => { if (!open) navigate("/dashboard/readymade"); }}
      >
        <DialogContent
          className="w-[90vw] max-w-sm rounded-2xl max-h-[85vh] overflow-y-auto flex flex-col gap-3"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-primary" />
              কত মার্কের এক্সাম বানাতে চাও?
            </DialogTitle>
            <DialogDescription className="text-xs">
              একটি টার্গেট বেছে নাও। পরে যতগুলো এক্সাম সিলেক্ট করবে, MCQ সংখ্যা এই টার্গেট অনুযায়ী auto-average হয়ে বসবে — চাইলে কমাতে/বাড়াতে পারবে।
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-3 gap-2">
            {[25, 50, 100, 150, 200].map((n) => (
              <Button
                key={n}
                type="button"
                variant={targetMarks === n ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  setTargetMarks(n);
                  setCustomTargetInput("");
                }}
              >
                {n}
              </Button>
            ))}
          </div>

          <Input
            type="number"
            min={1}
            placeholder="নিজের মতো সংখ্যা লিখো"
            value={customTargetInput}
            onChange={(e) => {
              setCustomTargetInput(e.target.value);
              const v = parseInt(e.target.value, 10);
              setTargetMarks(v > 0 ? v : null);
            }}
          />

          <Button
            className="w-full"
            disabled={!targetMarks || targetMarks <= 0}
            onClick={() => {
              setPicked((prev) => rebalance(prev, targetMarks));
              setShowTargetDialog(false);
            }}
          >
            পরবর্তী ধাপ
          </Button>
        </DialogContent>
      </Dialog>

      {!showTargetDialog && (
      <>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            if (selectedChapter) setSelectedChapter(null);
            else if (selectedSubject) setSelectedSubject(null);
            else navigate(-1);
          }}
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-lg font-semibold tracking-tight flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> কাস্টম এক্সাম বানাও
        </h1>
        <Badge variant="secondary" className="ml-auto cursor-pointer" onClick={() => setShowTargetDialog(true)}>
          টার্গেট: {targetMarks} মার্ক
        </Badge>
      </div>

      {/* Breadcrumb / navigation */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground flex-wrap">
        <button className="hover:underline" onClick={() => { setSelectedSubject(null); setSelectedChapter(null); }}>বিষয়সমূহ</button>
        {selectedSubject && (<><ChevronRight className="h-3 w-3" /><button className="hover:underline" onClick={() => setSelectedChapter(null)}>{selectedSubject}</button></>)}
        {selectedChapter && (<><ChevronRight className="h-3 w-3" /><span>{selectedChapter}</span></>)}
      </div>

      {/* Subject grid — each card has its own checkbox that bulk-selects every
          exam under that subject, alongside tapping the card to drill in */}
      {!selectedSubject && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {loadingSubjects ? <Loader2 className="h-5 w-5 animate-spin" /> : subjects?.map((s) => {
            const isBulkPicked = bulkPickedSubjects.has(s);
            const subjectUnlocked = !!subjectUnlockMap[s];
            return (
            <Card
              key={s}
              className={`relative ${subjectUnlocked ? "cursor-pointer hover:border-primary/50" : "cursor-not-allowed opacity-60 border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/10"}`}
              onClick={() => {
                if (!subjectUnlocked) {
                  toast({ title: "Locked", description: `"${s}" বিষয়ে আপনার এক্সেস নেই। ভর্তি হলে আনলক হয়ে যাবে।` });
                  return;
                }
                setSelectedSubject(s);
              }}
            >
              <CardContent className="p-3 flex items-center gap-2">
                <Checkbox
                  checked={isBulkPicked}
                  disabled={selectingWholeSubject === s || !subjectUnlocked}
                  onCheckedChange={() => toggleAllInSubject(s)}
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="flex-1 text-sm font-medium">{s}</span>
                {selectingWholeSubject === s ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : !subjectUnlocked ? <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}

      {/* Chapter grid — each card has its own checkbox that bulk-selects
          every exam under that chapter, alongside tapping to drill in */}
      {selectedSubject && !selectedChapter && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {loadingChapters ? <Loader2 className="h-5 w-5 animate-spin" /> : chapters?.map((c) => {
            const isBulkPicked = bulkPickedChapters.has(`${selectedSubject}::${c}`);
            const chapterUnlocked = !!chapterUnlockMap[c];
            return (
            <Card
              key={c}
              className={`relative ${chapterUnlocked ? "cursor-pointer hover:border-primary/50" : "cursor-not-allowed opacity-60 border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/10"}`}
              onClick={() => {
                if (!chapterUnlocked) {
                  toast({ title: "Locked", description: `"${c}" চ্যাপ্টারে আপনার এক্সেস নেই। ভর্তি হলে আনলক হয়ে যাবে।` });
                  return;
                }
                setSelectedChapter(c);
              }}
            >
              <CardContent className="p-3 flex items-center gap-2">
                <Checkbox
                  checked={isBulkPicked}
                  disabled={selectingWholeChapter === c || !chapterUnlocked}
                  onCheckedChange={() => toggleAllInChapterByName(c)}
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="flex-1 text-sm font-medium">{c}</span>
                {selectingWholeChapter === c ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : !chapterUnlocked ? <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}

      {/* Exam checklist */}
      {selectedSubject && selectedChapter && (
        <div className="space-y-2">
          {loadingExams ? <Loader2 className="h-5 w-5 animate-spin" /> : chapterExams?.map((exam: any) => {
            const unlocked = isExamUnlocked(exam, enrolledIds, isAdmin, fullAccessCourseIds, subChapterGrants);
            const totalMcq = exam.questions_count?.[0]?.count || 0;
            const isPicked = picked.has(exam.id);
            return (
              <Card key={exam.id} className={`${!unlocked ? "opacity-50" : ""}`}>
                <CardContent className="p-3 flex items-center gap-3">
                  <Checkbox
                    checked={isPicked}
                    disabled={!unlocked}
                    onCheckedChange={() => unlocked && toggleExam(exam)}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{exam.title}</p>
                    <p className="text-xs text-muted-foreground">{totalMcq} MCQ</p>
                  </div>
                  {!unlocked && <Badge variant="secondary" className="text-[10px]">লকড</Badge>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Sticky selection summary + count editor + submit */}
      {pickedList.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 sm:left-auto sm:right-4 sm:bottom-4 sm:w-96 bg-background border rounded-t-xl sm:rounded-xl shadow-2xl z-50 flex flex-col max-h-[30vh]">
          <div className="flex items-center justify-between p-3 pb-2 shrink-0">
            <p className="text-sm font-semibold flex items-center gap-1.5">
              <ListChecks className="h-4 w-4 text-primary" /> নির্বাচিত: {pickedList.length}টি এক্সাম
            </p>
            <Badge className="bg-primary/10 text-primary border-primary/30">মোট MCQ: {totalSelectedMcq}</Badge>
          </div>
          <div className="space-y-1 px-3 overflow-y-auto flex-1 min-h-0">
            {pickedList.map((e) => (
              <div key={e.id} className="flex items-center gap-1.5 text-[11px] border rounded-lg px-2 py-1">
                <p className="flex-1 min-w-0 truncate font-medium" title={e.title}>{e.title}</p>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={e.count === 0 ? "" : e.count}
                  onChange={(ev) => {
                    const v = ev.target.value.replace(/[^0-9]/g, "");
                    updateCount(e.id, v);
                  }}
                  onBlur={() => finalizeCount(e.id)}
                  className="w-14 h-7 text-xs text-center px-1 shrink-0"
                />
                <span className="text-muted-foreground shrink-0">/{e.totalMcq}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => removeExam(e.id)}>×</Button>
              </div>
            ))}
          </div>
          <div className="p-3 pt-2 shrink-0 border-t">
            <Button className="w-full" disabled={creating} onClick={handleCreate}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
              এক্সাম শুরু করো
            </Button>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
};

export default CustomExamBuilder;
