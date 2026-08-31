import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Course, Exam } from "@/types/admin";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Upload, BookOpen, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QuestionBankSelector } from "@/components/admin/QuestionBankSelector";
import type { QuestionData } from "@/types/exam";
import { SUBJECTS } from "@/lib/constants";
import { toDhakaTimeISO, fromDhakaTimeToUTC } from "@/lib/dateUtils";
import { MultiSelect } from "@/components/ui/multi-select";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { useGlobalMetadata, useAddGlobalMetadata, useRenameGlobalMetadata, useDeleteGlobalMetadata, MetadataType } from "@/hooks/useGlobalMetadata";
import Papa from "papaparse";

const examSchema = z.object({
  id: z.string().optional(),
  course_id: z.string().nullable().optional(),
  shared_course_ids: z.array(z.string()).default([]),
  archive_course_ids: z.array(z.string()).default([]),
  title: z.string().trim().min(1, "Title is required"),
  subject: z.array(z.string()).default([]),
  chapter: z.string().trim().optional().or(z.literal("")),
  exam_type: z.enum(["live", "practice", "special"]),
  duration_minutes: z
    .string()
    .trim()
    .min(1, "Duration is required")
    .refine((val) => !isNaN(Number(val)), { message: "Duration must be a number" }),
  total_marks: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((val) => !val || !isNaN(Number(val)), { message: "Total marks must be a number" }),
  negative_mark_per_question: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((val) => !val || !isNaN(Number(val)), { message: "Negative mark must be a number" }),
  instructions: z.string().trim().max(4000).optional().or(z.literal("")),
  time_window_start: z.string().optional(),
  telegram_notify_enabled: z.boolean().optional(),
  telegram_message: z.string().optional(),
  telegram_channel_ids: z.array(z.string()).default([]),
  time_window_end: z.string().optional(),
  is_published: z.boolean().optional().default(false),
  is_visible_on_free: z.boolean().optional().default(false),
  allow_guest: z.boolean().optional().default(false),
  show_on_landing: z.boolean().optional().default(false),
  free_exam_category: z.string().trim().default("HSC"),
  restrict_solution: z.boolean().optional().default(false),
  questions_json: z.string().trim().optional().or(z.literal("")),
  questions_csv: z.string().trim().optional().or(z.literal("")),
  is_archive: z.boolean().optional().default(false),
  is_readymade: z.boolean().optional().default(false),
  readymade_course_ids: z.array(z.string()).default([]),
  readymade_topic: z.string().trim().optional().or(z.literal("")),
  readymade_category: z.string().trim().optional().or(z.literal("")),
  readymade_sub_chapter: z.string().trim().optional().or(z.literal("")),
  is_omr: z.boolean().optional().default(false),
  disable_second_timer_deduction: z.boolean().optional().default(false),
  is_only_live: z.boolean().optional().default(false),
});

interface ExamFormProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    exam?: any;
    onSuccess: () => void;
    onCancel?: () => void;
    isFreeMode?: boolean;
    isArchiveMode?: boolean;
    defaultCourseId?: string;
}

