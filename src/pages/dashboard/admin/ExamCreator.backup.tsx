import React, { useEffect, useState } from "react";
import "react-quill/dist/quill.snow.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Download, Upload, Trash2, Plus, Edit2,
  Database, BookOpen, Check, RefreshCw, Loader2
} from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { LoadingScreen } from "@/components/ui/loading-screen";
import MathText from "@/components/MathText";
import { QuestionEditor, QuestionData } from "@/components/admin/QuestionEditor";
import { QuestionBankSelector } from "@/components/admin/QuestionBankSelector";

// Helper to sanitize HTML import
const sanitizeHtml = (html: string) => {
    if (!html) return "";
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    // Remove scripts
    const scripts = doc.querySelectorAll('script');
    scripts.forEach(script => script.remove());

    // Remove unsafe tags and attributes
    const all = doc.querySelectorAll('*');
    all.forEach(el => {
        // Remove event handlers
        Array.from(el.attributes).forEach(attr => {
            if (attr.name.startsWith('on')) {
                el.removeAttribute(attr.name);
            }
            if (attr.name.startsWith('javascript:')) {
                el.removeAttribute(attr.name);
            }
        });

        // Remove potentially dangerous tags
        if (['IFRAME', 'OBJECT', 'EMBED', 'FORM'].includes(el.tagName)) {
            el.remove();
        }
    });
    return doc.body.innerHTML;
};

// Helper to convert base64 to Blob with robust parsing
const base64ToBlob = (base64: string) => {
    try {
        const parts = base64.split(';base64,');
        if (parts.length !== 2) throw new Error("Invalid base64 format");

        const contentType = parts[0].split(':')[1] || 'image/png';
        const raw = window.atob(parts[1].trim());
        const rawLength = raw.length;
        const uInt8Array = new Uint8Array(rawLength);
        for (let i = 0; i < rawLength; ++i) {
            uInt8Array[i] = raw.charCodeAt(i);
        }
        return new Blob([uInt8Array], { type: contentType });
    } catch (e) {
        console.error("Base64 parsing error:", e);
        return null;
    }
};

// Image Upload Function
const uploadImage = async (base64: string) => {
    try {
        const blob = base64ToBlob(base64);
        if (!blob) return null;

        const formData = new FormData();
        // Use filename with extension matching content type if possible, default to png
        const ext = blob.type.split('/')[1] || 'png';
        formData.append('file', blob, `image.${ext}`);

        const res = await fetch('https://imagehost-sigma-five.vercel.app/api/upload', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer jm4rt3hbicI7u0cutBmdQYNC95PCXvzN'
            },
            body: formData
        });

        if (!res.ok) {
            const text = await res.text();
            console.error(`Upload failed: ${res.status} ${res.statusText}`, text);
            throw new Error(`API Error: ${res.status}`);
        }

        const data = await res.json();
        return data.direct_url;
    } catch (error) {
        console.error("Image upload failed:", error);
        return null;
    }
};

const processHtmlContent = async (html: string) => {
    if (!html || !html.includes('data:image')) return { html, hasErrors: false };

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const images = doc.querySelectorAll('img');
    let hasChanges = false;
    let hasErrors = false;

    // Convert NodeList to Array to use for...of with await
    for (const img of Array.from(images)) {
        if (img.src.startsWith('data:image')) {
            const newUrl = await uploadImage(img.src);
            if (newUrl) {
                img.src = newUrl;
                hasChanges = true;
            } else {
                hasErrors = true;
            }
        }
    }

    return {
        html: hasChanges ? doc.body.innerHTML : html,
        hasErrors
    };
};

