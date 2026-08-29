import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";

interface ReadymadeAccessManagerProps {
  courseId: string;
  mode?: "readymade" | "archive-class";
}

// Tree node key format: `${subject}|||${chapter}|||${subChapter ?? ''}`
// Groups are Subject -> Chapter -> Sub-chapter (sub-chapter may be null,
// treated as a single "General" leaf under that chapter in that case).
// For archive-class mode there is no sub-chapter level, so "সাধারণ" is
// used as a single synthetic leaf per chapter.

type Row = {
  id: string;
  subject: string[] | string | null;
  chapter: string | null;
  readymade_sub_chapter?: string | null;
  readymade_course_ids?: string[] | null;
  archive_course_ids?: string[] | null;
};

export function ReadymadeAccessManager({ courseId, mode = "readymade" }: ReadymadeAccessManagerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [pendingSelection, setPendingSelection] = useState<Set<string> | null>(null);

  const table = mode === "archive-class" ? "classes" : "exams";
  const courseIdsField = mode === "archive-class" ? "archive_course_ids" : "readymade_course_ids";
  const fullAccessField = mode === "archive-class" ? "archive_full_access" : "readymade_full_access";

  const { data: courseFullAccess, isLoading: loadingFullAccess } = useQuery({
    queryKey: ["course-full-access", courseId, mode],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select(fullAccessField).eq("id", courseId).maybeSingle();
      if (error) throw error;
      return !!(data as any)?.[fullAccessField];
    },
  });

  const { data: rows, isLoading } = useQuery({
    queryKey: ["readymade-access-rows", mode],
    queryFn: async () => {
      const rowsAcc: Row[] = [];
      const BATCH = 1000;
      let from = 0;
      while (true) {
        let query = supabase
          .from(table)
          .select(mode === "archive-class" ? `id, subject, chapter, ${courseIdsField}` : `id, subject, chapter, readymade_sub_chapter, ${courseIdsField}`)
          .range(from, from + BATCH - 1);
        if (mode === "archive-class") query = query.eq("is_archive", true);
        else query = query.eq("is_readymade", true);
        const { data, error } = await query;
        if (error) throw error;
        rowsAcc.push(...((data || []) as any));
        if (!data || data.length < BATCH) break;
        from += BATCH;
      }
      return rowsAcc;
    },
  });

  // Build Subject -> Chapter -> SubChapter tree with row-id lists per leaf,
  // and figure out which leaves are currently fully accessible to this course.
  const tree = useMemo(() => {
    if (!rows) return null;
    const subjects: Record<string, Record<string, Record<string, string[]>>> = {};
    rows.forEach((row) => {
      const subs = Array.isArray(row.subject) ? row.subject : (typeof row.subject === "string" && row.subject ? [row.subject] : []);
      const chapter = row.chapter || "সাধারণ";
      const subChapter = mode === "archive-class" ? "সাধারণ" : (row.readymade_sub_chapter || "সাধারণ");
      subs.forEach((subject) => {
        if (!subjects[subject]) subjects[subject] = {};
        if (!subjects[subject][chapter]) subjects[subject][chapter] = {};
        if (!subjects[subject][chapter][subChapter]) subjects[subject][chapter][subChapter] = [];
        subjects[subject][chapter][subChapter].push(row.id);
      });
    });
    return subjects;
  }, [rows, mode]);

  // Currently-granted leaf keys: read directly from course_readymade_access,
  // the single source of truth for grants. This guarantees the checkbox state
  // always matches exactly what was saved, with no separate per-exam field to
  // drift out of sync.
  const { data: grantedKeys } = useQuery({
    queryKey: ["course-readymade-access-grants", courseId, mode],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_readymade_access")
        .select("subject, chapter, sub_chapter")
        .eq("course_id", courseId)
        .eq("mode", mode);
      if (error) throw error;
      return new Set((data || []).map((g: any) => `${g.subject}|||${g.chapter}|||${g.sub_chapter}`));
    },
  });

  const currentSelection = useMemo(() => {
    return grantedKeys ?? new Set<string>();
  }, [grantedKeys]);

  const selection = pendingSelection ?? currentSelection;
  const setSelection = (updater: (prev: Set<string>) => Set<string>) => {
    setPendingSelection((prev) => updater(prev ?? currentSelection));
  };

  const toggleLeaf = (key: string) => {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  const toggleChapter = (subject: string, chapter: string, leafKeys: string[]) => {
    setSelection((prev) => {
      const next = new Set(prev);
      const allSelected = leafKeys.every((k) => next.has(k));
      leafKeys.forEach((k) => { if (allSelected) next.delete(k); else next.add(k); });
      return next;
    });
  };

  const [pendingFullAccess, setPendingFullAccess] = useState<boolean | null>(null);
  const fullAccessSelected = pendingFullAccess ?? courseFullAccess ?? false;

  const toggleAll = () => {
    if (!tree) return;
    const allKeys: string[] = [];
    Object.entries(tree).forEach(([subject, chapters]) => {
      Object.entries(chapters).forEach(([chapter, subChapters]) => {
        Object.keys(subChapters).forEach((subChapter) => allKeys.push(`${subject}|||${chapter}|||${subChapter}`));
      });
    });
    const currentlyAllSelected = allKeys.every((k) => selection.has(k)) && fullAccessSelected;
    setSelection(() => (currentlyAllSelected ? new Set() : new Set(allKeys)));
    setPendingFullAccess(!currentlyAllSelected);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const finalSelection = selection;

      if (pendingFullAccess !== null) {
        const { error: courseErr } = await supabase.from("courses").update({ [fullAccessField]: pendingFullAccess }).eq("id", courseId);
        if (courseErr) throw courseErr;
      }

      // course_readymade_access is the single source of truth for grants.
      // Diffing against currentSelection (itself read fresh from this table)
      // keeps this atomic and avoids any separate per-exam field going stale.
      const toInsert: { subject: string; chapter: string; sub_chapter: string }[] = [];
      finalSelection.forEach((key) => {
        if (!currentSelection.has(key)) {
          const [subject, chapter, subChapter] = key.split("|||");
          toInsert.push({ subject, chapter, sub_chapter: subChapter });
        }
      });
      const toDeleteKeys: string[] = [];
      currentSelection.forEach((key) => { if (!finalSelection.has(key)) toDeleteKeys.push(key); });

      if (toInsert.length) {
        const { error: insErr } = await supabase.from("course_readymade_access").insert(
          toInsert.map((r) => ({ course_id: courseId, mode, ...r }))
        );
        if (insErr) throw insErr;
      }
      if (toDeleteKeys.length) {
        for (const key of toDeleteKeys) {
          const [subject, chapter, subChapter] = key.split("|||");
          const { error: delErr } = await supabase
            .from("course_readymade_access")
            .delete()
            .eq("course_id", courseId)
            .eq("mode", mode)
            .eq("subject", subject)
            .eq("chapter", chapter)
            .eq("sub_chapter", subChapter);
          if (delErr) throw delErr;
        }
      }
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["course-readymade-access-grants", courseId, mode] }),
        queryClient.invalidateQueries({ queryKey: ["course-full-access", courseId, mode] }),
      ]);
      setPendingSelection(null);
      setPendingFullAccess(null);
      toast({ title: "Access updated" });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update access", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading || loadingFullAccess || !tree) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading {mode === "archive-class" ? "archive class" : "readymade exam"} structure...</div>;
  }

  const subjectEntries = Object.entries(tree);
  const allLeafCount = subjectEntries.reduce((sum, [, chapters]) => sum + Object.values(chapters).reduce((s, sc) => s + Object.keys(sc).length, 0), 0);
  const allSelected = allLeafCount > 0 && subjectEntries.every(([subject, chapters]) =>
    Object.entries(chapters).every(([chapter, subChapters]) =>
      Object.keys(subChapters).every((subChapter) => selection.has(`${subject}|||${chapter}|||${subChapter}`))
    )
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Checkbox checked={allSelected && fullAccessSelected} onCheckedChange={toggleAll} id={`access-all-${mode}`} />
          <label htmlFor={`access-all-${mode}`} className="text-sm font-semibold cursor-pointer">{mode === "archive-class" ? "All Archive Classes" : "All Readymade Exams"}</label>
          {fullAccessSelected && (
            <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full">Auto-includes future {mode === "archive-class" ? "classes" : "exams"}</span>
          )}
        </div>
        <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || (!pendingSelection && pendingFullAccess === null)}>
          {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
          Save Access
        </Button>
      </div>

      <div className="space-y-2">
        {subjectEntries.map(([subject, chapters]) => {
          const subjectExpanded = expandedSubjects.has(subject);
          const chapterEntries = Object.entries(chapters);
          const subjectLeafKeys = chapterEntries.flatMap(([chapter, subChapters]) => Object.keys(subChapters).map((sc) => `${subject}|||${chapter}|||${sc}`));
          const subjectAllSelected = subjectLeafKeys.length > 0 && subjectLeafKeys.every((k) => selection.has(k));
          const subjectSomeSelected = !subjectAllSelected && subjectLeafKeys.some((k) => selection.has(k));

          return (
            <Card key={subject} className="border">
              <CardContent className="p-0">
                <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-muted/40" onClick={() => setExpandedSubjects((prev) => { const n = new Set(prev); n.has(subject) ? n.delete(subject) : n.add(subject); return n; })}>
                  {subjectExpanded ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                  <Checkbox
                    checked={subjectAllSelected ? true : (subjectSomeSelected ? "indeterminate" : false)}
                    onCheckedChange={() => toggleChapter(subject, "__all__", subjectLeafKeys)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span className="font-semibold text-sm whitespace-pre-line">{subject}</span>
                </div>

                {subjectExpanded && (
                  <div className="border-t divide-y">
                    {chapterEntries.map(([chapter, subChapters]) => {
                      const chapterKey = `${subject}__${chapter}`;
                      const chapterExpanded = expandedChapters.has(chapterKey);
                      const leafKeys = Object.keys(subChapters).map((sc) => `${subject}|||${chapter}|||${sc}`);
                      const chapterAllSelected = leafKeys.every((k) => selection.has(k));
                      const chapterSomeSelected = !chapterAllSelected && leafKeys.some((k) => selection.has(k));
                      const isSingleGeneralLeaf = Object.keys(subChapters).length === 1 && Object.keys(subChapters)[0] === "সাধারণ";

                      return (
                        <div key={chapter}>
                          <div className="flex items-center gap-2 px-3 py-2 pl-8 cursor-pointer hover:bg-muted/30" onClick={() => { if (isSingleGeneralLeaf) toggleLeaf(leafKeys[0]); else setExpandedChapters((prev) => { const n = new Set(prev); n.has(chapterKey) ? n.delete(chapterKey) : n.add(chapterKey); return n; }); }}>
                            {!isSingleGeneralLeaf && (chapterExpanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />)}
                            <Checkbox
                              checked={chapterAllSelected ? true : (chapterSomeSelected ? "indeterminate" : false)}
                              onCheckedChange={() => toggleChapter(subject, chapter, leafKeys)}
                              onClick={(e) => e.stopPropagation()}
                            />
                            <span className="text-sm">{chapter}</span>
                            {isSingleGeneralLeaf && <span className="text-xs text-muted-foreground ml-auto">{subChapters["সাধারণ"].length} item{subChapters["সাধারণ"].length !== 1 ? "s" : ""}</span>}
                          </div>

                          {!isSingleGeneralLeaf && chapterExpanded && (
                            <div className="pl-14 pb-1">
                              {Object.entries(subChapters).map(([subChapter, ids]) => {
                                const key = `${subject}|||${chapter}|||${subChapter}`;
                                return (
                                  <div key={subChapter} className="flex items-center gap-2 py-1.5">
                                    <Checkbox checked={selection.has(key)} onCheckedChange={() => toggleLeaf(key)} id={key} />
                                    <label htmlFor={key} className="text-sm cursor-pointer flex-1">{subChapter}</label>
                                    <span className="text-xs text-muted-foreground">{ids.length} item{ids.length !== 1 ? "s" : ""}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

