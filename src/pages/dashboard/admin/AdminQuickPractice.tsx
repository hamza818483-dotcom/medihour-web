import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Trash2, UploadCloud, Zap, Loader2, Pencil, Check, X, Database as DatabaseIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { QuestionBankSelector } from "@/components/admin/QuestionBankSelector";
import type { QuestionData } from "@/types/exam";

interface CsvRow {
  question: string;
  options: string[];
  correct_index: number;
  explanation: string;
}


function parseCsv(text: string): string[][] {
  // simple CSV parser handling quoted commas and multiline quoted fields
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      cur.push(field);
      field = "";
    } else if (c === "\r") {
      // skip; \n (below) handles the row break
    } else if (c === "\n") {
      if (field.length || cur.length) {
        cur.push(field);
        rows.push(cur);
        cur = [];
        field = "";
      }
    } else {
      field += c;
    }
  }
  if (field.length || cur.length) {
    cur.push(field);
    rows.push(cur);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function parseCsvToMcqs(text: string): CsvRow[] {
  const lines = parseCsv(text.replace(/\t/g, ","));
  if (lines.length < 2) return [];
  const header = lines[0].map((h) => h.replace(/^\uFEFF/, "").trim().toLowerCase());
  const idx = (names: string[]) => {
    for (const n of names) {
      const i = header.indexOf(n);
      if (i >= 0) return i;
    }
    return -1;
  };
  const qIdx = idx(["question", "questions"]);
  const o1 = idx(["option1", "option 1"]);
  const o2 = idx(["option2", "option 2"]);
  const o3 = idx(["option3", "option 3"]);
  const o4 = idx(["option4", "option 4"]);
  const o5 = idx(["option5", "option 5"]);
  const aIdx = idx(["answer", "answers"]);
  const eIdx = idx(["explanation", "explanations"]);

  const data: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i];
    if (cols.length < 6) continue;
    const opts = [cols[o1], cols[o2], cols[o3], cols[o4], o5 >= 0 ? cols[o5] : null].filter(
      (o): o is string => !!o && o.trim() !== ""
    );
    const answerNum = parseInt(cols[aIdx], 10) || 1;
    data.push({
      question: cols[qIdx] || "",
      options: opts,
      correct_index: answerNum - 1,
      explanation: eIdx >= 0 ? cols[eIdx] || "" : "",
    });
  }
  return data;
}

