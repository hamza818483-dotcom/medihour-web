/**
 * StudyTrackerRevision — Revision Planner preview for admin.
 * Ported from AtlasApp's admin-study-tracker.js (stAdminLoadRevision).
 * Shows subject/chapter/topic counts sourced from the same st_subjects
 * tree used by the Syllabus Tracker; revision itself rides on user
 * syllabus progress, so this is a content-count preview, not a separate
 * content editor (matches AtlasApp's current scope).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type RevMode = "hsc" | "medical";

export function StudyTrackerRevision() {
  const [revMode, setRevMode] = useState<RevMode>("hsc");

  const { data: cards, isLoading } = useQuery({
    queryKey: ["admin-st-revision-preview", revMode],
    queryFn: async () => {
      const { data: subjects, error } = await (supabase.from as any)("st_subjects")
        .select("id, name")
        .eq("mode", revMode)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      if (!subjects || !subjects.length) return [];

      return Promise.all(
        subjects.map(async (s: any) => {
          const { data: chapters } = await (supabase.from as any)("st_chapters")
            .select("id")
            .eq("subject_id", s.id);
          let topicCount = 0;
          for (const ch of chapters || []) {
            const { count } = await (supabase.from as any)("st_topics")
              .select("id", { count: "exact", head: true })
              .eq("chapter_id", ch.id);
            topicCount += count || 0;
          }
          return { id: s.id, name: s.name, chapterCount: (chapters || []).length, topicCount };
        })
      );
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5 text-purple-500" />
          <CardTitle className="text-base">Revision Planner</CardTitle>
        </div>
        <div className="flex gap-2 pt-2">
          <Button size="sm" variant={revMode === "hsc" ? "default" : "outline"} onClick={() => setRevMode("hsc")}>
            HSC
          </Button>
          <Button size="sm" variant={revMode === "medical" ? "default" : "outline"} onClick={() => setRevMode("medical")}>
            Medical
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center text-sm text-muted-foreground py-8">লোড হচ্ছে...</div>
        ) : !cards || cards.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8">
            কোনো বিষয় নেই। Syllabus Tracker এ বিষয় যোগ করুন।
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              {cards.map((c: any) => (
                <div key={c.id} className="border-t-2 border-purple-500 bg-card border rounded-lg p-3">
                  <div className="text-xs font-bold mb-1.5">{c.name}</div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-muted rounded-full">
                      <div className="h-full w-0 bg-gradient-to-r from-purple-500 to-rose-500 rounded-full" />
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {c.chapterCount} অধ্যায় · {c.topicCount} টপিক
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 p-3 bg-card border rounded-lg text-center text-xs text-muted-foreground">
              Revision Tracker, User এর Syllabus Progress এর উপর ভিত্তি করে কাজ করে।
              <br />
              আলাদা content ম্যানেজমেন্ট শীঘ্রই আসছে।
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
