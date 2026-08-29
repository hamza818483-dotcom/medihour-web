import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Course, Exam } from "@/types/admin";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { MultiSelect } from "@/components/ui/multi-select";

import { Textarea } from "@/components/ui/textarea";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { useGlobalMetadata, useAddGlobalMetadata } from "@/hooks/useGlobalMetadata";
import { toDhakaTimeISO, fromDhakaTimeToUTC } from "@/lib/dateUtils";

const externalExamSchema = z.object({
  id: z.string().optional(),
  course_id: z.string().nullable().optional(),
  shared_course_ids: z.array(z.string()).default([]),
  archive_course_ids: z.array(z.string()).default([]),
  title: z.string().trim().min(1, "Title is required"),
  subject: z.array(z.string()).default([]),
  chapter: z.string().trim().optional().or(z.literal("")),
  exam_type: z.enum(["live", "practice"]),
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
  time_window_end: z.string().optional(),
  external_exam_link: z.string().trim().min(1, "External Link is required").url("Must be a valid URL"),
  is_published: z.boolean().optional().default(false),
  is_archive: z.boolean().optional().default(false),
  is_readymade: z.boolean().optional().default(false),
  readymade_topic: z.string().trim().optional().or(z.literal("")),
});

interface ExternalExamFormProps {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    exam?: any;
    onSuccess: () => void;
    onCancel?: () => void;
    isFreeMode?: boolean;
}

