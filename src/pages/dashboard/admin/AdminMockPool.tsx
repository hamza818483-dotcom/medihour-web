import { useState } from "react";
import Papa from "papaparse";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Target, Trash2, FileUp, BookOpen, X, Pencil, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { QuestionBankSelector } from "@/components/admin/QuestionBankSelector";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { useGlobalMetadata, useAddGlobalMetadata, useRenameGlobalMetadata, useDeleteGlobalMetadata } from "@/hooks/useGlobalMetadata";
import type { QuestionData } from "@/components/admin/QuestionEditor";

const DEFAULT_STANDARDS = [
  { value: "medical", label: "Medical" },
  { value: "varsity", label: "Varsity" },
  { value: "onushiloni", label: "Onushiloni" },
];

const AdminMockPool = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [subject, setSubject] = useState("");
  const [chapter, setChapter] = useState("");
  const [topic, setTopic] = useState("");
  const [standard, setStandard] = useState("medical");
  const [csvData, setCsvData] = useState<any[] | null>(null);
  const [csvFileName, setCsvFileName] = useState("");
  const [qbQuestions, setQbQuestions] = useState<QuestionData[] | null>(null);
  const [isQbOpen, setIsQbOpen] = useState(false);

  // Edit-existing-entry dialog state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editChapter, setEditChapter] = useState("");
  const [editTopic, setEditTopic] = useState("");
  const [editStandard, setEditStandard] = useState("medical");
  const [editQuestions, setEditQuestions] = useState<any[]>([]);

  const { data: pools, isLoading } = useQuery({
    queryKey: ["admin-mock-pool"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mock_question_pool")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    },
  });

  // Reusable Subject/Chapter/Topic lists — same global_metadata system used by
  // the main exam creator, so once added they stay available as dropdown
  // options everywhere (mock_subject/mock_chapter/mock_topic types).
  const { data: globalMeta } = useGlobalMetadata() as any;
  const addMeta = useAddGlobalMetadata();
  const renameMeta = useRenameGlobalMetadata();
  const deleteMeta = useDeleteGlobalMetadata();

  const standardOptions: { value: string; label: string }[] = (() => {
    const extra = (globalMeta?.mock_standard || []) as { value: string; label: string }[];
    const map = new Map<string, { value: string; label: string }>();
    DEFAULT_STANDARDS.forEach((s) => map.set(s.value, s));
    extra.forEach((s) => {
      if (!map.has(s.value)) map.set(s.value, s);
    });
    return Array.from(map.values());
  })();

  const handleCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvFileName(file.name);
    setQbQuestions(null);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: "UTF-8",
      complete: (result) => {
        const rows = (result.data as any[]).filter((r) => r["questions"] || r["question_text"]);
        setCsvData(rows);
      },
    });
  };

  const handleQbSelect = (questions: QuestionData[]) => {
    // Merge into whatever's already picked from the Question Bank (subject may
    // be selected across multiple exams / individually-picked MCQs).
    setCsvData(null);
    setCsvFileName("");
    setQbQuestions((prev) => [...(prev || []), ...questions]);
    setIsQbOpen(false);
    toast({ title: `${questions.length}টি প্রশ্ন যোগ হয়েছে`, description: "নিচে সেভ করুন" });
  };

  const clearForm = () => {
    setSubject("");
    setChapter("");
    setTopic("");
    setStandard("medical");
    setCsvData(null);
    setCsvFileName("");
    setQbQuestions(null);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const sourceRows = qbQuestions?.length
        ? qbQuestions.map((q) => ({
            question_text: q.question,
            option_a: q.options?.A || "",
            option_b: q.options?.B || "",
            option_c: q.options?.C || "",
            option_d: q.options?.D || "",
            correct_option: q.correct_answer,
            explanation: q.explanation || "",
          }))
        : csvData;

      if (!sourceRows?.length) throw new Error("CSV আপলোড করুন অথবা Question Bank থেকে প্রশ্ন সিলেক্ট করুন");
      if (!subject.trim() || !chapter.trim()) throw new Error("সাবজেক্ট ও চ্যাপ্টার দিন");

      const { error } = await supabase.from("mock_question_pool").insert({
        subject: subject.trim(),
        chapter: chapter.trim(),
        topic: topic.trim() || null,
        standard,
        question_count: sourceRows.length,
        questions_json: sourceRows,
        created_by: user?.id || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "মক টেস্ট প্রশ্ন সেভ হয়েছে" });
      queryClient.invalidateQueries({ queryKey: ["admin-mock-pool"] });
      queryClient.invalidateQueries({ queryKey: ["global-metadata"] });
      clearForm();
    },
    onError: (e: any) => toast({ title: "সেভ ব্যর্থ", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("mock_question_pool").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "মুছে ফেলা হয়েছে" });
      queryClient.invalidateQueries({ queryKey: ["admin-mock-pool"] });
    },
    onError: (e: any) => toast({ title: "মুছতে ব্যর্থ", description: e.message, variant: "destructive" }),
  });

  const openEdit = (p: any) => {
    setEditingId(p.id);
    setEditSubject(p.subject || "");
    setEditChapter(p.chapter || "");
    setEditTopic(p.topic || "");
    setEditStandard(p.standard || "medical");
    setEditQuestions(Array.isArray(p.questions_json) ? JSON.parse(JSON.stringify(p.questions_json)) : []);
  };

  const closeEdit = () => setEditingId(null);

  const updateEditQuestion = (idx: number, field: string, value: string) => {
    setEditQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, [field]: value } : q)));
  };

  const removeEditQuestion = (idx: number) => {
    setEditQuestions((prev) => prev.filter((_, i) => i !== idx));
  };

  const addEditQuestion = () => {
    setEditQuestions((prev) => [
      ...prev,
      { question_text: "", option_a: "", option_b: "", option_c: "", option_d: "", correct_option: "A", explanation: "" },
    ]);
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editingId) return;
      if (!editSubject.trim() || !editChapter.trim()) throw new Error("সাবজেক্ট ও চ্যাপ্টার দিন");
      if (!editQuestions.length) throw new Error("অন্তত ১টি প্রশ্ন থাকতে হবে");
      const { error } = await supabase
        .from("mock_question_pool")
        .update({
          subject: editSubject.trim(),
          chapter: editChapter.trim(),
          topic: editTopic.trim() || null,
          standard: editStandard,
          question_count: editQuestions.length,
          questions_json: editQuestions,
        })
        .eq("id", editingId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "আপডেট হয়েছে" });
      queryClient.invalidateQueries({ queryKey: ["admin-mock-pool"] });
      closeEdit();
    },
    onError: (e: any) => toast({ title: "আপডেট ব্যর্থ", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-2xl bg-fuchsia-500/10 flex items-center justify-center shrink-0">
          <Target className="h-6 w-6 text-fuchsia-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold">আনলিমিটেড মক টেস্ট — প্রশ্ন ব্যাংক</h1>
          <p className="text-sm text-muted-foreground">
            Subject/Chapter/Topic ভিত্তিক প্রশ্নের পুল আপলোড করুন — স্টুডেন্টরা এখান থেকে র‍্যান্ডম টেস্ট নিবে।
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">মক টেস্ট যোগ/এডিট</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>সাবজেক্ট</Label>
            <CreatableSelect
              options={globalMeta?.mock_subject || []}
              value={subject}
              onChange={(val) => {
                setSubject(val);
                setChapter("");
              }}
              onCreate={(val) => {
                addMeta.mutate({ type: "mock_subject", value: val });
                setSubject(val);
                setChapter("");
              }}
              onRename={(oldVal, newVal) => renameMeta.mutate({ type: "mock_subject", oldValue: oldVal, newValue: newVal })}
              onDelete={(val) => deleteMeta.mutate({ type: "mock_subject", value: val })}
              placeholder="সাবজেক্ট বাছাই বা তৈরি করুন"
            />
          </div>
          <div>
            <Label>চ্যাপ্টার</Label>
            <CreatableSelect
              options={globalMeta?.mock_chapter || []}
              value={chapter}
              onChange={setChapter}
              onCreate={(val) => {
                addMeta.mutate({ type: "mock_chapter", value: val });
                setChapter(val);
              }}
              onRename={(oldVal, newVal) => renameMeta.mutate({ type: "mock_chapter", oldValue: oldVal, newValue: newVal })}
              onDelete={(val) => deleteMeta.mutate({ type: "mock_chapter", value: val })}
              placeholder="চ্যাপ্টার বাছাই বা তৈরি করুন"
            />
          </div>
          <div>
            <Label>টপিক (ঐচ্ছিক)</Label>
            <CreatableSelect
              options={globalMeta?.mock_topic || []}
              value={topic}
              onChange={setTopic}
              onCreate={(val) => {
                addMeta.mutate({ type: "mock_topic", value: val });
                setTopic(val);
              }}
              onRename={(oldVal, newVal) => renameMeta.mutate({ type: "mock_topic", oldValue: oldVal, newValue: newVal })}
              onDelete={(val) => deleteMeta.mutate({ type: "mock_topic", value: val })}
              placeholder="টপিক বাছাই বা তৈরি করুন"
            />
          </div>
          <div>
            <Label className="mb-2 block">স্ট্যান্ডার্ড</Label>
            <CreatableSelect
              options={standardOptions}
              value={standard}
              onChange={setStandard}
              onCreate={(val) => {
                addMeta.mutate({ type: "mock_standard", value: val });
                setStandard(val);
              }}
              onRename={(oldVal, newVal) => {
                renameMeta.mutate({ type: "mock_standard", oldValue: oldVal, newValue: newVal });
                if (standard === oldVal) setStandard(newVal);
              }}
              onDelete={(val) => deleteMeta.mutate({ type: "mock_standard", value: val })}
              placeholder="স্ট্যান্ডার্ড বাছাই বা তৈরি করুন"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:gap-3">
            <div
              className="border-2 border-dashed rounded-lg p-2 sm:p-4 text-center cursor-pointer hover:border-primary/50"
              onClick={() => document.getElementById("mockPoolCSV")?.click()}
            >
              <FileUp className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
              <p className="text-sm">CSV আপলোড করুন</p>
              <input
                id="mockPoolCSV"
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleCSV}
              />
              {csvFileName && (
                <p className="text-xs text-primary mt-1">
                  {csvFileName} — {csvData?.length || 0} প্রশ্ন পাওয়া গেছে
                </p>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">
                Header: questions, option1, option2, option3, option4, answer, explanation
              </p>
            </div>

            <div
              className="border-2 border-dashed rounded-lg p-2 sm:p-4 text-center cursor-pointer hover:border-primary/50 flex flex-col items-center justify-center"
              onClick={() => setIsQbOpen(true)}
            >
              <BookOpen className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
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
            <Button
              className="flex-1"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? "সেভ হচ্ছে..." : "সেইভ"}
            </Button>
            <Button variant="outline" onClick={clearForm}>
              ক্লিয়ার
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">তালিকা</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
          {!isLoading && (!pools || pools.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-6">কোনো প্রশ্ন যোগ করা হয়নি।</p>
          )}
          <div className="space-y-2">
            {(pools || []).map((p: any) => (
              <div
                key={p.id}
                className="flex items-center justify-between border rounded-lg px-3 py-2"
              >
                <div className="text-sm">
                  <p className="font-semibold">
                    {p.subject} › {p.chapter}
                    {p.topic ? ` › ${p.topic}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {standardOptions.find((s) => s.value === p.standard)?.label || p.standard} ·{" "}
                    {p.question_count} প্রশ্ন
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button variant="outline" size="icon" onClick={() => openEdit(p)}>
                    <Pencil className="h-4 w-4 text-primary" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => deleteMutation.mutate(p.id)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editingId} onOpenChange={(open) => !open && closeEdit()}>
        <DialogContent className="max-w-3xl h-[85vh] p-0 overflow-hidden flex flex-col">
          <DialogHeader className="p-4 pb-0 shrink-0">
            <DialogTitle>এন্ট্রি এডিট করুন</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div>
              <Label>সাবজেক্ট</Label>
              <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} />
            </div>
            <div>
              <Label>চ্যাপ্টার</Label>
              <Input value={editChapter} onChange={(e) => setEditChapter(e.target.value)} />
            </div>
            <div>
              <Label>টপিক (ঐচ্ছিক)</Label>
              <Input value={editTopic} onChange={(e) => setEditTopic(e.target.value)} />
            </div>
            <div>
              <Label className="mb-2 block">স্ট্যান্ডার্ড</Label>
              <CreatableSelect
                options={standardOptions}
                value={editStandard}
                onChange={setEditStandard}
                onCreate={(val) => {
                  addMeta.mutate({ type: "mock_standard", value: val });
                  setEditStandard(val);
                }}
                placeholder="স্ট্যান্ডার্ড বাছাই করুন"
              />
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">প্রশ্নসমূহ ({editQuestions.length})</Label>
              <Button size="sm" variant="outline" onClick={addEditQuestion}>
                <Plus className="h-3.5 w-3.5 mr-1" /> নতুন প্রশ্ন
              </Button>
            </div>

            <div className="space-y-3">
              {editQuestions.map((q, idx) => (
                <div key={idx} className="border rounded-lg p-3 space-y-2 relative">
                  <button
                    type="button"
                    onClick={() => removeEditQuestion(idx)}
                    className="absolute top-2 right-2 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <p className="text-xs text-muted-foreground">প্রশ্ন #{idx + 1}</p>
                  <Textarea
                    value={q.question_text || ""}
                    onChange={(e) => updateEditQuestion(idx, "question_text", e.target.value)}
                    placeholder="প্রশ্ন"
                    className="min-h-[60px]"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      value={q.option_a || ""}
                      onChange={(e) => updateEditQuestion(idx, "option_a", e.target.value)}
                      placeholder="অপশন A"
                    />
                    <Input
                      value={q.option_b || ""}
                      onChange={(e) => updateEditQuestion(idx, "option_b", e.target.value)}
                      placeholder="অপশন B"
                    />
                    <Input
                      value={q.option_c || ""}
                      onChange={(e) => updateEditQuestion(idx, "option_c", e.target.value)}
                      placeholder="অপশন C"
                    />
                    <Input
                      value={q.option_d || ""}
                      onChange={(e) => updateEditQuestion(idx, "option_d", e.target.value)}
                      placeholder="অপশন D"
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <Label className="text-xs">সঠিক উত্তর</Label>
                      <select
                        value={q.correct_option || "A"}
                        onChange={(e) => updateEditQuestion(idx, "correct_option", e.target.value)}
                        className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                      >
                        <option value="A">A</option>
                        <option value="B">B</option>
                        <option value="C">C</option>
                        <option value="D">D</option>
                      </select>
                    </div>
                  </div>
                  <Textarea
                    value={q.explanation || ""}
                    onChange={(e) => updateEditQuestion(idx, "explanation", e.target.value)}
                    placeholder="ব্যাখ্যা (ঐচ্ছিক)"
                    className="min-h-[50px]"
                  />
                </div>
              ))}
              {editQuestions.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">কোনো প্রশ্ন নেই</p>
              )}
            </div>
          </div>
          <div className="p-4 border-t flex gap-2 shrink-0">
            <Button
              className="flex-1"
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending}
            >
              {updateMutation.isPending ? "আপডেট হচ্ছে..." : "আপডেট সেভ করুন"}
            </Button>
            <Button variant="outline" onClick={closeEdit}>
              বাতিল
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
    </div>
  );
};

export default AdminMockPool;
