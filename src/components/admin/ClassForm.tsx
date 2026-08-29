import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Course } from "@/types/admin";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { fromDhakaTimeToUTC, toDhakaTimeISO } from "@/lib/dateUtils";
import { SUBJECTS } from "@/lib/constants";
import { MultiSelect } from "@/components/ui/multi-select";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { useGlobalMetadata, useAddGlobalMetadata } from "@/hooks/useGlobalMetadata";

const classSchema = z.object({
  id: z.string().optional(),
  course_id: z.string().nullable().optional(),
  shared_course_ids: z.array(z.string()).default([]),
  archive_course_ids: z.array(z.string()).default([]),
  title: z.string().trim().min(1, "Title is required"),
  chapter: z.string().trim().optional().or(z.literal("")),
  topic: z.string().trim().optional().or(z.literal("")),
  subject: z.array(z.string()).default([]),
  start_at: z.string().optional().or(z.literal("")),
  end_at: z.string().optional().or(z.literal("")),
  video_url: z.string().trim().optional().or(z.literal("")),
  notes_url: z.string().trim().optional().or(z.literal("")),
  class_type: z.enum(["live", "recorded"]).default("live"),
  button_text: z.string().trim().optional().or(z.literal("")),
  button_url: z.string().trim().optional().or(z.literal("")),
  is_archive: z.boolean().optional().default(false),
  sort_order: z.number().optional().default(0),
});

interface ClassFormProps {
    classItem?: any;
    onSuccess: () => void;
    onCancel?: () => void;
    isArchiveMode?: boolean;
    defaultCourseId?: string;
}

