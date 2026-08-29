import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type MetadataType = 'subject' | 'chapter' | 'topic' | 'exam_code' | 'year' | 'tag' | 'readymade_topic' | 'readymade_category' | 'readymade_sub_chapter' | 'free_exam_category' | 'mock_subject' | 'mock_chapter' | 'mock_topic' | 'mock_standard';

// Backfills global_metadata "subject" rows from exams.subject values that exist on
// exams but were never (or no longer) present in global_metadata — e.g. subjects
// renamed before rename-sync existed, so the old name has no metadata row and the
// new name was never inserted either. Runs once per query, silently, self-healing.
const backfillSubjectMetadata = async (existingSubjects: Set<string>) => {
    const BATCH = 1000;
    let from = 0;
    const found = new Set<string>();
    while (true) {
        const { data: rows, error } = await supabase.from("exams").select("subject").range(from, from + BATCH - 1);
        if (error || !rows) break;
        for (const row of rows as any[]) {
            (row.subject as string[] | null)?.forEach((s) => s && found.add(s));
        }
        if (rows.length < BATCH) break;
        from += BATCH;
    }
    const missing = [...found].filter((s) => !existingSubjects.has(s));
    if (missing.length === 0) return false;
    const { error: insErr } = await supabase.from("global_metadata").insert(missing.map((value) => ({ type: "subject", value })));
    if (insErr && insErr.code !== "23505") console.error("subject metadata backfill failed:", insErr);
    return true;
};

export const useGlobalMetadata = (type?: MetadataType) => {
    return useQuery({
        queryKey: ["global-metadata", type],
        queryFn: async () => {
            const BATCH = 1000;
            let from = 0;
            let data: { type: string; value: string }[] = [];
            while (true) {
                let query = supabase.from("global_metadata").select("type, value").range(from, from + BATCH - 1);
                if (type) {
                    query = query.eq("type", type);
                }
                const { data: batchData, error } = await query;
                if (error) throw error;
                data = data.concat(batchData || []);
                if (!batchData || batchData.length < BATCH) break;
                from += BATCH;
            }

            if (!type || type === "subject") {
                const existingSubjects = new Set(data.filter((d) => d.type === "subject").map((d) => d.value));
                const backfilled = await backfillSubjectMetadata(existingSubjects);
                if (backfilled) {
                    const { data: subjRows } = await supabase.from("global_metadata").select("type, value").eq("type", "subject");
                    data = data.filter((d) => d.type !== "subject").concat(subjRows || []);
                }
            }

            // Group by type if not filtered
            if (!type) {
                const grouped: Record<string, { label: string; value: string }[]> = {
                    subject: [],
                    chapter: [],
                    topic: [],
                    exam_code: [],
                    year: [],
                    tag: [],
                    readymade_topic: [],
                    readymade_category: [],
                    readymade_sub_chapter: [],
                    free_exam_category: [],
                    mock_subject: [],
                    mock_chapter: [],
                    mock_topic: [],
                    mock_standard: [],
                };
                data.forEach(item => {
                    if (grouped[item.type]) {
                        grouped[item.type].push({ label: item.value, value: item.value });
                    }
                });
                // Sort
                Object.keys(grouped).forEach(k => {
                    grouped[k].sort((a, b) => a.label.localeCompare(b.label));
                });
                return grouped;
            }

            return data.map(item => ({ label: item.value, value: item.value })).sort((a, b) => a.label.localeCompare(b.label));
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
    });
};

export const useAddGlobalMetadata = () => {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ type, value }: { type: MetadataType; value: string }) => {
            const { error } = await supabase.from("global_metadata").insert({ type, value });
            if (error) {
                // Ignore duplicate errors silently or log them, as it means it exists
                if (error.code === '23505') return; // Unique violation
                throw error;
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["global-metadata"] });
        },
        onError: (err) => {
            console.error("Failed to add metadata:", err);
            toast({ title: "Error adding metadata", description: err.message, variant: "destructive" });
        }
    });
};