export const ExternalExamForm = ({ exam, onSuccess, onCancel, isFreeMode = false }: ExternalExamFormProps) => {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: globalMeta } = useGlobalMetadata() as any;
    const addMetadata = useAddGlobalMetadata();

    const handleCreateMeta = (type: 'subject' | 'chapter' | 'readymade_topic', value: string) => {
        addMetadata.mutate({ type, value });
    };

    const [form, setForm] = useState<z.infer<typeof externalExamSchema>>({
        course_id: "",
        shared_course_ids: [],
        archive_course_ids: [],
        title: "",
        subject: [],
        chapter: "",
        exam_type: "live",
        duration_minutes: "60",
        total_marks: "",
        negative_mark_per_question: "0",
        instructions: "",
        time_window_start: "",
        time_window_end: "",
        external_exam_link: "",
        is_published: false,
        is_archive: false,
        is_readymade: false,
        readymade_topic: "",
    });

    useEffect(() => {
        if (exam) {
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
                title: exam.title ?? "",
                subject: subjects,
                chapter: exam.chapter || "",
                exam_type: exam.exam_type === "practice" ? "practice" : "live",
                duration_minutes: exam.duration_minutes != null ? String(exam.duration_minutes) : "60",
                total_marks: exam.total_marks != null ? String(exam.total_marks) : "",
                negative_mark_per_question:
                    exam.negative_mark_per_question != null
                    ? String(exam.negative_mark_per_question)
                    : "0",
                instructions: exam.instructions ?? "",
                time_window_start: exam.time_window_start ? toDhakaTimeISO(exam.time_window_start) : "",
                time_window_end: exam.time_window_end ? toDhakaTimeISO(exam.time_window_end) : "",
                external_exam_link: exam.external_exam_link || "",
                is_published: exam.is_published ?? false,
                is_archive: exam.is_archive ?? false,
                is_readymade: exam.is_readymade ?? false,
                readymade_topic: exam.readymade_topic || "",
            });
        }
    }, [exam]);

    const { data: courses } = useQuery({
        queryKey: ["admin-courses-form"],
        queryFn: async () => {
            const { data, error } = await supabase.from("courses").select("id, name");
            if (error) throw error;
            return data || [];
        },
    });

    const upsertExamMutation = useMutation({
        mutationFn: async (values: z.infer<typeof externalExamSchema>) => {
          const parsed = externalExamSchema.parse(values);

          const payload: Partial<Exam> = {
            course_id: isFreeMode ? null : (parsed.course_id || null),
            // @ts-ignore
            shared_course_ids: parsed.shared_course_ids,
            // @ts-ignore
            archive_course_ids: parsed.archive_course_ids,
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
            time_window_end: parsed.time_window_end ? fromDhakaTimeToUTC(parsed.time_window_end) : null,
            external_exam_link: parsed.external_exam_link,
            is_published: parsed.is_published ?? false,
            is_archive: parsed.is_archive ?? false,
            is_readymade: parsed.is_readymade ?? false,
            readymade_topic: parsed.readymade_topic || null,
          };

          if (parsed.id) {
            const { error } = await supabase
              .from("exams")
              .update(payload)
              .eq("id", parsed.id);
            if (error) throw error;
          } else {
            const { error } = await supabase
              .from("exams")
              .insert(payload);
            if (error) throw error;
          }
        },
        onSuccess: () => {
          toast({ title: "External Exam saved" });
          queryClient.invalidateQueries({ queryKey: ["admin-exams"] });
          queryClient.invalidateQueries({ queryKey: ["public-free-exams"] });
          queryClient.invalidateQueries({ queryKey: ["admin-archive-items"] });
          if (!exam) {
              setForm({
                course_id: "",
                shared_course_ids: [],
                archive_course_ids: [],
                title: "",
                subject: [],
                chapter: "",
                exam_type: "live",
                duration_minutes: "60",
                total_marks: "",
                negative_mark_per_question: "0",
                instructions: "",
                time_window_start: "",
                time_window_end: "",
                external_exam_link: "",
                is_published: false,
                is_archive: false,
                is_readymade: false,
                readymade_topic: "",
              });
          }
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
        <Card className="border border-foreground/60 mt-6">
          <CardHeader>
            <CardTitle className="text-base">
              {form.id ? "Edit External Exam" : "Create External Exam"}
            </CardTitle>
            <CardDescription>
              Create an exam that redirects students to an external URL. Students will not see that it is external.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
              {!isFreeMode && (
                  <div className="space-y-2 md:col-span-2">
                    <div className="flex justify-between items-center">
                        <Label htmlFor="ext_course">Course (Optional)</Label>
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
                    <Select
                      value={form.course_id || ""}
                      onValueChange={(value) => setForm((prev) => ({ ...prev, course_id: value }))}
                    >
                      <SelectTrigger id="ext_course">
                        <SelectValue placeholder="Select course (or leave empty for Public)" />
                      </SelectTrigger>
                      <SelectContent>
                        {courses?.map((course: Pick<Course, "id" | "name">) => (
                          <SelectItem key={course.id} value={course.id}>
                            {course.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
              )}

              {!isFreeMode && form.course_id && (
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

              <div className="space-y-2">
                <Label htmlFor="ext_exam_type">Exam type</Label>
                <Select
                  value={form.exam_type}
                  onValueChange={(value) =>
                    setForm((prev) => ({ ...prev, exam_type: value as "live" | "practice" }))
                  }
                >
                  <SelectTrigger id="ext_exam_type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="live">Live exam</SelectItem>
                    <SelectItem value="practice">Practice exam</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ext_title">Title</Label>
                <Input
                  id="ext_title"
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ext_subject">Subjects</Label>
                <MultiSelect
                    options={globalMeta?.subject || []}
                    selected={form.subject}
                    onChange={(selected) => setForm((prev) => ({ ...prev, subject: selected }))}
                    onCreate={(val) => {
                         handleCreateMeta('subject', val);
                         setForm(prev => ({ ...prev, subject: [...prev.subject, val] }));
                    }}
                    placeholder="Select or Create subjects..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ext_chapter">Chapter</Label>
                <CreatableSelect
                  options={globalMeta?.chapter || []}
                  value={form.chapter || ""}
                  onChange={(val) => setForm((prev) => ({ ...prev, chapter: val }))}
                  onCreate={(val) => {
                      handleCreateMeta('chapter', val);
                      setForm((prev) => ({ ...prev, chapter: val }));
                  }}
                  placeholder="Select or Create Chapter"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ext_duration_minutes">Duration (minutes)</Label>
                <Input
                  id="ext_duration_minutes"
                  value={form.duration_minutes}
                  onChange={(e) => setForm((prev) => ({ ...prev, duration_minutes: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ext_total_marks">Total Marks (Optional)</Label>
                <Input
                  id="ext_total_marks"
                  value={form.total_marks}
                  onChange={(e) => setForm((prev) => ({ ...prev, total_marks: e.target.value }))}
                  placeholder="Ex: 100"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ext_negative_mark_per_question">Negative mark per wrong answer</Label>
                <Input
                  id="ext_negative_mark_per_question"
                  value={form.negative_mark_per_question}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, negative_mark_per_question: e.target.value }))
                  }
                  placeholder="Ex: 0.25"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="ext_instructions">Instructions</Label>
                <Textarea
                  id="ext_instructions"
                  rows={3}
                  value={form.instructions}
                  onChange={(e) => setForm((prev) => ({ ...prev, instructions: e.target.value }))}
                  className="w-full"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ext_time_window_start">Time window start</Label>
                <Input
                  id="ext_time_window_start"
                  type="datetime-local"
                  value={form.time_window_start}
                  onChange={(e) => setForm((prev) => ({ ...prev, time_window_start: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ext_time_window_end">Time window end</Label>
                <Input
                  id="ext_time_window_end"
                  type="datetime-local"
                  value={form.time_window_end}
                  onChange={(e) => setForm((prev) => ({ ...prev, time_window_end: e.target.value }))}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="ext_link">External Exam Link</Label>
                <Input
                  id="ext_link"
                  value={form.external_exam_link}
                  onChange={(e) => setForm((prev) => ({ ...prev, external_exam_link: e.target.value }))}
                  placeholder="https://example.com/exam/123"
                  required
                />
              </div>

              <div className="flex items-center gap-2 md:col-span-2">
                <Switch
                  id="ext_is_published"
                  checked={form.is_published}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, is_published: checked }))
                  }
                />
                <Label htmlFor="ext_is_published">Exam is published / visible to students</Label>
              </div>

              <div className="flex items-center gap-2 md:col-span-2">
                <Switch
                  id="ext_is_archive"
                  checked={form.is_archive}
                  onCheckedChange={(checked) =>
                    setForm((prev) => ({ ...prev, is_archive: checked }))
                  }
                />
                <Label htmlFor="ext_is_archive">Is Archive?</Label>
              </div>

              <div className="flex flex-col gap-2 md:col-span-2 border p-4 rounded-lg bg-blue-50 dark:bg-blue-900/10 border-blue-200">
                <div className="flex items-center gap-2">
                    <Switch
                    id="ext_is_readymade"
                    checked={form.is_readymade}
                    onCheckedChange={(checked) =>
                        setForm((prev) => ({ ...prev, is_readymade: checked }))
                    }
                    />
                    <Label htmlFor="ext_is_readymade">Is Readymade Exam?</Label>
                </div>
                {form.is_readymade && (
                    <div className="space-y-2 mt-2">
                        <Label htmlFor="ext_readymade_topic">Parent Readymade Topic</Label>
                        <CreatableSelect
                            options={globalMeta?.readymade_topic || []}
                            value={form.readymade_topic || ""}
                            onChange={(val) => setForm((prev) => ({ ...prev, readymade_topic: val }))}
                            onCreate={(val) => {
                                handleCreateMeta('readymade_topic', val);
                                setForm((prev) => ({ ...prev, readymade_topic: val }));
                            }}
                            placeholder="Select or Create Parent Topic"
                        />
                    </div>
                )}
              </div>

              <div className="flex items-center gap-2 md:col-span-2 mt-4">
                <Button type="submit" size="sm" disabled={upsertExamMutation.isPending}>
                  {upsertExamMutation.isPending ? "Saving..." : form.id ? "Update External Exam" : "Create External Exam"}
                </Button>
                {onCancel && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={onCancel}
                    disabled={upsertExamMutation.isPending}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
    );
};