export const ClassForm = ({ classItem, onSuccess, onCancel, isArchiveMode = false, defaultCourseId }: ClassFormProps) => {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Global Metadata Hook
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: globalMeta } = useGlobalMetadata() as any;
    const addMetadata = useAddGlobalMetadata();

    const handleCreateMeta = (type: 'subject' | 'chapter' | 'topic', value: string) => {
        addMetadata.mutate({ type, value });
    };

    const [form, setForm] = useState<z.infer<typeof classSchema>>({
        course_id: defaultCourseId || "",
        shared_course_ids: [],
        archive_course_ids: [],
        title: "",
        chapter: "",
        topic: "",
        subject: [],
        start_at: "",
        end_at: "",
        video_url: "",
        notes_url: "",
        class_type: "live",
        button_text: "",
        button_url: "",
        sort_order: 0,
        is_archive: isArchiveMode,
    });

    useEffect(() => {
        if (classItem) {
            let subjects: string[] = [];
            if (Array.isArray(classItem.subject)) {
                subjects = classItem.subject;
            } else if (typeof classItem.subject === 'string' && classItem.subject) {
                subjects = [classItem.subject];
            }

            setForm({
                id: classItem.id,
                course_id: classItem.course_id,
                // @ts-ignore
                shared_course_ids: classItem.shared_course_ids || [],
                // @ts-ignore
                archive_course_ids: classItem.archive_course_ids || [],
                title: classItem.title,
                chapter: classItem.chapter || "",
                topic: classItem.topic || "",
                subject: subjects,
                start_at: toDhakaTimeISO(classItem.start_at),
                end_at: toDhakaTimeISO(classItem.end_at),
                video_url: classItem.video_url || "",
                notes_url: classItem.notes_url || "",
                class_type: classItem.class_type as "live" | "recorded",
                button_text: classItem.button_text || "",
                button_url: classItem.button_url || "",
            is_archive: classItem.is_archive || isArchiveMode,
            sort_order: classItem.sort_order ?? 0,
            });
        } else {
             setForm(prev => ({
                ...prev,
                course_id: defaultCourseId || "",
                shared_course_ids: [],
                archive_course_ids: [],
                title: "",
                chapter: "",
                topic: "",
                subject: [],
                start_at: "",
                end_at: "",
                video_url: "",
                notes_url: "",
                class_type: "live",
                button_text: "",
                button_url: "",
                is_archive: isArchiveMode,
                sort_order: 0,
            }));
        }
    }, [classItem, isArchiveMode, defaultCourseId]);

    const { data: distinctMetadata } = useQuery({
        queryKey: ["admin-classes-metadata-form"],
        queryFn: async () => {
           // Fetch subject, chapter, topic to build hierarchy
           const { data } = await supabase.from("classes").select("subject, chapter, topic");
           return data || [];
        }
    });

    // Merge global metadata with existing class data
    const subjectOptions = React.useMemo(() => {
        const set = new Set(SUBJECTS);
        globalMeta?.subject?.forEach((s: any) => set.add(s.value));
        return Array.from(set).sort().map(s => ({ label: s, value: s }));
    }, [globalMeta]);

    const chapterOptions = React.useMemo(() => {
        const set = new Set<string>();

        // Add globally defined chapters
        globalMeta?.chapter?.forEach((c: any) => set.add(c.value));

        // Add chapters from classes that match selected subjects
        distinctMetadata?.forEach((item: any) => {
            if (!item.chapter) return;

            // If no subject selected, show all (or could show none) - let's show all
            if (form.subject.length === 0) {
                set.add(item.chapter);
                return;
            }

            // Check if class subject intersects with selected subjects
            let itemSubjects: string[] = [];
            if (Array.isArray(item.subject)) itemSubjects = item.subject;
            else if (typeof item.subject === 'string') itemSubjects = [item.subject];

            const hasIntersection = itemSubjects.some(s => form.subject.includes(s));
            if (hasIntersection) {
                set.add(item.chapter);
            }
        });

        return Array.from(set).sort().map(c => ({ label: c, value: c }));
    }, [distinctMetadata, globalMeta, form.subject]);

    const topicOptions = React.useMemo(() => {
        const set = new Set<string>();

        // Add globally defined topics
        globalMeta?.topic?.forEach((t: any) => set.add(t.value));

        // Add topics from classes that match selected chapter
        distinctMetadata?.forEach((item: any) => {
            if (!item.topic) return;

            // If no chapter selected, show all (or could show none) - let's show all
            if (!form.chapter) {
                set.add(item.topic);
                return;
            }

            if (item.chapter === form.chapter) {
                set.add(item.topic);
            }
        });

        return Array.from(set).sort().map(t => ({ label: t, value: t }));
    }, [distinctMetadata, globalMeta, form.chapter]);

    const { data: courses } = useQuery({
        queryKey: ["admin-courses-form"],
        queryFn: async () => {
            const { data, error } = await supabase.from("courses").select("id, name");
            if (error) throw error;
            return data || [];
        },
    });

    const upsertClassMutation = useMutation({
        mutationFn: async (values: z.infer<typeof classSchema>) => {
            const parsed = classSchema.parse(values);
            const payload = {
                course_id: parsed.course_id || null, // Allow null if logic permits, but typically required unless archive-only flow
                // @ts-ignore
                shared_course_ids: parsed.shared_course_ids,
                // @ts-ignore
                archive_course_ids: parsed.archive_course_ids,
                title: parsed.title,
                chapter: parsed.chapter || null,
                topic: parsed.topic || null,
                subject: parsed.subject,
                start_at: fromDhakaTimeToUTC(parsed.start_at),
                end_at: fromDhakaTimeToUTC(parsed.end_at),
                video_url: parsed.video_url || null,
                notes_url: parsed.notes_url || null,
                class_type: parsed.class_type,
                button_text: parsed.button_text || null,
                button_url: parsed.button_url || null,
                is_archive: parsed.is_archive,
                sort_order: parsed.sort_order,
            };

            if (parsed.id) {
                const { error } = await supabase.from("classes").update(payload).eq("id", parsed.id);
                if (error) throw error;
            } else {
                const { error } = await supabase.from("classes").insert(payload);
                if (error) throw error;
            }
        },
        onSuccess: () => {
            toast({ title: "Class saved successfully" });
            queryClient.invalidateQueries({ queryKey: ["admin-classes"] });
            queryClient.invalidateQueries({ queryKey: ["admin-archive-items"] });
            if (!classItem) {
                setForm({
                    course_id: defaultCourseId || "",
                    shared_course_ids: [],
                    archive_course_ids: [],
                    title: "",
                    chapter: "",
                    topic: "",
                    subject: [],
                    start_at: "",
                    end_at: "",
                    video_url: "",
                    notes_url: "",
                    class_type: "live",
                    button_text: "",
                    button_url: "",
                    sort_order: 0,
                });
            }
            onSuccess();
        },
        onError: (error: Error) => {
            toast({
                title: "Error saving class",
                description: error.message,
                variant: "destructive",
            });
        },
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        upsertClassMutation.mutate(form);
    };

    return (
        <Card className="border border-foreground/60 w-full overflow-hidden">
            <CardHeader>
                <CardTitle className="text-base">{form.id ? "Edit Class" : "Schedule New Class"}</CardTitle>
                <CardDescription>Set class timings in Dhaka Time.</CardDescription>
            </CardHeader>
            <CardContent className="p-3">
                <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
                    {(isArchiveMode || form.is_archive) ? (
                        <div className="space-y-2 min-w-0 md:col-span-2">
                            <Label>Archive For Courses (Select one or more)</Label>
                            <MultiSelect
                                options={courses?.map((c: any) => ({ label: c.name, value: c.id })) || []}
                                selected={form.archive_course_ids}
                                onChange={(vals) => {
                                    // If strictly archive mode, set primary course to first selection if empty
                                    // But keep visible only archive list
                                    const first = vals.length > 0 ? vals[0] : "";
                                    setForm(prev => ({
                                        ...prev,
                                        archive_course_ids: vals,
                                        course_id: prev.course_id || first // Keep existing or set new primary
                                    }));
                                }}
                                placeholder="Select courses..."
                            />
                            <p className="text-[10px] text-muted-foreground">
                                These classes will appear in the Archive section for selected courses.
                                (Primary course set to: {courses?.find(c => c.id === form.course_id)?.name || "None"})
                            </p>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-2 min-w-0">
                                <div className="flex justify-between items-center">
                                    <Label htmlFor="course">Primary Course (Optional)</Label>
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
                                    onValueChange={(val) => setForm((prev) => ({ ...prev, course_id: val }))}
                                >
                                    <SelectTrigger id="course" className="w-full">
                                        <SelectValue placeholder="Select course (or leave empty for Public)" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {courses?.map((c: Pick<Course, "id" | "name">) => (
                                            <SelectItem key={c.id} value={c.id}>
                                                {c.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                {!form.course_id && <p className="text-[10px] text-muted-foreground">This class will be public (no course restriction).</p>}
                            </div>
                        </>
                    )}

                    <div className="space-y-2 min-w-0">
                        <Label htmlFor="class_type">Type</Label>
                        <Select
                            value={form.is_archive ? "archive" : form.class_type}
                            onValueChange={(val) => {
                                if (val === "archive") {
                                    setForm((prev) => ({ ...prev, is_archive: true }));
                                } else {
                                    setForm((prev) => ({ ...prev, is_archive: false, class_type: val as "live" | "recorded" }));
                                }
                            }}
                        >
                            <SelectTrigger id="class_type" className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="live">Live Class</SelectItem>
                                <SelectItem value="recorded">Recorded Class</SelectItem>
                                <SelectItem value="archive">Archive Class</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {!(isArchiveMode || form.is_archive) && form.course_id && (
                        <div className="space-y-2 min-w-0">
                            <Label>Also Share With (Optional)</Label>
                            <MultiSelect
                                options={courses?.map((c: any) => ({ label: c.name, value: c.id })) || []}
                                selected={form.shared_course_ids}
                                onChange={(vals) => setForm(prev => ({ ...prev, shared_course_ids: vals }))}
                                placeholder="Select additional courses..."
                            />
                        </div>
                    )}

                    {!(isArchiveMode || form.is_archive) && (
                        <div className="space-y-2 min-w-0">
                            <Label>Add to Archive of (Optional)</Label>
                            <MultiSelect
                                options={courses?.map((c: any) => ({ label: c.name, value: c.id })) || []}
                                selected={form.archive_course_ids}
                                onChange={(vals) => setForm(prev => ({ ...prev, archive_course_ids: vals }))}
                                placeholder="Select courses to archive for..."
                            />
                        </div>
                    )}

                    <div className="space-y-2 min-w-0">
                        <Label htmlFor="title">Title</Label>
                        <Input
                            id="title"
                            value={form.title}
                            onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                            className="w-full"
                        />
                    </div>

                    <div className="space-y-2 min-w-0">
                        <Label htmlFor="sort_order">Sort Order Index</Label>
                        <Input
                            id="sort_order"
                            type="number"
                            value={form.sort_order}
                            onChange={(e) => setForm((prev) => ({ ...prev, sort_order: Number(e.target.value) }))}
                            placeholder="Higher number = First"
                        />
                    </div>

                    <div className="space-y-2 min-w-0">
                        <Label htmlFor="subject">Subjects</Label>
                        <MultiSelect
                            options={subjectOptions}
                            selected={form.subject}
                            onChange={(selected) => setForm((prev) => ({ ...prev, subject: selected }))}
                            onCreate={(val) => {
                                handleCreateMeta('subject', val);
                                setForm((prev) => ({ ...prev, subject: [...prev.subject, val] }));
                            }}
                            placeholder="Select or Create subjects..."
                        />
                    </div>

                    <div className="space-y-2 min-w-0">
                        <Label htmlFor="chapter">Chapter</Label>
                        <CreatableSelect
                            options={chapterOptions}
                            value={form.chapter || ""}
                            onChange={(val) => setForm((prev) => ({ ...prev, chapter: val }))}
                            onCreate={(val) => {
                                handleCreateMeta('chapter', val);
                                setForm((prev) => ({ ...prev, chapter: val }));
                            }}
                            placeholder="Select or Create Chapter"
                        />
                    </div>

                    <div className="space-y-2 md:col-span-2 min-w-0">
                        <Label htmlFor="topic">Topic (Optional)</Label>
                        <CreatableSelect
                            options={topicOptions}
                            value={form.topic || ""}
                            onChange={(val) => setForm((prev) => ({ ...prev, topic: val }))}
                            onCreate={(val) => {
                                handleCreateMeta('topic', val);
                                setForm((prev) => ({ ...prev, topic: val }));
                            }}
                            placeholder="Select or Create Topic"
                        />
                    </div>

                    <div className="space-y-2 min-w-0">
                        <Label htmlFor="start_at">Start Time (Optional)</Label>
                        <Input
                            id="start_at"
                            type="datetime-local"
                            value={form.start_at}
                            onChange={(e) => setForm((prev) => ({ ...prev, start_at: e.target.value }))}
                            className="w-full"
                        />
                    </div>

                    <div className="space-y-2 min-w-0">
                        <Label htmlFor="end_at">End Time (Optional)</Label>
                        <Input
                            id="end_at"
                            type="datetime-local"
                            value={form.end_at}
                            onChange={(e) => setForm((prev) => ({ ...prev, end_at: e.target.value }))}
                            className="w-full"
                        />
                        {!form.end_at && form.class_type === 'live' && (
                            <p className="text-[10px] text-muted-foreground">No end time = class stays live until you set an end time or archive it.</p>
                        )}
                    </div>

                    <div className="space-y-2 min-w-0">
                        <Label htmlFor="video_url">Video URL</Label>
                        <Input
                            id="video_url"
                            value={form.video_url}
                            onChange={(e) => setForm((prev) => ({ ...prev, video_url: e.target.value }))}
                            placeholder="https://..."
                            className="w-full"
                        />
                    </div>

                    <div className="space-y-2 min-w-0">
                        <Label htmlFor="notes_url">Notes URL</Label>
                        <Input
                            id="notes_url"
                            value={form.notes_url}
                            onChange={(e) => setForm((prev) => ({ ...prev, notes_url: e.target.value }))}
                            placeholder="https://..."
                            className="w-full"
                        />
                    </div>

                    <div className="space-y-2 min-w-0">
                        <Label htmlFor="button_text">Special Button Text</Label>
                        <Input
                            id="button_text"
                            value={form.button_text}
                            onChange={(e) => setForm((prev) => ({ ...prev, button_text: e.target.value }))}
                            placeholder="e.g. Join Zoom"
                            className="w-full"
                        />
                    </div>

                    <div className="space-y-2 min-w-0">
                        <Label htmlFor="button_url">Special Button URL</Label>
                        <Input
                            id="button_url"
                            value={form.button_url}
                            onChange={(e) => setForm((prev) => ({ ...prev, button_url: e.target.value }))}
                            placeholder="https://..."
                            className="w-full"
                        />
                    </div>

                    <div className="flex items-center gap-2 md:col-span-2 pt-2">
                        <Button type="submit" size="sm" disabled={upsertClassMutation.isPending}>
                            {upsertClassMutation.isPending ? "Saving..." : form.id ? "Update Class" : "Create Class"}
                        </Button>
                        {onCancel && (
                            <Button type="button" size="sm" variant="outline" onClick={onCancel}>
                                Cancel
                            </Button>
                        )}
                    </div>
                </form>
            </CardContent>
        </Card>
    );
};