export const ExamForm = ({ exam, onSuccess, onCancel, isFreeMode = false, isArchiveMode = false, defaultCourseId }: ExamFormProps) => {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Global Metadata Hook
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: globalMeta } = useGlobalMetadata() as any;
    const addMetadata = useAddGlobalMetadata();
    const renameMetadata = useRenameGlobalMetadata();
    const deleteMetadata = useDeleteGlobalMetadata();

    const handleCreateMeta = (type: 'subject' | 'chapter' | 'readymade_topic' | 'readymade_category' | 'readymade_sub_chapter' | 'free_exam_category', value: string) => {
        addMetadata.mutate({ type, value });
    };
    const handleRenameMeta = (type: MetadataType, oldValue: string, newValue: string) => {
        renameMetadata.mutate({ type, oldValue, newValue });
    };
    const handleDeleteMeta = (type: MetadataType, value: string) => {
        deleteMetadata.mutate({ type, value });
    };

    const DRAFT_KEY = "examForm_draft";
    const loadDraft = (): Partial<z.infer<typeof examSchema>> | null => {
        if (exam) return null; // don't restore draft when editing an existing exam
        try {
            const raw = sessionStorage.getItem(DRAFT_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            // Scrub stale hardcoded "60" duration saved by old drafts before auto-calc was added
            if (parsed?.duration_minutes === "60") {
                delete parsed.duration_minutes;
            }
            return parsed;
        } catch {
            return null;
        }
    };

    const [form, setForm] = useState<z.infer<typeof examSchema>>(() => ({
        course_id: defaultCourseId || "",
        shared_course_ids: [],
        archive_course_ids: [],
        readymade_course_ids: [],
        title: "",
        subject: [],
        chapter: "",
        exam_type: "live",
        duration_minutes: "",
        total_marks: "",
        negative_mark_per_question: "0.25",
        instructions: "",
        time_window_start: "",
        time_window_end: "",
        telegram_notify_enabled: false,
        telegram_message: "",
        telegram_channel_ids: [],
        is_published: false,
        is_visible_on_free: false,
        allow_guest: false,
        show_on_landing: false,
        free_exam_category: "HSC",
        restrict_solution: false,
        questions_json: "",
        questions_csv: "",
        readymade_topic: "",
        readymade_category: "",
        readymade_sub_chapter: "",
        is_omr: false,
        disable_second_timer_deduction: false,
        is_only_live: false,
        is_archive: isArchiveMode,
        ...loadDraft(),
    }));

    // Auto-save draft (only for new exam creation, not while editing existing)
    useEffect(() => {
        if (exam) return;
        try {
            sessionStorage.setItem(DRAFT_KEY, JSON.stringify(form));
        } catch {
            // ignore quota errors
        }
    }, [form, exam]);

    const loadedExamIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (exam) {
            if (loadedExamIdRef.current === exam.id) return; // already loaded this exam, don't overwrite in-progress edits
            loadedExamIdRef.current = exam.id;
            let subjects: string[] = [];
            if (Array.isArray(exam.subject)) {
                subjects = exam.subject;
            } else if (typeof exam.subject === 'string' && exam.subject) {
                subjects = [exam.subject];
            }

            setForm({
                id: exam.id,
                course_id: exam.course_id || "",
                // @ts-ignore
                shared_course_ids: exam.shared_course_ids || [],
                // @ts-ignore
                archive_course_ids: exam.archive_course_ids || [],
                // @ts-ignore
                readymade_course_ids: exam.readymade_course_ids || [],
                title: exam.title ?? "",
                subject: subjects,
                chapter: exam.chapter || "",
                exam_type: exam.exam_type === "practice" ? "practice" : exam.exam_type === "special" ? "special" : "live",
                duration_minutes: exam.duration_minutes != null ? String(exam.duration_minutes) : "",
                total_marks: exam.total_marks != null ? String(exam.total_marks) : "",
                negative_mark_per_question:
                    exam.negative_mark_per_question != null
                    ? String(exam.negative_mark_per_question)
                    : "0",
                instructions: exam.instructions ?? "",
                time_window_start: exam.time_window_start ? toDhakaTimeISO(exam.time_window_start) : "",
                telegram_notify_enabled: (exam as any).telegram_notify_enabled ?? false,
                telegram_message: (exam as any).telegram_message ?? "",
                telegram_channel_ids: (exam as any).telegram_channel_ids ?? [],
                time_window_end: exam.time_window_end ? toDhakaTimeISO(exam.time_window_end) : "",
                is_published: exam.is_published ?? false,
                is_visible_on_free: exam.is_visible_on_free ?? false,
                // @ts-ignore
                allow_guest: exam.allow_guest ?? false,
                show_on_landing: exam.show_on_landing ?? false,
                free_exam_category: exam.free_exam_category ?? "HSC",
                restrict_solution: exam.restrict_solution ?? false,
                questions_json: "",
                questions_csv: "",
            is_archive: exam.is_archive || isArchiveMode,
            is_readymade: exam.is_readymade ?? false,
            readymade_topic: exam.readymade_topic || "",
            readymade_category: exam.readymade_category || "",
            readymade_sub_chapter: exam.readymade_sub_chapter || "",
            is_omr: exam.is_omr ?? false,
            disable_second_timer_deduction: exam.disable_second_timer_deduction ?? false,
            is_only_live: exam.is_only_live ?? false,
            });
        } else {
            loadedExamIdRef.current = null;
            setForm(prev => ({ ...prev, is_archive: isArchiveMode }));
        }
    }, [exam, isArchiveMode]);

    const { data: courses } = useQuery({
        queryKey: ["admin-courses-form"],
        staleTime: 5 * 60 * 1000,
        queryFn: async () => {
            const { data, error } = await supabase.from("courses").select("id, name");
            if (error) throw error;
            return data || [];
        },
    });

    const { data: telegramChannels } = useQuery({
        queryKey: ["telegram-channels-form"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("telegram_channels")
                .select("id, name, is_active")
                .eq("is_active", true);
            if (error) throw error;
            return data || [];
        },
    });

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'json' | 'csv') => {
        const file = e.target.files?.[0];
        if (!file) return;
        processFile(file, type);
        e.target.value = '';
    };

    const processFile = (file: File, type: 'json' | 'csv') => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target?.result as string;
          let count = 0;
          
          try {
              if (type === 'json') {
                const jsonData = JSON.parse(content);
                count = Array.isArray(jsonData) ? jsonData.length : 0;
                setForm((prev: any) => {
                    const newForm = { ...prev, questions_json: content };
                    newForm.total_marks = String(count);
                    newForm.duration_minutes = String(Math.ceil((count * 30) / 60));
                    return newForm;
                });
              } else {
                const result = Papa.parse(content, {
                  header: true,
                  skipEmptyLines: true,
                  newline: "",
                });
                count = result.data.length;
                setForm((prev: any) => {
                    const newForm = { ...prev, questions_csv: content };
                    newForm.total_marks = String(count);
                    newForm.duration_minutes = String(Math.ceil((count * 30) / 60));
                    return newForm;
                });
              }
              toast({ 
                  title: `Loaded ${type.toUpperCase()} file successfully`,
                  description: `Total ${count} questions found in ${file.name}`
              });
          } catch (err) {
              console.error(`Error parsing ${type}:`, err);
              toast({
                  title: `Error loading ${type.toUpperCase()} file`,
                  description: "Invalid file format or content.",
                  variant: "destructive"
              });
          }
        };
        reader.readAsText(file, "UTF-8");
    };

    const [isDraggingJSON, setIsDraggingJSON] = useState(false);
    const [isDraggingCSV, setIsDraggingCSV] = useState(false);
    const [qbQuestions, setQbQuestions] = useState<QuestionData[]>([]);
    const [isQbOpen, setIsQbOpen] = useState(false);
    const [segmentBankOpen, setSegmentBankOpen] = useState(false);
    const [segmentSubjectName, setSegmentSubjectName] = useState("");
    const [segmentMandatory, setSegmentMandatory] = useState(true);

    const handleQbSelect = (questions: QuestionData[]) => {
      setQbQuestions((prev) => {
        const updated = [...prev, ...questions];
        setForm((f: any) => ({
          ...f,
          total_marks: String(updated.length),
          duration_minutes: String(Math.ceil((updated.length * 30) / 60)),
        }));
        return updated;
      });
      setIsQbOpen(false);
    };

    const handleSegmentQbSelect = (questions: QuestionData[]) => {
      const tagged = questions.map(q => ({
        ...q,
        subject: segmentSubjectName || q.subject,
        is_segment_mandatory: segmentMandatory,
      }));
      setQbQuestions((prev) => {
        const updated = [...prev, ...tagged];
        setForm((f: any) => ({
          ...f,
          total_marks: String(updated.length),
          duration_minutes: String(Math.ceil((updated.length * 30) / 60)),
        }));
        return updated;
      });
      setSegmentBankOpen(false);
      setSegmentSubjectName("");
      setSegmentMandatory(true);
    };

    const segmentSubjects = Array.from(new Set(qbQuestions.map(q => (q as any).subject).filter(Boolean)));

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>, type: 'json' | 'csv') => {
        e.preventDefault();
        if (type === 'json') setIsDraggingJSON(true);
        else setIsDraggingCSV(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>, type: 'json' | 'csv') => {
        e.preventDefault();
        if (type === 'json') setIsDraggingJSON(false);
        else setIsDraggingCSV(false);
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>, type: 'json' | 'csv') => {
        e.preventDefault();
        if (type === 'json') setIsDraggingJSON(false);
        else setIsDraggingCSV(false);

        const file = e.dataTransfer.files?.[0];
        if (file) {
            processFile(file, type);
        }
    };

    const upsertExamMutation = useMutation({
        mutationFn: async (values: z.infer<typeof examSchema>) => {
          const parsed = examSchema.parse(values);

          const payload: any = {
            course_id: isFreeMode ? null : (parsed.course_id || null),
            // @ts-ignore
            shared_course_ids: parsed.shared_course_ids,
            // @ts-ignore
            archive_course_ids: parsed.archive_course_ids,
            // @ts-ignore
            readymade_course_ids: parsed.readymade_course_ids,
            title: parsed.title,
            subject: parsed.subject,
            chapter: parsed.chapter || null,
            exam_type: parsed.exam_type,
            duration_minutes: Number(parsed.duration_minutes),
            total_marks: parsed.total_marks ? Number(parsed.total_marks) : null,
            negative_mark_per_question: parsed.negative_mark_per_question
              ? Number(parsed.negative_mark_per_question)
              : 0,
            instructions: parsed.instructions || null,
            time_window_start: parsed.time_window_start ? fromDhakaTimeToUTC(parsed.time_window_start) : null,
            telegram_notify_enabled: parsed.telegram_notify_enabled ?? false,
            telegram_message: parsed.telegram_message || null,
            telegram_channel_ids: parsed.telegram_channel_ids || [],
            time_window_end: parsed.time_window_end ? fromDhakaTimeToUTC(parsed.time_window_end) : null,
            is_published: parsed.is_published ?? false,
            is_visible_on_free: parsed.is_visible_on_free ?? false,
            allow_guest: parsed.allow_guest ?? false,
            show_on_landing: parsed.show_on_landing ?? false,
            free_exam_category: parsed.free_exam_category || "HSC",
            restrict_solution: parsed.restrict_solution ?? false,
            is_archive: parsed.is_archive,
            is_readymade: parsed.is_readymade ?? false,
            readymade_topic: parsed.readymade_topic || null,
            readymade_category: parsed.readymade_category || null,
            readymade_sub_chapter: parsed.readymade_sub_chapter || null,
            is_omr: parsed.is_omr ?? false,
            disable_second_timer_deduction: parsed.disable_second_timer_deduction ?? false,
            is_only_live: parsed.is_only_live ?? false,
          };

          // Helper functions for questions (copied from original)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const normaliseQuestions = (input: Array<any>) => {

            return input.map((q) => {
              const questionText = String(
                q.question_text ?? q.question ?? "",
              );

              const optionA = String(
                q.option_a ?? q.a ?? q.option1 ?? q.options?.A ?? "",
              );
              const optionB = String(
                q.option_b ?? q.b ?? q.option2 ?? q.options?.B ?? "",
              );
              const optionC = String(
                q.option_c ?? q.c ?? q.option3 ?? q.options?.C ?? "",
              );
              const optionD = String(
                q.option_d ?? q.d ?? q.option4 ?? q.options?.D ?? "",
              );

              let correct: string | null = null;
              if (typeof q.correct_option === "string" && q.correct_option.trim()) {
                correct = q.correct_option.trim().charAt(0).toUpperCase();
              } else if (typeof q.correct_answer === "string" && q.correct_answer.trim()) {
                correct = q.correct_answer.trim().charAt(0).toUpperCase();
              } else if (q.answer != null) {
                const idx = Number(q.answer);
                if (idx >= 1 && idx <= 4) {
                  correct = ["A", "B", "C", "D"][idx - 1];
                }
              }

              const explanation = typeof q.explanation === "string" ? q.explanation : null;

              let tags = q.tags || [];
              if (typeof tags === 'string') {
                  tags = tags.split(',').map((t: string) => t.trim()).filter(Boolean);
              }

              return {
                question_text: questionText,
                option_a: optionA,
                option_b: optionB,
                option_c: optionC,
                option_d: optionD,
                correct_option: (correct || "A") as string,
                marks: q.marks != null ? Number(q.marks) : 1,
                explanation,
                question_type: q.type != null ? String(q.type) : null,
                section: q.section != null ? String(q.section) : null,
                subject: q.subject != null ? String(q.subject) : null,
                chapter: q.chapter != null ? String(q.chapter) : null,
                topic: q.topic != null ? String(q.topic) : null,
                exam_code: q.exam_code != null ? String(q.exam_code) : null,
                year: q.year != null ? String(q.year) : null,
                difficulty: q.difficulty != null ? String(q.difficulty) : null,
                tags: Array.isArray(tags) ? tags : []
              };
            });
          };

          const parseCsvQuestions = (csv: string) => {
            const result = Papa.parse(csv, {
              header: true,
              skipEmptyLines: true,
              newline: "",
            }) as any;
            const data = result.data;
            const errors = result.errors;

            if (errors.length > 0) {
              console.warn("CSV parse errors:", errors);
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rows: any[] = [];

            // Forward-fill topic/subtopic: CSV only fills these cells on the
            // FIRST row of each segment, blank on the rest (grouped-export
            // convention, same as ExamCreator.tsx's processImportedData).
            let _lastTopic = "";
            let _lastSubtopic = "";

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            data.forEach((row: any) => {
              // Expected headers: questions,option1,option2,option3,option4,option5,answer,explanation,type,section,topic,subtopic
              const qText = row["questions"];
              if (!qText) return;

              const o1 = row["option1"];
              const o2 = row["option2"];
              const o3 = row["option3"];
              const o4 = row["option4"];
              const answer = row["answer"];
              const explanation = row["explanation"];
              const type = row["type"];
              const section = row["section"];

              const ansIdx = Number(answer);
              const correct = ansIdx >= 1 && ansIdx <= 4 ? ["A", "B", "C", "D"][ansIdx - 1] : "A";

              const rawTopic = row["topic"] ? String(row["topic"]).trim() : "";
              const rawSubtopic = row["subtopic"] ? String(row["subtopic"]).trim() : "";
              let rowTopic = rawTopic;
              let rowSubtopic = rawSubtopic;
              if (rawTopic) { _lastTopic = rawTopic; _lastSubtopic = ""; }
              else { rowTopic = _lastTopic; }
              if (rawSubtopic) { _lastSubtopic = rawSubtopic; }
              else if (!rawTopic) { rowSubtopic = _lastSubtopic; }

              rows.push({
                question_text: qText,
                option_a: o1,
                option_b: o2,
                option_c: o3,
                option_d: o4,
                correct_option: correct,
                marks: 1,
                explanation: explanation || null,
                question_type: type || null,
                section: section || null,
                topic: rowTopic || null,
                subtopic: rowSubtopic || null,
              });
            });

            return rows;
          };

          if (parsed.id) {
            const { error } = await supabase
              .from("exams")
              .update(payload)
              .eq("id", parsed.id);
            if (error) throw error;

            // Same question-import handling as the create-new-exam branch below,
            // for CSV / Question Bank / JSON questions added while editing an
            // exam that was already saved without questions.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const editQuestionRows: any[] = [];

            if (parsed.questions_json) {
              try {
                const jsonData = JSON.parse(parsed.questions_json);
                if (!Array.isArray(jsonData)) {
                  throw new Error("Questions JSON must be an array.");
                }
                editQuestionRows.push(...normaliseQuestions(jsonData));
              } catch (err) {
                if (err instanceof Error) {
                    throw new Error(`Invalid questions JSON: ${err.message}`);
                }
                 throw new Error(`Invalid questions JSON: ${String(err)}`);
              }
            }

            if (parsed.questions_csv) {
              editQuestionRows.push(...parseCsvQuestions(parsed.questions_csv));
            }

            if (qbQuestions.length) {
              qbQuestions.forEach((q: any) => {
                editQuestionRows.push({
                  question_text: q.question_text ?? q.question,
                  option_a: q.option_a ?? q.options?.A ?? "",
                  option_b: q.option_b ?? q.options?.B ?? "",
                  option_c: q.option_c ?? q.options?.C ?? "",
                  option_d: q.option_d ?? q.options?.D ?? "",
                  correct_option: q.correct_option ?? q.correct_answer ?? "A",
                  marks: q.marks ?? 1,
                  explanation: q.explanation || null,
                  subject: parsed.exam_type === 'special' ? (q.subject || null) : null,
                  is_segment_mandatory: parsed.exam_type === 'special' ? (q.is_segment_mandatory ?? true) : true,
                });
              });
            }

            if (editQuestionRows.length) {
              // Find current max question_index for this exam so newly imported
              // questions are appended after existing ones instead of colliding.
              const { data: existingQs } = await supabase
                .from("exam_questions")
                .select("question_index")
                .eq("exam_id", parsed.id)
                .order("question_index", { ascending: false })
                .limit(1);
              const startIndex = (existingQs?.[0]?.question_index || 0) + 1;

              const rowsWithExam = editQuestionRows.map((q, index) => ({
                exam_id: parsed.id,
                question_index: startIndex + index,
                ...q,
              }));

              const { error: qError } = await supabase
                .from("exam_questions")
                .insert(rowsWithExam);
              if (qError) throw qError;
            }
          } else {
            const { data, error } = await supabase
              .from("exams")
              .insert(payload)
              .select("id")
              .single();
            if (error) throw error;
            if (!data?.id) throw new Error("Exam saved but couldn't be read back (permission issue). Contact admin.");

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const allQuestionRows: any[] = [];

            if (parsed.questions_json) {
              try {
                const jsonData = JSON.parse(parsed.questions_json);
                if (!Array.isArray(jsonData)) {
                  throw new Error("Questions JSON must be an array.");
                }
                allQuestionRows.push(...normaliseQuestions(jsonData));
              } catch (err) {
                if (err instanceof Error) {
                    throw new Error(`Invalid questions JSON: ${err.message}`);
                }
                 throw new Error(`Invalid questions JSON: ${String(err)}`);
              }
            }

            if (parsed.questions_csv) {
              allQuestionRows.push(...parseCsvQuestions(parsed.questions_csv));
            }

            if (qbQuestions.length) {
              qbQuestions.forEach((q: any) => {
                allQuestionRows.push({
                  question_text: q.question_text ?? q.question,
                  option_a: q.option_a ?? q.options?.A ?? "",
                  option_b: q.option_b ?? q.options?.B ?? "",
                  option_c: q.option_c ?? q.options?.C ?? "",
                  option_d: q.option_d ?? q.options?.D ?? "",
                  correct_option: q.correct_option ?? q.correct_answer ?? "A",
                  marks: q.marks ?? 1,
                  explanation: q.explanation || null,
                  subject: parsed.exam_type === 'special' ? (q.subject || null) : null,
                  is_segment_mandatory: parsed.exam_type === 'special' ? (q.is_segment_mandatory ?? true) : true,
                });
              });
            }

            if (allQuestionRows.length) {
              const rowsWithExam = allQuestionRows.map((q, index) => ({
                exam_id: data.id,
                question_index: index + 1,
                ...q,
              }));

              const { error: qError } = await supabase
                .from("exam_questions")
                .insert(rowsWithExam);
              if (qError) throw qError;
            }
          }
        },
        onSuccess: () => {
          toast({ title: "Exam saved" });
          queryClient.invalidateQueries({ queryKey: ["admin-exams"] });
          queryClient.invalidateQueries({ queryKey: ["public-free-exams"] });
          queryClient.invalidateQueries({ queryKey: ["admin-archive-items"] });
          queryClient.invalidateQueries({ queryKey: ["global-metadata"] }); // Invalidate global metadata
          if (!exam) {
              setForm({
                course_id: defaultCourseId || "",
                shared_course_ids: [],
                archive_course_ids: [],
                readymade_course_ids: [],
                title: "",
                subject: [],
                chapter: "",
                exam_type: "live",
                duration_minutes: "",
                total_marks: "",
                negative_mark_per_question: "0.25",
                instructions: "",
                time_window_start: "",
                time_window_end: "",
                telegram_notify_enabled: false,
                telegram_message: "",
                telegram_channel_ids: [],
                is_published: false,
                is_visible_on_free: false,
                show_on_landing: false,
                free_exam_category: "HSC",
                restrict_solution: false,
                questions_json: "",
                questions_csv: "",
                readymade_topic: "",
                readymade_category: "",
                readymade_sub_chapter: "",
                disable_second_timer_deduction: false,
                is_only_live: false,
              });
          }
          if (!exam) sessionStorage.removeItem(DRAFT_KEY);
          if (exam) setForm((prev) => ({ ...prev, questions_json: "", questions_csv: "" }));
          setQbQuestions([]);
          onSuccess();
        },
        onError: (error: Error) => {
          toast({
            title: "Error saving exam",
            description: error.message ?? "Please check your input and try again",
            variant: "destructive",
          });
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        upsertExamMutation.mutate(form);
    };

    return (
        <>
        <Card className="border border-foreground/60">
          <CardHeader>
            <CardTitle className="text-base">
              {form.id ? "Edit exam" : "Create new exam"}
            </CardTitle>
            <CardDescription>
              Live exams allow one attempt; practice exams allow unlimited retakes.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-3">
            <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
              {!isFreeMode && !isArchiveMode && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <Label htmlFor="course">Course (Optional)</Label>
                        {form.course_id && (
                            <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-5 px-2 text-xs"
                                onClick={() => setForm(prev => ({ ...prev, course_id: "" }))}
                            >
                                Clear
                            </Button>
                        )}
                    </div>
                    {courses === undefined ? (
                      <div className="h-9 rounded-md border bg-muted animate-pulse" />
                    ) : (
                    <Select
                      value={form.course_id || ""}
                      onValueChange={(value) => setForm((prev) => ({ ...prev, course_id: value }))}
                    >
                      <SelectTrigger id="course">
                        <SelectValue placeholder="Select course (or leave empty for Public)" />
                      </SelectTrigger>
                      <SelectContent>
                        {form.course_id && !courses?.some((c: Pick<Course, "id" | "name">) => c.id === form.course_id) && (
                          <SelectItem value={form.course_id}>
                            (Unknown/Deleted course)
                          </SelectItem>
                        )}
                        {courses?.map((course: Pick<Course, "id" | "name">) => (
                          <SelectItem key={course.id} value={course.id}>
                            {course.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    )}
                    {!form.course_id && <p className="text-[10px] text-muted-foreground">This exam will be public (no course restriction).</p>}
                  </div>
              )}

              {isArchiveMode && (
                  <div className="space-y-2 md:col-span-2">
                      <Label>Archive For Courses (Select one or more)</Label>
                      { }
                      <MultiSelect
                          options={courses?.map((c: any) => ({ label: c.name, value: c.id })) || []}
                          selected={form.archive_course_ids}
                          onChange={(vals) => {
                              const first = vals.length > 0 ? vals[0] : "";
                              setForm(prev => ({
                                  ...prev,
                                  archive_course_ids: vals,
                                  course_id: prev.course_id || first
                              }));
                          }}
                          placeholder="Select courses..."
                      />
                      <p className="text-[10px] text-muted-foreground">
                          These exams will appear in the Archive section for selected courses.
                          (Primary course set to: {courses?.find(c => c.id === form.course_id)?.name || "None"})
                      </p>
                  </div>
              )}

              {!isFreeMode && !isArchiveMode && form.course_id && (
                  <div className="space-y-2">
                      <Label>Also Share With (Optional)</Label>
                      { }
                      <MultiSelect
                          options={courses?.map((c: any) => ({ label: c.name, value: c.id })) || []}
                          selected={form.shared_course_ids}
                          onChange={(vals) => setForm(prev => ({ ...prev, shared_course_ids: vals }))}
                          placeholder="Select additional courses..."
                      />
                  </div>
              )}

              {!isArchiveMode && (
                  <div className="space-y-2">
                      <Label>Add to Archive of (Optional)</Label>
                      { }
                      <MultiSelect
                          options={courses?.map((c: any) => ({ label: c.name, value: c.id })) || []}
                          selected={form.archive_course_ids}
                          onChange={(vals) => setForm(prev => ({ ...prev, archive_course_ids: vals }))}
                          placeholder="Select courses to archive for..."
                      />
                  </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="exam_type">Exam type</Label>
                <Select
                  value={form.exam_type}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, exam_type: value as "live" | "practice" | "special" }))
                  }
                >
                  <SelectTrigger id="exam_type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="live">Live exam</SelectItem>
                    <SelectItem value="practice">Practice exam</SelectItem>
                    <SelectItem value="special">Special exam (subject-wise segments)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.exam_type === "special" && (
                <div className="space-y-2">
                  <Label>Subject Segments</Label>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {segmentSubjects.map((sub: string) => {
                      const count = qbQuestions.filter((q: any) => q.subject === sub).length;
                      const mandatory = (qbQuestions.find((q: any) => q.subject === sub) as any)?.is_segment_mandatory ?? true;
                      return (
                        <div
                          key={sub}
                          className="border rounded-2xl p-3 bg-card hover:border-primary/50 cursor-pointer transition-all flex flex-col items-center text-center gap-1"
                          onClick={() => {
                            setSegmentSubjectName(sub);
                            setSegmentMandatory(mandatory);
                            setSegmentBankOpen(true);
                          }}
                        >
                          <span className="text-sm font-semibold truncate w-full">{sub}</span>
                          <span className="text-[10px] text-muted-foreground">{count} MCQ · {mandatory ? "Mandatory" : "Optional"}</span>
                        </div>
                      );
                    })}
                    <div
                      className="border border-dashed rounded-2xl p-3 bg-card hover:border-primary/50 cursor-pointer transition-all flex flex-col items-center justify-center gap-1 min-h-[64px]"
                      onClick={() => {
                        setSegmentSubjectName("");
                        setSegmentMandatory(true);
                        setSegmentBankOpen(true);
                      }}
                    >
                      <span className="text-lg leading-none text-muted-foreground">+</span>
                      <span className="text-[10px] text-muted-foreground">Add Segment</span>
                    </div>
                  </div>
                </div>
              )}

              <Dialog open={segmentBankOpen} onOpenChange={setSegmentBankOpen}>
                <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
                  <DialogHeader>
                    <DialogTitle>Add MCQ to Segment</DialogTitle>
                  </DialogHeader>
                  <div className="flex items-center gap-2 shrink-0">
                    <Input
                      value={segmentSubjectName}
                      onChange={(e) => setSegmentSubjectName(e.target.value)}
                      placeholder="Custom Sub Name"
                      className="flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => setSegmentMandatory((prev) => !prev)}
                      className={`text-[11px] font-semibold rounded-full px-3 py-1.5 border shrink-0 ${segmentMandatory ? 'bg-primary/10 text-primary border-primary/30' : 'bg-muted text-muted-foreground border-border'}`}
                    >
                      {segmentMandatory ? "Mandatory" : "Optional"}
                    </button>
                  </div>
                  <div className="flex-1 overflow-hidden flex flex-col">
                    <QuestionBankSelector onSelect={handleSegmentQbSelect} />
                  </div>
                </DialogContent>
              </Dialog>

              {form.exam_type === "live" && (
                <div className="space-y-2 border rounded-md p-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="telegram_notify_enabled">Telegram Notify (on exam start)</Label>
                    <Switch
                      id="telegram_notify_enabled"
                      checked={!!form.telegram_notify_enabled}
                      onCheckedChange={(checked) =>
                        setForm((prev) => ({ ...prev, telegram_notify_enabled: checked }))
                      }
                    />
                  </div>
                  {form.telegram_notify_enabled && (
                    <div className="space-y-1">
                      <Label htmlFor="telegram_message">Telegram Message</Label>
                      <Textarea
                        id="telegram_message"
                        placeholder="Exam live message likhun..."
                        value={form.telegram_message}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, telegram_message: e.target.value }))
                        }
                      />
                      <Label>Send to Channel(s)</Label>
                      <MultiSelect
                        options={telegramChannels?.map((c: any) => ({ label: c.name, value: c.id })) || []}
                        selected={form.telegram_channel_ids}
                        onChange={(vals) => setForm((prev) => ({ ...prev, telegram_channel_ids: vals }))}
                        placeholder="Select channel(s)..."
                      />
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="subject">Subjects</Label>
                <MultiSelect
                    options={globalMeta?.subject || []}
                    selected={form.subject}
                    onChange={(selected) => setForm((prev) => ({ ...prev, subject: selected }))}
                    onCreate={(val) => {
                         handleCreateMeta('subject', val);
                         setForm(prev => ({ ...prev, subject: [...prev.subject, val] }));
                    }}
                    onRename={(oldVal, newVal) => handleRenameMeta('subject', oldVal, newVal)}
                    onDelete={(val) => handleDeleteMeta('subject', val)}
                    placeholder="Select or Create subjects..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="chapter">Chapter</Label>
                <CreatableSelect
                  options={globalMeta?.chapter || []}
                  value={form.chapter || ""}
                  onChange={(val) => setForm((prev) => ({ ...prev, chapter: val }))}
                  onCreate={(val) => {
                      handleCreateMeta('chapter', val);
                      setForm((prev) => ({ ...prev, chapter: val }));
                  }}
                  onRename={(oldVal, newVal) => handleRenameMeta('chapter', oldVal, newVal)}
                  onDelete={(val) => handleDeleteMeta('chapter', val)}
                  placeholder="Select or Create Chapter"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="duration_minutes">Duration (minutes)</Label>
                <Input
                  id="duration_minutes"
                  value={form.duration_minutes}
                  onChange={(e) => setForm((prev) => ({ ...prev, duration_minutes: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="total_marks">Total Marks (Manual Override)</Label>
                <Input
                  id="total_marks"
                  value={form.total_marks}
                  onChange={(e) => setForm((prev) => ({ ...prev, total_marks: e.target.value }))}
                  placeholder="Ex: 100 (Optional)"
                />
              </div>

              <div className="space-y-2">
                <Label>Negative mark per wrong answer</Label>
                <div className="grid grid-cols-4 gap-2">
                  {["0", "0.25", "0.5", "1"].map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, negative_mark_per_question: val }))}
                      className={`rounded-lg border-2 px-2 py-2 text-xs font-semibold text-center transition-colors ${
                        form.negative_mark_per_question === val
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/40"
                      }`}
                    >
                      {val === "0" ? "No" : val}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="instructions">Instructions</Label>
                <Textarea
                  id="instructions"
                  rows={3}
                  value={form.instructions}
                  onChange={(e) => setForm((prev) => ({ ...prev, instructions: e.target.value }))}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="time_window_start">Time window start</Label>
                <Input
                  id="time_window_start"
                  type="datetime-local"
                  value={form.time_window_start}
                  onChange={(e) => setForm((prev) => ({ ...prev, time_window_start: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="time_window_end">Time window end</Label>
                <Input
                  id="time_window_end"
                  type="datetime-local"
                  value={form.time_window_end}
                  onChange={(e) => setForm((prev) => ({ ...prev, time_window_end: e.target.value }))}
                />
              </div>

              <div className="flex items-center gap-2 md:col-span-2">
                <Switch
                  id="is_published"
                  checked={form.is_published}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, is_published: checked }))
                  }
                />
                <Label htmlFor="is_published">Exam is published / visible to students</Label>
              </div>

              {(isFreeMode || (!form.course_id)) && (
                  <div className="flex items-center gap-2 md:col-span-2">
                      <Switch
                          id="is_visible_on_free"
                          checked={form.is_visible_on_free}
                          onCheckedChange={(checked) =>
                              setForm((prev) => ({ ...prev, is_visible_on_free: checked }))
                          }
                      />
                      <Label htmlFor="is_visible_on_free">Show on "Free Exams" Page (Public)</Label>
                  </div>
              )}

              <div className="flex items-center gap-2 md:col-span-2">
                  <Switch
                      id="allow_guest"
                      checked={form.allow_guest}
                      onCheckedChange={(checked) =>
                          setForm((prev) => ({ ...prev, allow_guest: checked }))
                      }
                  />
                  <Label htmlFor="allow_guest" className="flex flex-col">
                      <span>Allow Without Login</span>
                      <span className="text-xs text-muted-foreground font-normal">Guests can take this exam without an account, without listing it on the Free Exams page.</span>
                  </Label>
              </div>

              {(isFreeMode || (!form.course_id)) && form.is_visible_on_free && (
                  <div className="flex items-center gap-2 md:col-span-2">
                      <Switch
                          id="show_on_landing"
                          checked={form.show_on_landing}
                          onCheckedChange={(checked) =>
                              setForm((prev) => ({ ...prev, show_on_landing: checked }))
                          }
                      />
                      <Label htmlFor="show_on_landing">Allow Dashboard (Show on Landing Page)</Label>
                  </div>
              )}

              {(isFreeMode || (!form.course_id)) && form.is_visible_on_free && (
                  <div className="space-y-2">
                      <Label htmlFor="free_exam_category">Free Exam Category</Label>
                      <CreatableSelect
                          options={
                              (globalMeta?.free_exam_category?.length ? globalMeta.free_exam_category : [
                                  { label: "HSC", value: "HSC" },
                                  { label: "Medical", value: "Medical" },
                                  { label: "Varsity", value: "Varsity" },
                                  { label: "Onushiloni", value: "Onushilon" },
                              ])
                          }
                          value={form.free_exam_category}
                          onChange={(val) => setForm((prev) => ({ ...prev, free_exam_category: val }))}
                          onCreate={(val) => {
                              handleCreateMeta('free_exam_category', val);
                              setForm((prev) => ({ ...prev, free_exam_category: val }));
                          }}
                          onRename={(oldVal, newVal) => handleRenameMeta('free_exam_category', oldVal, newVal)}
                          onDelete={(val) => handleDeleteMeta('free_exam_category', val)}
                          placeholder="Select or Create category"
                      />
                  </div>
              )}

              <div className="md:col-span-2 grid grid-cols-3 gap-1.5">
                <div className="flex flex-col items-center text-center gap-1 border p-1.5 rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200">
                  <Switch
                    id="restrict_solution"
                    checked={form.restrict_solution}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, restrict_solution: checked }))
                    }
                  />
                  <Label htmlFor="restrict_solution" className="text-[10px] font-semibold leading-tight">Restrict Solution</Label>
                </div>

                <div className="flex flex-col items-center text-center gap-1 border p-1.5 rounded-lg bg-red-50 dark:bg-red-900/10 border-red-200">
                  <Switch
                    id="disable_second_timer_deduction"
                    checked={form.disable_second_timer_deduction}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, disable_second_timer_deduction: checked }))
                    }
                  />
                  <Label htmlFor="disable_second_timer_deduction" className="text-[10px] font-semibold leading-tight">No 2nd Timer</Label>
                </div>

                <div className="flex flex-col items-center text-center gap-1 border p-1.5 rounded-lg bg-orange-50 dark:bg-orange-900/10 border-orange-200">
                  <Switch
                    id="is_only_live"
                    checked={form.is_only_live}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, is_only_live: checked }))
                    }
                  />
                  <Label htmlFor="is_only_live" className="text-[10px] font-semibold leading-tight">Only Live</Label>
                </div>

                <div className="flex flex-col items-center text-center gap-1 border p-1.5 rounded-lg bg-violet-50 dark:bg-violet-900/10 border-violet-200">
                  <Switch
                    id="is_omr"
                    checked={form.is_omr}
                    onCheckedChange={(checked) =>
                      setForm((prev) => ({ ...prev, is_omr: checked }))
                    }
                  />
                  <Label htmlFor="is_omr" className="text-[10px] font-semibold leading-tight">OMR Scanner</Label>
                </div>
              </div>

              <div className="space-y-2 md:col-span-2">
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <div
                    className="border-2 border-dashed rounded-lg p-2 sm:p-4 text-center cursor-pointer hover:border-primary/50 flex flex-col items-center justify-center h-[calc(100%-1.75rem)] min-h-[140px]"
                    onClick={() => document.getElementById('csv-upload-input')?.click()}
                  >
                    <input
                      id="csv-upload-input"
                      type="file"
                      accept=".csv"
                      onChange={(e) => handleFileUpload(e, 'csv')}
                      className="hidden"
                    />
                    <Upload className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                    <p className="text-sm">CSV আপলোড করুন</p>
                  </div>

                  <div>
                    <div
                      className="border-2 border-dashed rounded-lg p-2 sm:p-4 text-center cursor-pointer hover:border-primary/50 flex flex-col items-center justify-center h-[calc(100%-1.75rem)] min-h-[140px]"
                      onClick={() => setIsQbOpen(true)}
                    >
                      <BookOpen className="h-5 w-5 mx-auto mb-1 text-muted-foreground" />
                      <p className="text-sm">Question Bank থেকে সিলেক্ট করুন</p>
                      {!!qbQuestions.length && (
                        <div className="mt-2 flex items-center gap-2">
                          <p className="text-xs text-primary">{qbQuestions.length} question(s) selected</p>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setQbQuestions([]);
                            }}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 md:col-span-2">
                <Button type="submit" size="sm" disabled={upsertExamMutation.isPending}>
                  {upsertExamMutation.isPending ? "Saving..." : form.id ? "Update exam" : "Create exam"}
                </Button>
                {onCancel && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => { if (!exam) sessionStorage.removeItem(DRAFT_KEY); onCancel(); }}
                    disabled={upsertExamMutation.isPending}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>

        <Dialog open={isQbOpen} onOpenChange={setIsQbOpen}>
          <DialogContent className="max-w-5xl h-[85vh] p-0 overflow-hidden">
            <DialogHeader className="p-4 pb-0">
              <DialogTitle>Select from Question Bank</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-hidden px-0.5 sm:p-4 pt-2 h-[calc(85vh-60px)]">
              <QuestionBankSelector onSelect={handleQbSelect} />
            </div>
          </DialogContent>
        </Dialog>
        </>
    );
};