// Exam columns that directly store metadata values and must stay in sync on rename/delete.
// "array" columns (e.g. subject) use array-contains updates; "text" columns are plain equality.
const METADATA_EXAM_COLUMN: Partial<Record<MetadataType, { column: string; kind: "text" | "array" }>> = {
    subject: { column: "subject", kind: "array" },
    chapter: { column: "chapter", kind: "text" },
    readymade_topic: { column: "readymade_topic", kind: "text" },
    readymade_category: { column: "readymade_category", kind: "text" },
    readymade_sub_chapter: { column: "readymade_sub_chapter", kind: "text" },
    free_exam_category: { column: "free_exam_category", kind: "text" },
};

export const useRenameGlobalMetadata = () => {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async ({ type, oldValue, newValue }: { type: MetadataType; oldValue: string; newValue: string }) => {
            newValue = newValue.trim();
            if (!newValue || newValue === oldValue) return;

            const { error: updateErr } = await supabase
                .from("global_metadata")
                .update({ value: newValue })
                .eq("type", type)
                .eq("value", oldValue);
            if (updateErr) throw updateErr;

            const col = METADATA_EXAM_COLUMN[type];
            if (col) {
                if (col.kind === "text") {
                    const { error } = await supabase.from("exams").update({ [col.column]: newValue }).eq(col.column, oldValue);
                    if (error) throw error;
                } else {
                    // Array column: fetch affected rows, replace the one element, write back.
                    const { data: rows, error: fetchErr } = await supabase
                        .from("exams")
                        .select(`id, ${col.column}`)
                        .contains(col.column, [oldValue]);
                    if (fetchErr) throw fetchErr;
                    for (const row of (rows as any[]) || []) {
                        const updated = (row[col.column] as string[]).map((v) => (v === oldValue ? newValue : v));
                        const { error } = await supabase.from("exams").update({ [col.column]: updated }).eq("id", row.id);
                        if (error) throw error;
                    }
                }
            }
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["global-metadata"] });
            queryClient.invalidateQueries({ queryKey: ["admin-exams"] });
            queryClient.invalidateQueries({ queryKey: ["admin-exams-readymade-categories"] });
            queryClient.invalidateQueries({ queryKey: ["readymade-exams-subjects"] });
            queryClient.invalidateQueries({ queryKey: ["readymade-mcq-counts"] });
            toast({ title: "Updated" });
        },
        onError: (err: any) => {
            console.error("Failed to rename metadata:", err);
            toast({ title: "Error updating", description: err.message, variant: "destructive" });
        }
    });
};

export const useDeleteGlobalMetadata = () => {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // Metadata types that map directly to a column on `exams`. Deleting one of
    // these options must also clear that column off existing exams, otherwise
    // the corresponding step in the Readymade Exam drill-down never disappears
    // even though the option is gone from the admin pick-list.
    const EXAM_COLUMN_BY_TYPE: Partial<Record<MetadataType, string>> = {
        chapter: "chapter",
        readymade_topic: "readymade_topic",
        readymade_category: "readymade_category",
        readymade_sub_chapter: "readymade_sub_chapter",
    };

    return useMutation({
        mutationFn: async ({ type, value }: { type: MetadataType; value: string }) => {
            const { error } = await supabase.from("global_metadata").delete().eq("type", type).eq("value", value);
            if (error) throw error;
            const column = EXAM_COLUMN_BY_TYPE[type];
            if (column) {
                const { error: clearErr } = await supabase.from("exams").update({ [column]: null }).eq(column, value);
                if (clearErr) throw clearErr;
            }
        },
        onSuccess: (_data, variables) => {
            queryClient.invalidateQueries({ queryKey: ["global-metadata"] });
            if (EXAM_COLUMN_BY_TYPE[variables.type]) {
                queryClient.invalidateQueries({ queryKey: ["readymade-exams-chapters"] });
                queryClient.invalidateQueries({ queryKey: ["readymade-exams-chapter-boards"] });
                queryClient.invalidateQueries({ queryKey: ["readymade-exams-subchapters"] });
                queryClient.invalidateQueries({ queryKey: ["readymade-exams"] });
                queryClient.invalidateQueries({ queryKey: ["readymade-exams-topics"] });
            }
            toast({ title: "Deleted" });
        },
        onError: (err: any) => {
            console.error("Failed to delete metadata:", err);
            toast({ title: "Error deleting", description: err.message, variant: "destructive" });
        }
    });
};