const ExamCreator = () => {
  const { examId } = useParams();
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [examTitle, setExamTitle] = useState("New Exam");
  const { toast } = useToast();
  const navigate = useNavigate();

  // Export/Save State
  const [isExporting, setIsExporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [exportProgress, setExportProgress] = useState("");
  const [showBankSelector, setShowBankSelector] = useState(false);

  // MathLive setup
  useEffect(() => {
    if (!document.getElementById("mathlive-script")) {
      const script = document.createElement("script");
      script.id = "mathlive-script";
      script.src = "https://unpkg.com/mathlive";
      script.type = "module";
      document.body.appendChild(script);
    }
  }, []);

  // Fetch Existing Questions
  useEffect(() => {
    if (examId) {
        const fetchExamData = async () => {
            // Fetch Exam Title
            const { data: exam, error: examError } = await supabase
                .from("exams")
                .select("title")
                .eq("id", examId)
                .single();
            if (exam) setExamTitle(exam.title);

            // Fetch Questions
            const { data: qData } = await supabase
                .from("exam_questions")
                .select("*")
                .eq("exam_id", examId)
                .order("question_index", { ascending: true });

            if (qData) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const loadedQuestions = qData.map((q: any) => ({
                    id: q.id,
                    question: q.question_text,
                    options: {
                        A: q.option_a,
                        B: q.option_b,
                        C: q.option_c,
                        D: q.option_d,
                    },
                    correct_answer: q.correct_option,
                    explanation: q.explanation || ""
                }));
                setQuestions(loadedQuestions);
            }
        };
        fetchExamData();
    }
  }, [examId]);

  const [activeForm, setActiveForm] = useState<{
    index: number;
    type: 'initial' | 'above' | 'below' | 'edit';
    data: QuestionData;
  } | null>(null);

  const emptyQuestion: QuestionData = {
    question: "",
    options: { A: "", B: "", C: "", D: "" },
    correct_answer: "",
    explanation: ""
  };

  const handleShowForm = (index: number, type: 'initial' | 'above' | 'below' | 'edit') => {
    let data = { ...emptyQuestion };
    if (type === 'edit') {
        data = JSON.parse(JSON.stringify(questions[index])); // Deep copy
    }
    setActiveForm({ index, type, data });
    setTimeout(() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
    }, 50);
  };

  const handleSaveQuestion = () => {
    if (!activeForm) return;

    if (!activeForm.data.question || !activeForm.data.correct_answer) {
        toast({ title: "Validation Error", description: "Question and Correct Answer are required.", variant: "destructive" });
        return;
    }

    const newQuestions = [...questions];
    if (activeForm.type === 'edit') {
        newQuestions[activeForm.index] = activeForm.data;
    } else if (activeForm.type === 'initial') {
        newQuestions.push(activeForm.data);
    } else if (activeForm.type === 'above') {
        newQuestions.splice(activeForm.index, 0, activeForm.data);
    } else if (activeForm.type === 'below') {
        newQuestions.splice(activeForm.index + 1, 0, activeForm.data);
    }

    setQuestions(newQuestions);
    setActiveForm(null);
  };

  const handleDeleteQuestion = (index: number) => {
    if (confirm("Delete this question?")) {
        const newQuestions = [...questions];
        newQuestions.splice(index, 1);
        setQuestions(newQuestions);
    }
  };

  const handleExport = async () => {
      setIsExporting(true);
      setExportProgress("Preparing to export...");

      try {
          const processedQuestions = [];
          const total = questions.length;
          let failedUploads = false;

          for (let i = 0; i < total; i++) {
              setExportProgress(`Processing question ${i + 1} of ${total} (Uploading images)...`);

              const q = questions[i];

              // Process Question Text
              const qResult = await processHtmlContent(q.question);
              if (qResult.hasErrors) failedUploads = true;

              // Process Options
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const options: any = {};
              for (const [key, val] of Object.entries(q.options)) {
                  const optResult = await processHtmlContent(val);
                  options[key] = optResult.html;
                  if (optResult.hasErrors) failedUploads = true;
              }

              // Process Explanation
              const expResult = await processHtmlContent(q.explanation);
              if (expResult.hasErrors) failedUploads = true;

              processedQuestions.push({
                  ...q,
                  question: qResult.html,
                  options,
                  explanation: expResult.html
              });
          }

          if (failedUploads) {
              toast({
                  title: "Export Aborted",
                  description: "Image upload failed. Please ensure the API is accessible.",
                  variant: "destructive"
              });
              setIsExporting(false);
              setExportProgress("");
              return; // Stop here
          }

          setQuestions(processedQuestions);

          const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(processedQuestions, null, 2));
          const downloadAnchorNode = document.createElement('a');
          downloadAnchorNode.setAttribute("href",     dataStr);
          downloadAnchorNode.setAttribute("download", (examTitle || "quiz") + ".json");
          document.body.appendChild(downloadAnchorNode);
          downloadAnchorNode.click();
          downloadAnchorNode.remove();

          toast({ title: "Export Success", description: "Exam exported with hosted images." });

      } catch (error) {
          console.error("Export failed", error);
          toast({ title: "Export Failed", description: "An error occurred during export.", variant: "destructive" });
      } finally {
          setIsExporting(false);
          setExportProgress("");
      }
  };

  const handleSaveToDatabase = async () => {
      if (!examId) return;
      if (!confirm("This will update existing questions. Continue?")) return;

      setIsSaving(true);
      try {
          // 1. Fetch current DB state to identify deletions
          const { data: existingQ, error: fetchError } = await supabase
              .from("exam_questions")
              .select("id")
              .eq("exam_id", examId);

          if (fetchError) throw fetchError;

          const existingIds = new Set(existingQ?.map(q => q.id));
          const currentIds = new Set(questions.filter(q => q.id).map(q => q.id));

          const idsToDelete = [...existingIds].filter(id => !currentIds.has(id));

          // 2. Prepare Upsert Data
          const upsertData = questions.map((q, idx) => ({
              ...(q.id ? { id: q.id } : {}), // Only include ID if it exists (update)
              exam_id: examId,
              question_index: idx + 1, // Ensure sequential indexing
              question_text: q.question,
              option_a: q.options.A,
              option_b: q.options.B,
              option_c: q.options.C,
              option_d: q.options.D,
              correct_option: q.correct_answer,
              explanation: q.explanation,
              marks: 1
          }));

          // 3. Delete Removed Questions
          if (idsToDelete.length > 0) {
              const { error: delError } = await supabase.from("exam_questions").delete().in("id", idsToDelete);
              if (delError) throw delError;
          }

          // 4. Upsert Questions
          if (upsertData.length > 0) {
              const { error: upsertError } = await supabase.from("exam_questions").upsert(upsertData);
              if (upsertError) throw upsertError;
          }

          toast({ title: "Success", description: "Exam questions saved and re-indexed successfully." });

          // 5. Refresh Data from DB to sync IDs
          const { data: refreshedData } = await supabase
                .from("exam_questions")
                .select("*")
                .eq("exam_id", examId)
                .order("question_index", { ascending: true });

          if (refreshedData) {
             // eslint-disable-next-line @typescript-eslint/no-explicit-any
             const loaded = refreshedData.map((q: any) => ({
                id: q.id,
                question: q.question_text,
                options: { A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d },
                correct_answer: q.correct_option,
                explanation: q.explanation || ""
             }));
             setQuestions(loaded);
          }

      } catch (err) {
        console.error("Save error:", err);
        if (err instanceof Error) {
            toast({ title: "Error saving questions", description: err.message, variant: "destructive" });
        } else {
             toast({ title: "Error", description: "An unexpected error occurred.", variant: "destructive" });
        }
      } finally {
          setIsSaving(false);
      }
  };

  const handleReplaceAllQuestions = async () => {
      if (!examId) return;
      if (!confirm("⚠️ DANGER: This will DELETE all existing questions and replace them with the current list.\n\nAny student exam attempts linked to old questions might break or lose data.\n\nAre you sure you want to proceed?")) return;

      setIsSaving(true);
      try {
          // 1. Delete all existing questions
          const { error: deleteError } = await supabase
              .from("exam_questions")
              .delete()
              .eq("exam_id", examId);

          if (deleteError) throw deleteError;

          // 2. Prepare new questions (dropping IDs to force new insert)
          const insertData = questions.map((q, idx) => ({
              exam_id: examId,
              question_index: idx + 1,
              question_text: q.question,
              option_a: q.options.A,
              option_b: q.options.B,
              option_c: q.options.C,
              option_d: q.options.D,
              correct_option: q.correct_answer,
              explanation: q.explanation,
              marks: 1
          }));

          if (insertData.length > 0) {
              const { error: insertError } = await supabase
                  .from("exam_questions")
                  .insert(insertData);
              if (insertError) throw insertError;
          }

          toast({ title: "Success", description: "All questions replaced successfully." });

          // 3. Refresh local state
          const { data: refreshedData } = await supabase
                .from("exam_questions")
                .select("*")
                .eq("exam_id", examId)
                .order("question_index", { ascending: true });

          if (refreshedData) {
             // eslint-disable-next-line @typescript-eslint/no-explicit-any
             const loaded = refreshedData.map((q: any) => ({
                id: q.id,
                question: q.question_text,
                options: { A: q.option_a, B: q.option_b, C: q.option_c, D: q.option_d },
                correct_answer: q.correct_option,
                explanation: q.explanation || ""
             }));
             setQuestions(loaded);
          }

      } catch (err) {
        console.error("Replace error:", err);
        if (err instanceof Error) {
            toast({ title: "Error replacing questions", description: err.message, variant: "destructive" });
        }
      } finally {
          setIsSaving(false);
      }
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const content = event.target?.result as string;
            if (content.trim().startsWith('[') || content.trim().startsWith('{')) {
                const parsed = JSON.parse(content);
                if (Array.isArray(parsed)) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const normalized = parsed.map((q: any) => {
                        const question = q.question || q.question_text || "";
                        const explanation = q.explanation || "";

                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        let options: any = { A: "", B: "", C: "", D: "" };
                        if (q.options && typeof q.options === 'object' && !Array.isArray(q.options)) {
                            const keys = Object.keys(q.options);
                            if (keys.includes('A')) options = q.options;
                            else {
                                const vals = Object.values(q.options);
                                options = {
                                    A: vals[0] || "",
                                    B: vals[1] || "",
                                    C: vals[2] || "",
                                    D: vals[3] || ""
                                };
                            }
                        } else if (q.option_a || q.option1) {
                            options = {
                                A: q.option_a || q.option1 || "",
                                B: q.option_b || q.option2 || "",
                                C: q.option_c || q.option3 || "",
                                D: q.option_d || q.option4 || ""
                            };
                        }

                        let correct_answer = "";
                        if (q.correct_answer) correct_answer = q.correct_answer;
                        else if (q.correct_option) correct_answer = q.correct_option;
                        else if (q.answer) {
                            const num = Number(q.answer);
                            if (!isNaN(num)) {
                                correct_answer = ["A", "B", "C", "D"][num - 1] || "";
                            }
                        }

                        return {
                            question: sanitizeHtml(String(question)),
                            options: {
                                A: sanitizeHtml(options.A),
                                B: sanitizeHtml(options.B),
                                C: sanitizeHtml(options.C),
                                D: sanitizeHtml(options.D),
                            },
                            correct_answer: String(correct_answer).toUpperCase(),
                            explanation: sanitizeHtml(String(explanation))
                        };
                    });

                    setQuestions(prev => [...prev, ...normalized]);
                    toast({ title: "Import Successful", description: `Imported ${normalized.length} questions from JSON.` });
                } else {
                    toast({ title: "Invalid Format", description: "Expected an array of questions.", variant: "destructive" });
                }
            } else {
                toast({ title: "CSV Import", description: "CSV import is supported via copy-paste or implement if needed." });
            }
        } catch (err) {
            console.error(err);
            toast({ title: "Import Failed", description: "Could not parse file.", variant: "destructive" });
        }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleBankImport = (selectedQuestions: QuestionData[]) => {
      const cleanQuestions = selectedQuestions.map(q => ({
          ...q,
          id: undefined
      }));
      setQuestions(prev => [...prev, ...cleanQuestions]);
      toast({ title: "Imported", description: `Added ${cleanQuestions.length} questions from Question Bank.` });
  };

  return (
    <div className="min-h-screen lg:h-[calc(100vh-4rem)] bg-background p-4 md:p-6 font-sans lg:overflow-hidden">
      {isExporting && <LoadingScreen message={exportProgress} />}
      <div className="grid lg:grid-cols-12 gap-6 w-full h-full max-w-full">
        <div className="lg:col-span-7 xl:col-span-8 h-full flex flex-col space-y-6 lg:overflow-y-auto pr-2 pb-8 lg:pb-24 relative">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between rounded-xl bg-card p-6 shadow-md border border-border">
            <div className="space-y-2">
                <div className="flex items-center gap-2">
                    <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="rounded-full">
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                        Quiz Maker Studio
                    </h1>
                </div>
                <p className="text-sm text-muted-foreground pl-11">
                    {examId ? `Editing: ${examTitle}` : "Create, edit, and export professional quiz questions"}
                </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                <Input
                    value={examTitle}
                    onChange={e => setExamTitle(e.target.value)}
                    className="w-[250px] font-medium"
                    placeholder="Exam Title"
                    disabled={!!examId}
                />

                {questions.length === 0 && !activeForm && (
                     <Button onClick={() => handleShowForm(0, 'initial')} className="shadow-lg shadow-primary/20">
                        <Plus className="mr-2 h-4 w-4" /> Add First Question
                     </Button>
                )}

                {examId ? (
                    <>
                        <Button
                            onClick={handleSaveToDatabase}
                            disabled={isSaving}
                            className="bg-green-600 hover:bg-green-700 shadow-lg shadow-green-600/20"
                        >
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Database className="mr-2 h-4 w-4" />}
                            Save
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleReplaceAllQuestions}
                            disabled={isSaving}
                            title="Delete all questions & Re-upload (Cleaner)"
                        >
                            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                            Replace All
                        </Button>
                    </>
                ) : (
                    <Button variant="outline" onClick={handleExport}>
                        <Download className="mr-2 h-4 w-4" /> Export JSON
                    </Button>
                )}

                <div className="relative">
                    <Button variant="outline" onClick={() => document.getElementById('impf')?.click()}>
                        <Upload className="mr-2 h-4 w-4" /> Import File
                    </Button>
                    <input type="file" id="impf" className="hidden" accept=".json,.csv" onChange={handleImport} />
                </div>

                 <Button variant="secondary" onClick={() => setShowBankSelector(true)}>
                    <BookOpen className="mr-2 h-4 w-4" /> Question Bank
                </Button>

                <Button variant="destructive" size="icon" onClick={() => {
                    if (confirm("Are you sure you want to clear all questions?")) setQuestions([]);
                }}>
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>
        </div>

        {/* Active Form */}
        {activeForm && (
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="border border-primary/40 shadow-lg overflow-hidden rounded-md my-4">
                    <div className="p-6 bg-secondary/30 border-b border-border flex items-center justify-between">
                        <h2 className="text-xl font-bold flex items-center gap-2 text-primary">
                            {activeForm.type === 'edit' ? <Edit2 className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
                            {activeForm.type === 'edit' ? 'Edit Question' : 'New Question'}
                        </h2>
                        <Button variant="ghost" size="sm" onClick={() => setActiveForm(null)}>Cancel</Button>
                    </div>
                    <div className="p-6 md:p-8 space-y-6 bg-card">
                        <QuestionEditor
                            data={activeForm.data}
                            onChange={(newData) => setActiveForm(prev => prev ? { ...prev, data: newData } : null)}
                            onSave={handleSaveQuestion}
                            onCancel={() => setActiveForm(null)}
                        />
                    </div>
                </div>
            </div>
        )}

        {/* Questions List */}
        <div className="space-y-4 pb-32">
            {questions.length === 0 && !activeForm && (
                <div className="text-center py-20 rounded-md border border-dashed border-muted-foreground/20 bg-muted/5">
                    <div className="mx-auto w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                        <Plus className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-xl font-semibold text-muted-foreground mb-2">No questions added yet</p>
                    <p className="text-sm text-muted-foreground mb-6">Start building your exam by adding questions.</p>
                    <Button onClick={() => handleShowForm(0, 'initial')}>
                        Create Question
                    </Button>
                </div>
            )}

            {questions.map((q, i) => (
                <div key={i} className="group relative border-b border-border/50 pb-8 last:border-0 hover:bg-muted/10 transition-colors rounded-sm -mx-4 px-4 pt-4">
                    {/* Add Above Button */}
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10 py-2">
                         <Button size="sm" className="rounded-full shadow-lg bg-background border hover:bg-muted" onClick={() => handleShowForm(i, 'above')}>
                            <Plus className="h-3 w-3 mr-1" /> Insert Above
                         </Button>
                    </div>

                    <div className="relative">
                        <div className="absolute right-0 top-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 z-10">
                                <Button size="sm" variant="outline" className="h-8 shadow-sm bg-background" onClick={() => handleShowForm(i, 'edit')}>
                                    <Edit2 className="h-4 w-4 mr-1" /> Edit
                                </Button>
                                <Button size="sm" variant="destructive" className="h-8 shadow-sm" onClick={() => handleDeleteQuestion(i)}>
                                    <Trash2 className="h-4 w-4 mr-1" /> Delete
                                </Button>
                        </div>

                        <div className="space-y-4">
                            <div className="flex gap-3">
                                <span className="font-bold text-lg leading-tight mt-[2px]">{i + 1}.</span>
                                <MathText className="prose prose-sm md:prose-base max-w-none dark:prose-invert" text={q.question} />
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 pl-6">
                                {Object.entries(q.options).map(([key, val]) => (
                                    <div
                                        key={key}
                                        className={`relative p-2 rounded-md transition-all duration-200 flex gap-3 items-start ${
                                            q.correct_answer === key
                                            ? 'bg-green-50 dark:bg-green-900/20 font-medium'
                                            : 'hover:bg-muted/30'
                                        }`}
                                    >
                                        <div className="flex items-start gap-2 pt-0.5">
                                            <span className={`text-sm font-bold shrink-0 ${
                                                q.correct_answer === key
                                                ? 'text-green-600 dark:text-green-400'
                                                : 'text-muted-foreground'
                                            }`}>
                                                {key})
                                            </span>
                                            <div className="prose prose-sm max-w-none dark:prose-invert break-words overflow-hidden">
                                                <MathText text={val} />
                                            </div>
                                        </div>
                                        {q.correct_answer === key && (
                                            <div className="absolute -top-2 -right-2">
                                                <span className="flex items-center gap-1 text-[10px] font-bold text-white bg-green-600 px-2 py-0.5 rounded-full shadow-sm uppercase tracking-wider">
                                                    <Check className="h-3 w-3" />
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {q.explanation && (
                                <div className="mt-4 p-4 ml-6 bg-blue-50/50 dark:bg-blue-900/10 rounded-md border border-blue-100 dark:border-blue-900/30 text-sm">
                                    <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500"></span> Explanation
                                    </p>
                                    <MathText className="prose prose-sm max-w-none dark:prose-invert" text={q.explanation} />
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Add Below Button */}
                    <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-200 z-10 py-2">
                         <Button size="sm" className="rounded-full shadow-lg bg-background border hover:bg-muted" onClick={() => handleShowForm(i, 'below')}>
                            <Plus className="h-3 w-3 mr-1" /> Insert Below
                         </Button>
                    </div>
                </div>
            ))}
        </div>
        </div>

        <div className="lg:col-span-5 xl:col-span-4 h-[700px] lg:h-[calc(100vh-8rem)] lg:sticky lg:top-0">
            <QuestionBankSelector onSelect={handleBankImport} />
        </div>
      </div>
    </div>
  );
};

export default ExamCreator;