const AdminQuickPractice = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [subjectName, setSubjectName] = useState("");
  const [chapterName, setChapterName] = useState("");
  const [csvData, setCsvData] = useState<CsvRow[] | null>(null);
  const [csvFileName, setCsvFileName] = useState("");

  const [saving, setSaving] = useState(false);

  // Import from Question Bank (readymade/regular/archive exams) -> Quick Practice
  const [isQbOpen, setIsQbOpen] = useState(false);
  const [qbQuestions, setQbQuestions] = useState<QuestionData[] | null>(null);

  const handleQbSelect = (questions: QuestionData[]) => {
    setCsvData(null);
    setCsvFileName("");
    setQbQuestions((prev) => [...(prev || []), ...questions]);
    setIsQbOpen(false);
    toast({ title: `${questions.length}টি প্রশ্ন যোগ হয়েছে`, description: "নিচে সেভ করুন" });
  };

  const [expandedSubject, setExpandedSubject] = useState<number | null>(null);
  const [expandedChapter, setExpandedChapter] = useState<number | null>(null);
  const [expandedTopic, setExpandedTopic] = useState<number | null>(null);

  // Topic add/rename state
  const [newTopicName, setNewTopicName] = useState("");
  const [addingTopic, setAddingTopic] = useState(false);
  const [editingTopicId, setEditingTopicId] = useState<number | null>(null);
  const [editTopicName, setEditTopicName] = useState("");
  const [savingTopicName, setSavingTopicName] = useState(false);

  // Inline rename state for subject/chapter
  const [editingSubjectId, setEditingSubjectId] = useState<number | null>(null);
  const [editSubjectName, setEditSubjectName] = useState("");
  const [savingSubjectName, setSavingSubjectName] = useState(false);
  const [editingChapterId, setEditingChapterId] = useState<number | null>(null);
  const [editChapterName, setEditChapterName] = useState("");
  const [savingChapterName, setSavingChapterName] = useState(false);

  // Inline edit state for an existing MCQ
  const [editingMcqId, setEditingMcqId] = useState<number | null>(null);
  const [editQuestion, setEditQuestion] = useState("");
  const [editOptions, setEditOptions] = useState<string[]>([]);
  const [editCorrect, setEditCorrect] = useState(0);
  const [editExplanation, setEditExplanation] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    document.title = "Quick Practice — Admin";
  }, []);

  const { data: subjects, isLoading } = useQuery({
    queryKey: ["admin-qp-subjects"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("qp_subjects")
        .select("id, name, sort_order")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: chaptersOfSubject } = useQuery({
    queryKey: ["admin-qp-chapters", expandedSubject],
    enabled: expandedSubject !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("qp_chapters")
        .select("id, name, subject_id")
        .eq("subject_id", expandedSubject!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const withCounts = await Promise.all(
        (data || []).map(async (ch) => {
          const { count } = await supabase
            .from("qp_mcqs")
            .select("id", { count: "exact", head: true })
            .eq("chapter_id", ch.id);
          return { ...ch, mcqCount: count || 0 };
        })
      );
      return withCounts;
    },
  });

  const { data: topicsOfChapter } = useQuery({
    queryKey: ["admin-qp-topics", expandedChapter],
    enabled: expandedChapter !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("qp_topics")
        .select("id, name, chapter_id, sort_order")
        .eq("chapter_id", expandedChapter!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const withCounts = await Promise.all(
        (data || []).map(async (t) => {
          const { count } = await supabase
            .from("qp_mcqs")
            .select("id", { count: "exact", head: true })
            .eq("topic_id", t.id);
          return { ...t, mcqCount: count || 0 };
        })
      );
      return withCounts;
    },
  });

  const { data: mcqsOfChapter } = useQuery({
    queryKey: ["admin-qp-mcqs", expandedChapter],
    enabled: expandedChapter !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("qp_mcqs")
        .select("id, question, options, correct_index, explanation, topic_id")
        .eq("chapter_id", expandedChapter!)
        .is("topic_id", null)
        .order("id", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: mcqsOfTopic } = useQuery({
    queryKey: ["admin-qp-topic-mcqs", expandedTopic],
    enabled: expandedTopic !== null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("qp_mcqs")
        .select("id, question, options, correct_index, explanation, topic_id")
        .eq("topic_id", expandedTopic!)
        .order("id", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const handleFile = (file: File) => {
    setCsvFileName(file.name);
    setQbQuestions(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = String(e.target?.result || "");
      const parsed = parseCsvToMcqs(text);
      if (!parsed.length) {
        toast({ title: "CSV-এ কোনো ডাটা পাওয়া যায়নি", variant: "destructive" });
        return;
      }
      setCsvData(parsed);
      toast({ title: `${parsed.length}টি প্রশ্ন লোড হয়েছে` });
    };
    reader.readAsText(file);
  };

  const clearForm = () => {
    setSubjectName("");
    setChapterName("");
    setCsvData(null);
    setCsvFileName("");
    setQbQuestions(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const findOrCreateSubject = async (name: string): Promise<number> => {
    const { data: existingSubj } = await supabase
      .from("qp_subjects")
      .select("id")
      .eq("name", name.trim())
      .maybeSingle();
    if (existingSubj) return existingSubj.id;
    const { data: lastSubj } = await supabase
      .from("qp_subjects")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const sort = (lastSubj?.sort_order || 0) + 1;
    const { data: newSubj, error } = await supabase
      .from("qp_subjects")
      .insert({ name: name.trim(), sort_order: sort })
      .select("id")
      .single();
    if (error) throw error;
    return newSubj.id;
  };

  const findOrCreateChapter = async (subjId: number, name: string): Promise<number> => {
    const { data: existingChap } = await supabase
      .from("qp_chapters")
      .select("id")
      .eq("subject_id", subjId)
      .eq("name", name.trim())
      .maybeSingle();
    if (existingChap) return existingChap.id;
    const { data: lastChap } = await supabase
      .from("qp_chapters")
      .select("sort_order")
      .eq("subject_id", subjId)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const sortC = (lastChap?.sort_order || 0) + 1;
    const { data: newChap, error } = await supabase
      .from("qp_chapters")
      .insert({ subject_id: subjId, name: name.trim(), sort_order: sortC })
      .select("id")
      .single();
    if (error) throw error;
    return newChap.id;
  };

  const saveAll = async () => {
    if (!subjectName.trim() || !chapterName.trim()) {
      toast({ title: "বিষয় ও অধ্যায়ের নাম দিন", variant: "destructive" });
      return;
    }
    const sourceRows = qbQuestions?.length
      ? qbQuestions.map((q) => {
          const correctIdxMap: Record<string, number> = { A: 0, B: 1, C: 2, D: 3 };
          return {
            question: q.question,
            options: [q.options?.A, q.options?.B, q.options?.C, q.options?.D].filter(Boolean),
            correct_index: correctIdxMap[q.correct_answer as string] ?? 0,
            explanation: q.explanation || "",
          };
        })
      : csvData;
    if (!sourceRows?.length) {
      toast({ title: "CSV আপলোড করুন অথবা Question Bank থেকে প্রশ্ন সিলেক্ট করুন", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const subjId = await findOrCreateSubject(subjectName);
      const chapId = await findOrCreateChapter(subjId, chapterName);

      const rows = sourceRows.map((d) => ({
        chapter_id: chapId,
        question: d.question,
        options: d.options,
        correct_index: d.correct_index,
        explanation: d.explanation || null,
      }));
      const { error: insertErr } = await supabase.from("qp_mcqs").insert(rows);
      if (insertErr) throw insertErr;

      toast({ title: `${rows.length}টি MCQ সেভ হয়েছে` });
      clearForm();
      queryClient.invalidateQueries({ queryKey: ["admin-qp-subjects"] });
      queryClient.invalidateQueries({ queryKey: ["admin-qp-chapters"] });
    } catch (e: any) {
      toast({ title: "এরর হয়েছে", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const startEditMcq = (m: { id: number; question: string; options: string[]; correct_index: number; explanation?: string | null }) => {
    setEditingMcqId(m.id);
    setEditQuestion(m.question);
    const opts = [...m.options];
    while (opts.length < 4) opts.push("");
    setEditOptions(opts);
    setEditCorrect(m.correct_index);
    setEditExplanation(m.explanation || "");
  };

  const cancelEditMcq = () => {
    setEditingMcqId(null);
    setEditQuestion("");
    setEditOptions([]);
    setEditCorrect(0);
    setEditExplanation("");
  };

  const saveEditMcq = async () => {
    if (editingMcqId === null) return;
    const filledOptions = editOptions.map((o) => o.trim()).filter(Boolean);
    if (!editQuestion.trim() || filledOptions.length < 2) {
      toast({ title: "প্রশ্ন ও অন্তত ২টি অপশন দিন", variant: "destructive" });
      return;
    }
    if (editCorrect >= filledOptions.length) {
      toast({ title: "সঠিক অপশন বেছে নিন", variant: "destructive" });
      return;
    }
    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from("qp_mcqs")
        .update({
          question: editQuestion.trim(),
          options: filledOptions,
          correct_index: editCorrect,
          explanation: editExplanation.trim() || null,
        })
        .eq("id", editingMcqId);
      if (error) throw error;
      toast({ title: "MCQ আপডেট হয়েছে" });
      cancelEditMcq();
      queryClient.invalidateQueries({ queryKey: ["admin-qp-mcqs"] });
    } catch (e: any) {
      toast({ title: "এরর হয়েছে", description: e.message, variant: "destructive" });
    } finally {
      setSavingEdit(false);
    }
  };

  const startEditSubject = (s: { id: number; name: string }) => {
    setEditingSubjectId(s.id);
    setEditSubjectName(s.name);
  };

  const cancelEditSubject = () => {
    setEditingSubjectId(null);
    setEditSubjectName("");
  };

  const saveEditSubject = async () => {
    if (editingSubjectId === null || !editSubjectName.trim()) return;
    setSavingSubjectName(true);
    try {
      const { error } = await supabase
        .from("qp_subjects")
        .update({ name: editSubjectName.trim() })
        .eq("id", editingSubjectId);
      if (error) throw error;
      toast({ title: "বিষয়ের নাম আপডেট হয়েছে" });
      cancelEditSubject();
      queryClient.invalidateQueries({ queryKey: ["admin-qp-subjects"] });
    } catch (e: any) {
      toast({ title: "এরর হয়েছে", description: e.message, variant: "destructive" });
    } finally {
      setSavingSubjectName(false);
    }
  };

  const startEditChapter = (ch: { id: number; name: string }) => {
    setEditingChapterId(ch.id);
    setEditChapterName(ch.name);
  };

  const cancelEditChapter = () => {
    setEditingChapterId(null);
    setEditChapterName("");
  };

  const saveEditChapter = async () => {
    if (editingChapterId === null || !editChapterName.trim()) return;
    setSavingChapterName(true);
    try {
      const { error } = await supabase
        .from("qp_chapters")
        .update({ name: editChapterName.trim() })
        .eq("id", editingChapterId);
      if (error) throw error;
      toast({ title: "অধ্যায়ের নাম আপডেট হয়েছে" });
      cancelEditChapter();
      queryClient.invalidateQueries({ queryKey: ["admin-qp-chapters"] });
    } catch (e: any) {
      toast({ title: "এরর হয়েছে", description: e.message, variant: "destructive" });
    } finally {
      setSavingChapterName(false);
    }
  };

  const addTopic = async (chapId: number) => {
    if (!newTopicName.trim()) return;
    setAddingTopic(true);
    try {
      const { data: lastTopic } = await supabase
        .from("qp_topics")
        .select("sort_order")
        .eq("chapter_id", chapId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const sortT = (lastTopic?.sort_order || 0) + 1;
      const { error } = await supabase
        .from("qp_topics")
        .insert({ chapter_id: chapId, name: newTopicName.trim(), sort_order: sortT });
      if (error) throw error;
      toast({ title: "টপিক যোগ হয়েছে" });
      setNewTopicName("");
      queryClient.invalidateQueries({ queryKey: ["admin-qp-topics", chapId] });
    } catch (e: any) {
      toast({ title: "এরর হয়েছে", description: e.message, variant: "destructive" });
    } finally {
      setAddingTopic(false);
    }
  };

  const startEditTopic = (t: { id: number; name: string }) => {
    setEditingTopicId(t.id);
    setEditTopicName(t.name);
  };

  const cancelEditTopic = () => {
    setEditingTopicId(null);
    setEditTopicName("");
  };

  const saveEditTopic = async () => {
    if (editingTopicId === null || !editTopicName.trim()) return;
    setSavingTopicName(true);
    try {
      const { error } = await supabase
        .from("qp_topics")
        .update({ name: editTopicName.trim() })
        .eq("id", editingTopicId);
      if (error) throw error;
      toast({ title: "টপিকের নাম আপডেট হয়েছে" });
      cancelEditTopic();
      queryClient.invalidateQueries({ queryKey: ["admin-qp-topics"] });
    } catch (e: any) {
      toast({ title: "এরর হয়েছে", description: e.message, variant: "destructive" });
    } finally {
      setSavingTopicName(false);
    }
  };

  const deleteTopic = async (topicId: number, chapId: number) => {
    if (!confirm("এই টপিক ডিলিট হবে। এর MCQ গুলো টপিকহীন অধ্যায়ে থেকে যাবে। নিশ্চিত?")) return;
    const { error } = await supabase.from("qp_topics").delete().eq("id", topicId);
    if (error) {
      toast({ title: "ডিলিট ব্যর্থ", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "টপিক ডিলিট হয়েছে" });
    if (expandedTopic === topicId) setExpandedTopic(null);
    queryClient.invalidateQueries({ queryKey: ["admin-qp-topics", chapId] });
    queryClient.invalidateQueries({ queryKey: ["admin-qp-mcqs", chapId] });
  };

  const deleteChapter = async (chapId: number) => {
    if (!confirm("এই অধ্যায় ও এর সব MCQ ডিলিট হবে। নিশ্চিত?")) return;
    const { error } = await supabase.from("qp_chapters").delete().eq("id", chapId);
    if (error) {
      toast({ title: "ডিলিট ব্যর্থ", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "অধ্যায় ডিলিট হয়েছে" });
    queryClient.invalidateQueries({ queryKey: ["admin-qp-chapters"] });
  };

  const deleteSubject = async (subjId: number) => {
    if (!confirm("এই বিষয়, সব অধ্যায় ও MCQ ডিলিট হবে। নিশ্চিত?")) return;
    const { error } = await supabase.from("qp_subjects").delete().eq("id", subjId);
    if (error) {
      toast({ title: "ডিলিট ব্যর্থ", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "বিষয় ডিলিট হয়েছে" });
    queryClient.invalidateQueries({ queryKey: ["admin-qp-subjects"] });
  };

  const deleteMcq = async (mcqId: number) => {
    const { error } = await supabase.from("qp_mcqs").delete().eq("id", mcqId);
    if (error) {
      toast({ title: "ডিলিট ব্যর্থ", variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["admin-qp-mcqs"] });
    queryClient.invalidateQueries({ queryKey: ["admin-qp-topic-mcqs"] });
    queryClient.invalidateQueries({ queryKey: ["admin-qp-chapters"] });
    queryClient.invalidateQueries({ queryKey: ["admin-qp-topics"] });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Zap className="h-5 w-5 text-violet-500" /> Quick Practice ম্যানেজার
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          বিষয়, অধ্যায় ও CSV থেকে MCQ যোগ করুন — একবারে।
        </p>
      </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">নতুন MCQ যোগ করুন</CardTitle>
            <CardDescription>
              CSV কলাম: question, option1, option2, option3, option4, option5 (ঐচ্ছিক), answer (১-৫), explanation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <Input
                placeholder="বিষয়ের নাম (যেমন: পদার্থবিজ্ঞান)"
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                list="qp-subject-list"
              />
              <datalist id="qp-subject-list">
                {subjects?.map((s) => (
                  <option key={s.id} value={s.name} />
                ))}
              </datalist>
              <Input
                placeholder="অধ্যায়ের নাম (যেমন: ভেক্টর)"
                value={chapterName}
                onChange={(e) => setChapterName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <div
                className="border-2 border-dashed rounded-lg p-2 sm:p-4 text-center cursor-pointer hover:border-primary/50"
                onClick={() => fileRef.current?.click()}
              >
                <UploadCloud className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-sm">{csvFileName || "CSV আপলোড করুন"}</p>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
                {csvData && (
                  <p className="text-xs text-emerald-600 font-semibold mt-1.5">
                    ✓ {csvData.length}টি প্রশ্ন প্রস্তুত
                  </p>
                )}
              </div>

              <div
                className="border-2 border-dashed rounded-lg p-2 sm:p-4 text-center cursor-pointer hover:border-primary/50 flex flex-col items-center justify-center"
                onClick={() => setIsQbOpen(true)}
              >
                <DatabaseIcon className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                <p className="text-sm">Question Bank থেকে সিলেক্ট করুন</p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  রেডিমেড Exam থেকে পুরো এক্সাম বা আলাদা MCQ যোগ করুন
                </p>
                {!!qbQuestions?.length && (
                  <div className="mt-2 flex items-center gap-2">
                    <p className="text-xs text-primary">{qbQuestions.length}টি প্রশ্ন সিলেক্ট করা হয়েছে</p>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setQbQuestions(null);
                      }}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={saveAll} disabled={saving} className="flex-1">
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                সেভ করুন
              </Button>
              <Button variant="outline" onClick={clearForm} disabled={saving}>
                ক্লিয়ার
              </Button>
            </div>
          </CardContent>
        </Card>

        <Dialog open={isQbOpen} onOpenChange={setIsQbOpen}>
          <DialogContent className="max-w-5xl h-[85vh] p-0 overflow-hidden">
            <DialogHeader className="p-4 pb-0">
              <DialogTitle>Question Bank থেকে প্রশ্ন সিলেক্ট করুন</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-hidden p-4 pt-2 h-[calc(85vh-60px)]">
              <QuestionBankSelector onSelect={handleQbSelect} />
            </div>
          </DialogContent>
        </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            বিষয় ও অধ্যায় সমূহ {subjects ? `(${subjects.length}টি)` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground">লোড হচ্ছে...</p>}
          {!isLoading && (!subjects || subjects.length === 0) && (
            <p className="text-sm text-muted-foreground">কোনো বিষয় নেই। উপরে যোগ করুন।</p>
          )}
          {subjects?.map((s) => {
            const isOpen = expandedSubject === s.id;
            return (
              <div key={s.id} className="border rounded-xl overflow-hidden">
                {editingSubjectId === s.id ? (
                  <div className="flex items-center gap-2 p-3">
                    <Input
                      value={editSubjectName}
                      onChange={(e) => setEditSubjectName(e.target.value)}
                      className="h-8 text-sm flex-1"
                      autoFocus
                    />
                    <Button
                      size="icon"
                      className="h-8 w-8"
                      onClick={saveEditSubject}
                      disabled={savingSubjectName}
                    >
                      {savingSubjectName ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-8 w-8"
                      onClick={cancelEditSubject}
                      disabled={savingSubjectName}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="w-full flex items-center gap-2 p-3 hover:bg-muted/40">
                    <button
                      onClick={() => setExpandedSubject(isOpen ? null : s.id)}
                      className="flex-1 flex items-center gap-2 text-left"
                    >
                      <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
                      <span className="font-semibold text-sm">{s.name}</span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground"
                      onClick={() => startEditSubject(s)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => deleteSubject(s.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}

                {isOpen && (
                  <div className="border-t bg-muted/20 p-2 space-y-1.5">
                    {chaptersOfSubject?.map((ch) => {
                      const chOpen = expandedChapter === ch.id;
                      return (
                        <div key={ch.id} className="border rounded-lg bg-card overflow-hidden">
                          {editingChapterId === ch.id ? (
                            <div className="flex items-center gap-1.5 p-2.5">
                              <Input
                                value={editChapterName}
                                onChange={(e) => setEditChapterName(e.target.value)}
                                className="h-7 text-xs flex-1"
                                autoFocus
                              />
                              <Button
                                size="icon"
                                className="h-7 w-7"
                                onClick={saveEditChapter}
                                disabled={savingChapterName}
                              >
                                {savingChapterName ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Check className="h-3.5 w-3.5" />
                                )}
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                onClick={cancelEditChapter}
                                disabled={savingChapterName}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ) : (
                          <div className="flex items-center gap-2 p-2.5">
                            <button
                              onClick={() => setExpandedChapter(chOpen ? null : ch.id)}
                              className="flex-1 flex items-center gap-2 text-left text-xs"
                            >
                              <ChevronDown
                                className={cn("h-3.5 w-3.5 transition-transform", chOpen && "rotate-180")}
                              />
                              <span className="font-medium">{ch.name}</span>
                              <span className="text-muted-foreground">({ch.mcqCount} MCQ)</span>
                            </button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-muted-foreground"
                              onClick={() => startEditChapter(ch)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => deleteChapter(ch.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          )}
                          {chOpen && (
                            <div className="border-t p-2 space-y-1.5">
                              {/* Topics list */}
                              <div className="space-y-1.5">
                                {topicsOfChapter?.map((t) => {
                                  const tOpen = expandedTopic === t.id;
                                  return (
                                    <div key={t.id} className="border rounded-md bg-background overflow-hidden">
                                      {editingTopicId === t.id ? (
                                        <div className="flex items-center gap-1.5 p-2">
                                          <Input
                                            value={editTopicName}
                                            onChange={(e) => setEditTopicName(e.target.value)}
                                            className="h-6 text-[11px] flex-1"
                                            autoFocus
                                          />
                                          <Button
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={saveEditTopic}
                                            disabled={savingTopicName}
                                          >
                                            {savingTopicName ? (
                                              <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : (
                                              <Check className="h-3 w-3" />
                                            )}
                                          </Button>
                                          <Button
                                            variant="outline"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={cancelEditTopic}
                                            disabled={savingTopicName}
                                          >
                                            <X className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-1.5 p-2">
                                          <button
                                            onClick={() => setExpandedTopic(tOpen ? null : t.id)}
                                            className="flex-1 flex items-center gap-1.5 text-left text-[11px]"
                                          >
                                            <ChevronDown
                                              className={cn("h-3 w-3 transition-transform", tOpen && "rotate-180")}
                                            />
                                            <span className="font-medium">📁 {t.name}</span>
                                            <span className="text-muted-foreground">({t.mcqCount} MCQ)</span>
                                          </button>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 text-muted-foreground"
                                            onClick={() => startEditTopic(t)}
                                          >
                                            <Pencil className="h-3 w-3" />
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6 text-destructive hover:text-destructive"
                                            onClick={() => deleteTopic(t.id, ch.id)}
                                          >
                                            <Trash2 className="h-3 w-3" />
                                          </Button>
                                        </div>
                                      )}
                                      {tOpen && (
                                        <div className="border-t p-1.5 space-y-1.5 max-h-64 overflow-y-auto">
                                          {mcqsOfTopic?.map((m) => {
                                            const isEditing = editingMcqId === m.id;
                                            if (isEditing) {
                                              return (
                                                <div key={m.id} className="bg-card border rounded-md p-2 space-y-1.5">
                                                  <Input
                                                    value={editQuestion}
                                                    onChange={(e) => setEditQuestion(e.target.value)}
                                                    className="text-xs h-7"
                                                    placeholder="প্রশ্ন"
                                                  />
                                                  <div className="grid grid-cols-2 gap-1.5">
                                                    {editOptions.map((opt, i) => (
                                                      <div key={i} className="flex items-center gap-1">
                                                        <button
                                                          type="button"
                                                          onClick={() => setEditCorrect(i)}
                                                          className={cn(
                                                            "h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center text-[9px] font-bold",
                                                            editCorrect === i
                                                              ? "bg-emerald-500 border-emerald-500 text-white"
                                                              : "border-border text-muted-foreground"
                                                          )}
                                                        >
                                                          {String.fromCharCode(65 + i)}
                                                        </button>
                                                        <Input
                                                          value={opt}
                                                          onChange={(e) =>
                                                            setEditOptions((prev) =>
                                                              prev.map((o, idx) => (idx === i ? e.target.value : o))
                                                            )
                                                          }
                                                          className="text-[11px] h-7"
                                                          placeholder={`অপশন ${i + 1}`}
                                                        />
                                                      </div>
                                                    ))}
                                                  </div>
                                                  <Input
                                                    value={editExplanation}
                                                    onChange={(e) => setEditExplanation(e.target.value)}
                                                    className="text-xs h-7"
                                                    placeholder="ব্যাখ্যা (ঐচ্ছিক)"
                                                  />
                                                  <div className="flex gap-1.5">
                                                    <Button
                                                      size="sm"
                                                      className="h-7 flex-1 text-[11px]"
                                                      onClick={saveEditMcq}
                                                      disabled={savingEdit}
                                                    >
                                                      {savingEdit ? (
                                                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                                      ) : (
                                                        <Check className="h-3 w-3 mr-1" />
                                                      )}
                                                      সেভ
                                                    </Button>
                                                    <Button
                                                      size="sm"
                                                      variant="outline"
                                                      className="h-7 text-[11px]"
                                                      onClick={cancelEditMcq}
                                                      disabled={savingEdit}
                                                    >
                                                      <X className="h-3 w-3 mr-1" />
                                                      বাতিল
                                                    </Button>
                                                  </div>
                                                </div>
                                              );
                                            }
                                            return (
                                              <div
                                                key={m.id}
                                                className="flex items-start gap-2 text-[11px] bg-muted/30 rounded-md p-2"
                                              >
                                                <span className="flex-1">{m.question}</span>
                                                <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  className="h-5 w-5 text-muted-foreground flex-shrink-0"
                                                  onClick={() => startEditMcq(m)}
                                                >
                                                  <Pencil className="h-3 w-3" />
                                                </Button>
                                                <Button
                                                  variant="ghost"
                                                  size="icon"
                                                  className="h-5 w-5 text-destructive flex-shrink-0"
                                                  onClick={() => deleteMcq(m.id)}
                                                >
                                                  <Trash2 className="h-3 w-3" />
                                                </Button>
                                              </div>
                                            );
                                          })}
                                          {mcqsOfTopic?.length === 0 && (
                                            <p className="text-[11px] text-muted-foreground text-center py-1.5">
                                              কোনো MCQ নেই
                                            </p>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                                <div className="flex items-center gap-1.5">
                                  <Input
                                    value={expandedChapter === ch.id ? newTopicName : ""}
                                    onChange={(e) => setNewTopicName(e.target.value)}
                                    placeholder="নতুন টপিকের নাম (ঐচ্ছিক)"
                                    className="h-7 text-[11px]"
                                  />
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-[11px] shrink-0"
                                    onClick={() => addTopic(ch.id)}
                                    disabled={addingTopic || !newTopicName.trim()}
                                  >
                                    {addingTopic ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      "টপিক যোগ"
                                    )}
                                  </Button>
                                </div>
                              </div>

                              <div className="pt-1 text-[10px] text-muted-foreground px-0.5">
                                টপিক ছাড়া MCQ সমূহ
                              </div>
                              {mcqsOfChapter?.map((m) => {
                                const isEditing = editingMcqId === m.id;
                                if (isEditing) {
                                  return (
                                    <div key={m.id} className="bg-card border rounded-md p-2 space-y-1.5">
                                      <Input
                                        value={editQuestion}
                                        onChange={(e) => setEditQuestion(e.target.value)}
                                        className="text-xs h-7"
                                        placeholder="প্রশ্ন"
                                      />
                                      <div className="grid grid-cols-2 gap-1.5">
                                        {editOptions.map((opt, i) => (
                                          <div key={i} className="flex items-center gap-1">
                                            <button
                                              type="button"
                                              onClick={() => setEditCorrect(i)}
                                              className={cn(
                                                "h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center text-[9px] font-bold",
                                                editCorrect === i
                                                  ? "bg-emerald-500 border-emerald-500 text-white"
                                                  : "border-border text-muted-foreground"
                                              )}
                                            >
                                              {String.fromCharCode(65 + i)}
                                            </button>
                                            <Input
                                              value={opt}
                                              onChange={(e) =>
                                                setEditOptions((prev) =>
                                                  prev.map((o, idx) => (idx === i ? e.target.value : o))
                                                )
                                              }
                                              className="text-[11px] h-7"
                                              placeholder={`অপশন ${i + 1}`}
                                            />
                                          </div>
                                        ))}
                                      </div>
                                      <Input
                                        value={editExplanation}
                                        onChange={(e) => setEditExplanation(e.target.value)}
                                        className="text-xs h-7"
                                        placeholder="ব্যাখ্যা (ঐচ্ছিক)"
                                      />
                                      <div className="flex gap-1.5">
                                        <Button
                                          size="sm"
                                          className="h-7 flex-1 text-[11px]"
                                          onClick={saveEditMcq}
                                          disabled={savingEdit}
                                        >
                                          {savingEdit ? (
                                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                          ) : (
                                            <Check className="h-3 w-3 mr-1" />
                                          )}
                                          সেভ
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="h-7 text-[11px]"
                                          onClick={cancelEditMcq}
                                          disabled={savingEdit}
                                        >
                                          <X className="h-3 w-3 mr-1" />
                                          বাতিল
                                        </Button>
                                      </div>
                                    </div>
                                  );
                                }
                                return (
                                  <div
                                    key={m.id}
                                    className="flex items-start gap-2 text-[11px] bg-muted/30 rounded-md p-2"
                                  >
                                    <span className="flex-1">{m.question}</span>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5 text-muted-foreground flex-shrink-0"
                                      onClick={() => startEditMcq(m)}
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5 text-destructive flex-shrink-0"
                                      onClick={() => deleteMcq(m.id)}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </Button>
                                  </div>
                                );
                              })}
                              {mcqsOfChapter?.length === 0 && (
                                <p className="text-[11px] text-muted-foreground text-center py-2">
                                  কোনো MCQ নেই
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {chaptersOfSubject?.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-2">কোনো অধ্যায় নেই</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminQuickPractice;
