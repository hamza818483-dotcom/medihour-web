import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/contexts/AuthContext";
import MathText from "@/components/MathText";
import { Check, Bookmark as BookmarkIcon, Loader2, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

import { getExamCategory } from "@/lib/examCategory";

type CategoryFilter = "all" | "live" | "practice" | "readymade";

const Bookmarks = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [readymadeSubCat, setReadymadeSubCat] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Bookmarks – Atlas";
  }, []);

  const { data: bookmarks, isLoading } = useQuery({
    queryKey: ["user-bookmarks", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("bookmarks")
        .select(`
            id,
            created_at,
            question:exam_questions (
                *,
                exam:exams(title, exam_type, is_readymade, readymade_category, time_window_end)
            )
        `)
        .eq("profile_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const getCategory = (b: any): Exclude<CategoryFilter, "all"> => getExamCategory(b.question?.exam);

  const categoryCounts = useMemo(() => {
    const counts = { all: bookmarks?.length || 0, live: 0, practice: 0, readymade: 0 };
    (bookmarks || []).forEach((b: any) => {
      counts[getCategory(b)]++;
    });
    return counts;
  }, [bookmarks]);

  const readymadeSubCats = useMemo(() => {
    const set = new Set<string>();
    (bookmarks || []).forEach((b: any) => {
      if (getCategory(b) === "readymade") {
        const cat = b.question?.exam?.readymade_category;
        if (cat) set.add(cat);
      }
    });
    return Array.from(set);
  }, [bookmarks]);

  const filteredBookmarks = useMemo(() => {
    let list = filter === "all" ? (bookmarks || []) : (bookmarks || []).filter((b: any) => getCategory(b) === filter);
    if (filter === "readymade" && readymadeSubCat) {
      list = list.filter((b: any) => b.question?.exam?.readymade_category === readymadeSubCat);
    }
    return list;
  }, [bookmarks, filter, readymadeSubCat]);

  const removeBookmarkMutation = useMutation({
      mutationFn: async (bookmarkId: string) => {
          const { error } = await supabase.from("bookmarks").delete().eq("id", bookmarkId);
          if (error) throw error;
      },
      onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: ["user-bookmarks"] });
          toast({ title: "Bookmark removed" });
      }
  });

  if (isLoading) {
      return <div className="p-12 flex justify-center"><Loader2 className="animate-spin h-8 w-8 text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Bookmarked Questions</h1>
        <p className="text-sm text-muted-foreground">
          Review your saved questions and explanations.
        </p>
      </header>

      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {([
          { key: "all", label: "All" },
          { key: "live", label: "Live" },
          { key: "practice", label: "Practice" },
          { key: "readymade", label: "Readymade" },
        ] as const).map((f) => (
          <button
            key={f.key}
            onClick={() => { setFilter(f.key); setReadymadeSubCat(null); }}
            className={cn(
              "px-3.5 py-1.5 rounded-full text-xs font-semibold border shrink-0 transition-colors",
              filter === f.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:bg-muted"
            )}
          >
            {f.label} ({categoryCounts[f.key]})
          </button>
        ))}
      </div>

      {filter === "readymade" && readymadeSubCats.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setReadymadeSubCat(null)}
            className={cn(
              "px-3 py-1 rounded-full text-[11px] font-semibold border shrink-0 transition-colors",
              !readymadeSubCat
                ? "bg-primary/15 text-primary border-primary/40"
                : "bg-background text-muted-foreground border-border hover:bg-muted"
            )}
          >
            সব
          </button>
          {readymadeSubCats.map((cat) => (
            <button
              key={cat}
              onClick={() => setReadymadeSubCat(cat)}
              className={cn(
                "px-3 py-1 rounded-full text-[11px] font-semibold border shrink-0 transition-colors",
                readymadeSubCat === cat
                  ? "bg-primary/15 text-primary border-primary/40"
                  : "bg-background text-muted-foreground border-border hover:bg-muted"
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {filteredBookmarks && filteredBookmarks.length > 0 ? (
        <div className="space-y-6">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {filteredBookmarks.map((b: any) => {
                const q = b.question;
                if (!q) return null; // Should not happen

                return (
                    <Card key={b.id} className="rounded-[30px] overflow-hidden shadow-sm border group">
                        <CardContent className="p-5 space-y-2 relative">
                             <div className="flex justify-between items-start mb-2">
                                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                    {q.exam?.title || "Unknown Exam"}
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeBookmarkMutation.mutate(b.id)}
                                    className="h-8 w-8 text-primary hover:text-destructive hover:bg-destructive/10"
                                >
                                    <BookmarkIcon className="h-5 w-5 fill-current" />
                                </Button>
                             </div>

                             {/* Question Header */}
                             <div className="flex items-start gap-4 pr-2">
                                <div className="flex-1 min-w-0 pt-1 overflow-x-auto no-scrollbar scroll-smooth">
                                    <div className="text-lg font-medium leading-relaxed whitespace-pre-line min-w-0">
                                        <MathText text={q.question_text} className="prose dark:prose-invert max-w-none whitespace-pre-line min-w-0" />
                                    </div>
                                </div>
                             </div>

                             {/* Options */}
                             <div className="space-y-2 pt-2">
                                {(["A", "B", "C", "D"] as const).map((optionKey) => {
                                    const optionText = q[`option_${optionKey.toLowerCase()}` as keyof typeof q];
                                    const isCorrectOption = q.correct_option === optionKey;

                                    return (
                                        <div key={optionKey} className="flex items-start gap-4">
                                            <div className={cn(
                                                "flex-shrink-0 h-8 w-8 rounded-full border-2 flex items-center justify-center transition-all mt-0.5",
                                                isCorrectOption ? "bg-green-500 border-green-500 text-white" : "border-muted-foreground/30 text-muted-foreground"
                                            )}>
                                                {isCorrectOption ? <Check className="h-4 w-4" /> : <span className="text-sm font-bold">{optionKey}</span>}
                                            </div>
                                            <div className={cn(
                                                "flex-1 text-base whitespace-pre-line min-w-0 pt-1 overflow-x-auto no-scrollbar scroll-smooth",
                                                isCorrectOption ? "text-green-700 dark:text-green-400 font-medium" : "text-foreground"
                                            )}>
                                                 <MathText text={optionText} className="prose dark:prose-invert max-w-none whitespace-pre-line min-w-0" />
                                            </div>
                                        </div>
                                    )
                                })}
                             </div>

                             {/* Explanation */}
                             {q.explanation && (
                                 <div className="mt-4 pt-4 border-t border-dashed">
                                     <h4 className="text-sm font-bold text-muted-foreground mb-1">Explanation:</h4>
                                     <div className="text-sm text-foreground/80 whitespace-pre-line overflow-x-auto no-scrollbar scroll-smooth">
                                         <MathText text={q.explanation} className="prose dark:prose-invert max-w-none whitespace-pre-line min-w-0" />
                                     </div>
                                 </div>
                             )}

                        </CardContent>
                    </Card>
                );
            })}
        </div>
      ) : (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground bg-muted/10 rounded-lg border border-dashed">
              <Inbox className="h-12 w-12 mb-4 opacity-20" />
              <p>No bookmarks found.</p>
              <p className="text-sm mt-1">Bookmark difficult questions during exam review to see them here.</p>
          </div>
      )}
    </div>
  );
};

export default Bookmarks;
