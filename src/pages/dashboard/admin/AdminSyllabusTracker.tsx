import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronUp, Trash2, Plus, BarChart3, Pencil, Check, X, Layers, BookOpen, Trophy, RefreshCw, Calendar, ArrowLeft, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { StudyTrackerProgress } from "@/components/admin/StudyTrackerProgress";
import { StudyTrackerRevision } from "@/components/admin/StudyTrackerRevision";

type Mode = "hsc" | "medical";
type StBox = "dashboard" | "syllabus" | "routine" | "progress" | "revision";

const AdminSyllabusTracker = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<Mode>("hsc");
  const [stBox, setStBox] = useState<StBox>("dashboard");
  const [subjectName, setSubjectName] = useState("");
  const [chapterSubjectId, setChapterSubjectId] = useState<number | "">("");
  const [chapterName, setChapterName] = useState("");
  const [topicSubjectId, setTopicSubjectId] = useState<number | "">("");
  const [topicChapterId, setTopicChapterId] = useState<number | "">("");
  const [topicNames, setTopicNames] = useState(""); // one per line, bulk add
  const [saving, setSaving] = useState(false);
  const [expandedSubject, setExpandedSubject] = useState<number | null>(null);
  const [expandedChapter, setExpandedChapter] = useState<number | null>(null);
  const [editSubjectId, setEditSubjectId] = useState<number | null>(null);
  const [editSubjectName, setEditSubjectName] = useState("");
  const [editChapterId, setEditChapterId] = useState<number | null>(null);
  const [editChapterName, setEditChapterName] = useState("");
  const [editTopicId, setEditTopicId] = useState<number | null>(null);
  const [editTopicName, setEditTopicName] = useState("");

  useEffect(() => {
    document.title = "Study Tracker — Admin";
  }, []);

  const { data: dashCounts } = useQuery({
    queryKey: ["admin-st-dash-counts"],
    queryFn: async () => {
      const { count: hscCount } = await (supabase.from as any)("st_subjects")
        .select("id", { count: "exact", head: true })
        .eq("mode", "hsc");
      const { count: medCount } = await (supabase.from as any)("st_subjects")
        .select("id", { count: "exact", head: true })
        .eq("mode", "medical");
      return { hsc: hscCount || 0, medical: medCount || 0 };
    },
  });

  const { data: subjects, isLoading } = useQuery({
    queryKey: ["admin-st-subjects", mode],
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("st_subjects")
        .select("id, name, short_name, sort_order")
        .eq("mode", mode)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: chaptersOfSubject } = useQuery({
    queryKey: ["admin-st-chapters", expandedSubject],
    enabled: expandedSubject !== null,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("st_chapters")
        .select("id, name, subject_id")
        .eq("subject_id", expandedSubject!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      const withCounts = await Promise.all(
        (data || []).map(async (ch: any) => {
          const { count } = await (supabase.from as any)("st_topics")
            .select("id", { count: "exact", head: true })
            .eq("chapter_id", ch.id);
          return { ...ch, topicCount: count || 0 };
        })
      );
      return withCounts;
    },
  });

  const { data: topicsOfChapter } = useQuery({
    queryKey: ["admin-st-topics", expandedChapter],
    enabled: expandedChapter !== null,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("st_topics")
        .select("id, name, weight")
        .eq("chapter_id", expandedChapter!)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });

  const refreshSubjects = () => queryClient.invalidateQueries({ queryKey: ["admin-st-subjects", mode] });
  const refreshChapters = () => queryClient.invalidateQueries({ queryKey: ["admin-st-chapters", expandedSubject] });
  const refreshTopics = () => queryClient.invalidateQueries({ queryKey: ["admin-st-topics", expandedChapter] });

  const addSubject = async () => {
    if (!subjectName.trim()) {
      toast({ title: "বিষয়ের নাম দিন", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const nextOrder = (subjects && subjects.length > 0) ? Math.max(...subjects.map((s: any) => s.sort_order)) + 1 : 0;
      const { error } = await (supabase.from as any)("st_subjects").insert({
        mode,
        name: subjectName.trim(),
        short_name: subjectName.trim().slice(0, 12),
        sort_order: nextOrder,
      });
      if (error) throw error;
      setSubjectName("");
      toast({ title: "বিষয় যোগ হয়েছে" });
      refreshSubjects();
    } catch (e: any) {
      toast({ title: "ব্যর্থ হয়েছে", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addChapter = async () => {
    if (!chapterSubjectId || !chapterName.trim()) {
      toast({ title: "বিষয় বেছে নিয়ে অধ্যায়ের নাম দিন", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: existing } = await (supabase.from as any)("st_chapters")
        .select("sort_order")
        .eq("subject_id", chapterSubjectId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const nextOrder = (existing?.sort_order ?? -1) + 1;
      const { error } = await (supabase.from as any)("st_chapters").insert({
        subject_id: chapterSubjectId,
        name: chapterName.trim(),
        sort_order: nextOrder,
      });
      if (error) throw error;
      setChapterName("");
      toast({ title: "অধ্যায় যোগ হয়েছে" });
      if (expandedSubject === chapterSubjectId) refreshChapters();
      queryClient.invalidateQueries({ queryKey: ["admin-st-topic-chapter-options", chapterSubjectId] });
    } catch (e: any) {
      toast({ title: "ব্যর্থ হয়েছে", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addTopics = async () => {
    const names = topicNames.split("\n").map((s) => s.trim()).filter(Boolean);
    if (!topicChapterId || names.length === 0) {
      toast({ title: "অধ্যায় বেছে নিয়ে অন্তত একটি টপিক দিন", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: existing } = await (supabase.from as any)("st_topics")
        .select("sort_order")
        .eq("chapter_id", topicChapterId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      let nextOrder = (existing?.sort_order ?? -1) + 1;
      const rows = names.map((n) => ({ chapter_id: topicChapterId, name: n, weight: 1, sort_order: nextOrder++ }));
      const { error } = await (supabase.from as any)("st_topics").insert(rows);
      if (error) throw error;
      setTopicNames("");
      toast({ title: `${names.length}টি টপিক যোগ হয়েছে` });
      if (expandedChapter === topicChapterId) refreshTopics();
      refreshSubjects();
    } catch (e: any) {
      toast({ title: "ব্যর্থ হয়েছে", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const updateSubject = async (id: number) => {
    if (!editSubjectName.trim()) return;
    const { error } = await (supabase.from as any)("st_subjects").update({ name: editSubjectName.trim(), short_name: editSubjectName.trim().slice(0, 12) }).eq("id", id);
    if (error) {
      toast({ title: "ব্যর্থ হয়েছে", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "আপডেট হয়েছে" });
    setEditSubjectId(null);
    refreshSubjects();
  };

  const updateChapter = async (id: number) => {
    if (!editChapterName.trim()) return;
    const { error } = await (supabase.from as any)("st_chapters").update({ name: editChapterName.trim() }).eq("id", id);
    if (error) {
      toast({ title: "ব্যর্থ হয়েছে", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "আপডেট হয়েছে" });
    setEditChapterId(null);
    refreshChapters();
  };

  const updateTopic = async (id: number) => {
    if (!editTopicName.trim()) return;
    const { error } = await (supabase.from as any)("st_topics").update({ name: editTopicName.trim() }).eq("id", id);
    if (error) {
      toast({ title: "ব্যর্থ হয়েছে", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "আপডেট হয়েছে" });
    setEditTopicId(null);
    refreshTopics();
  };

  const updateWeight = async (id: number, weight: number) => {
    const { error } = await (supabase.from as any)("st_topics").update({ weight }).eq("id", id);
    if (error) {
      toast({ title: "ব্যর্থ হয়েছে", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Weight আপডেট হয়েছে" });
    refreshTopics();
  };

  const applyTopicsToAllChapters = async (sourceChapId: number, subjId: number) => {
    if (!confirm("এই অধ্যায়ের সব টপিক কি একই বিষয়ের বাকি সব অধ্যায়ে যোগ করতে চান?")) return;
    setSaving(true);
    try {
      const { data: sourceTopics } = await (supabase.from as any)("st_topics")
        .select("name, weight")
        .eq("chapter_id", sourceChapId);
      if (!sourceTopics || sourceTopics.length === 0) {
        toast({ title: "এই অধ্যায়ে কোনো টপিক নেই", variant: "destructive" });
        return;
      }

      const { data: allChapters } = await (supabase.from as any)("st_chapters")
        .select("id")
        .eq("subject_id", subjId);
      const targetChapters = (allChapters || []).filter((c: any) => c.id !== sourceChapId);
      if (targetChapters.length === 0) {
        toast({ title: "এই বিষয়ে আর কোনো অধ্যায় নেই", variant: "destructive" });
        return;
      }

      let addedCount = 0;
      for (const ch of targetChapters) {
        const { data: existingTopics } = await (supabase.from as any)("st_topics")
          .select("name")
          .eq("chapter_id", ch.id);
        const existingNames = new Set((existingTopics || []).map((t: any) => t.name.trim().toLowerCase()));
        const { data: existingSort } = await (supabase.from as any)("st_topics")
          .select("sort_order")
          .eq("chapter_id", ch.id)
          .order("sort_order", { ascending: false })
          .limit(1)
          .maybeSingle();
        let nextSort = (existingSort?.sort_order ?? -1) + 1;

        const rowsToInsert = sourceTopics
          .filter((t: any) => !existingNames.has(t.name.trim().toLowerCase()))
          .map((t: any) => ({ name: t.name, chapter_id: ch.id, weight: t.weight || 1, sort_order: nextSort++ }));

        if (rowsToInsert.length > 0) {
          const { error } = await (supabase.from as any)("st_topics").insert(rowsToInsert);
          if (error) throw error;
          addedCount += rowsToInsert.length;
        }
      }

      toast({ title: `${targetChapters.length}টি অধ্যায়ে ${addedCount}টি টপিক যোগ হয়েছে` });
      refreshSubjects();
    } catch (e: any) {
      toast({ title: "ব্যর্থ হয়েছে", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const deleteSubject = async (id: number) => {
    if (!confirm("এই বিষয়, সব অধ্যায় ও টপিক ডিলিট হবে। নিশ্চিত?")) return;
    const { error } = await (supabase.from as any)("st_subjects").delete().eq("id", id);
    if (error) {
      toast({ title: "ব্যর্থ হয়েছে", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "বিষয় ডিলিট হয়েছে" });
    refreshSubjects();
  };

  const deleteChapter = async (id: number) => {
    if (!confirm("এই অধ্যায় ও সব টপিক ডিলিট হবে। নিশ্চিত?")) return;
    const { error } = await (supabase.from as any)("st_chapters").delete().eq("id", id);
    if (error) {
      toast({ title: "ব্যর্থ হয়েছে", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "অধ্যায় ডিলিট হয়েছে" });
    refreshChapters();
  };

  const deleteTopic = async (id: number) => {
    const { error } = await (supabase.from as any)("st_topics").delete().eq("id", id);
    if (error) {
      toast({ title: "ব্যর্থ হয়েছে", variant: "destructive" });
      return;
    }
    refreshTopics();
  };

  const moveTopic = async (list: any[], index: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;
    const reordered = [...list];
    const tmp = reordered[index];
    reordered[index] = reordered[targetIndex];
    reordered[targetIndex] = tmp;
    setSaving(true);
    try {
      for (let i = 0; i < reordered.length; i++) {
        if (reordered[i].sort_order !== i) {
          const { error } = await (supabase.from as any)("st_topics").update({ sort_order: i }).eq("id", reordered[i].id);
          if (error) throw error;
        }
      }
      refreshTopics();
    } catch (e: any) {
      toast({ title: "ব্যর্থ হয়েছে", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-sky-600" /> Study Tracker ম্যানেজার
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Syllabus, Progress এবং Revision কন্টেন্ট এখান থেকে ম্যানেজ করুন।
        </p>
      </div>

      {stBox === "dashboard" && (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setStBox("syllabus")}
            className="text-left bg-card border rounded-xl p-4 cursor-pointer border-t-[3px]"
            style={{ borderTopColor: "#7C83FF" }}
          >
            <BookOpen className="h-5 w-5 mb-1.5" />
            <div className="font-bold text-sm mb-1">Syllabus Tracker</div>
            <div className="text-xs text-muted-foreground">HSC ও Medical বিষয়, অধ্যায়, টপিক</div>
            <div className="text-xs mt-2" style={{ color: "#7C83FF" }}>
              {dashCounts ? `HSC: ${dashCounts.hsc} বিষয় · Medical: ${dashCounts.medical} বিষয়` : "লোড হচ্ছে..."}
            </div>
          </button>

          <button
            onClick={() => setStBox("routine")}
            className="text-left bg-card border rounded-xl p-4 cursor-pointer border-t-[3px]"
            style={{ borderTopColor: "#22C55E" }}
          >
            <Calendar className="h-5 w-5 mb-1.5" />
            <div className="font-bold text-sm mb-1">Routine Maker</div>
            <div className="text-xs text-muted-foreground">Daily ও Target রুটিন কন্টেন্ট</div>
            <div className="text-xs mt-2" style={{ color: "#22C55E" }}>শীঘ্রই আসছে</div>
          </button>

          <button
            onClick={() => setStBox("progress")}
            className="text-left bg-card border rounded-xl p-4 cursor-pointer border-t-[3px]"
            style={{ borderTopColor: "#F59E0B" }}
          >
            <Trophy className="h-5 w-5 mb-1.5" />
            <div className="font-bold text-sm mb-1">Weak &amp; Progress</div>
            <div className="text-xs text-muted-foreground">Student activity analytics</div>
            <div className="text-xs mt-2" style={{ color: "#F59E0B" }}>Leaderboard দেখুন</div>
          </button>

          <button
            onClick={() => setStBox("revision")}
            className="text-left bg-card border rounded-xl p-4 cursor-pointer border-t-[3px]"
            style={{ borderTopColor: "#A855F7" }}
          >
            <RefreshCw className="h-5 w-5 mb-1.5" />
            <div className="font-bold text-sm mb-1">Revision Planner</div>
            <div className="text-xs text-muted-foreground">HSC ও Medical রিভিশন কন্টেন্ট</div>
            <div className="text-xs mt-2" style={{ color: "#A855F7" }}>
              {dashCounts ? `HSC: ${dashCounts.hsc} বিষয় · Medical: ${dashCounts.medical} বিষয়` : "লোড হচ্ছে..."}
            </div>
          </button>
        </div>
      )}

      {stBox === "routine" && (
        <div className="space-y-4">
          <Button variant="outline" size="sm" onClick={() => setStBox("dashboard")} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <Card>
            <CardContent className="text-center py-12 text-muted-foreground">
              শীঘ্রই এখানে Routine কন্টেন্ট ম্যানেজ করা যাবে।
            </CardContent>
          </Card>
        </div>
      )}

      {stBox === "progress" && (
        <div className="space-y-4">
          <Button variant="outline" size="sm" onClick={() => setStBox("dashboard")} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <StudyTrackerProgress />
        </div>
      )}

      {stBox === "revision" && (
        <div className="space-y-4">
          <Button variant="outline" size="sm" onClick={() => setStBox("dashboard")} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <StudyTrackerRevision />
        </div>
      )}

      {stBox === "syllabus" && (
        <div className="space-y-6">
          <Button variant="outline" size="sm" onClick={() => setStBox("dashboard")} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>

      {/* Mode tabs */}
      <div className="flex gap-2">
        <Button variant={mode === "hsc" ? "default" : "outline"} onClick={() => { setMode("hsc"); setExpandedSubject(null); setExpandedChapter(null); }}>
          HSC সিলেবাস
        </Button>
        <Button variant={mode === "medical" ? "default" : "outline"} onClick={() => { setMode("medical"); setExpandedSubject(null); setExpandedChapter(null); }}>
          Medical Admission
        </Button>
      </div>

      {/* Add subject */}
      <Card>
        <CardHeader className="px-3 sm:px-4">
          <CardTitle className="text-base">নতুন বিষয় যোগ করুন</CardTitle>
          <CardDescription>মোড: {mode === "hsc" ? "HSC" : "Medical Admission"}</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2 px-3 sm:px-4">
          <Input
            placeholder="বিষয়ের নাম (যেমন: পদার্থবিজ্ঞান)"
            value={subjectName}
            onChange={(e) => setSubjectName(e.target.value)}
          />
          <Button onClick={() => void addSubject()} disabled={saving}>
            <Plus className="h-4 w-4 mr-1" /> যোগ করুন
          </Button>
        </CardContent>
      </Card>

      {/* Subjects/chapters/topics tree */}
      <Card>
        <CardHeader className="px-3 sm:px-4">
          <CardTitle className="text-base">
            বিষয় সমূহ {subjects ? `(${subjects.length}টি)` : ""}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 px-0">
          {isLoading && <p className="text-sm text-muted-foreground">লোড হচ্ছে...</p>}
          {!isLoading && (!subjects || subjects.length === 0) && (
            <p className="text-sm text-muted-foreground">কোনো বিষয় নেই। উপরে যোগ করুন।</p>
          )}
          {subjects?.map((s: any) => {
            const isOpen = expandedSubject === s.id;
            return (
              <div key={s.id} className="border rounded-xl overflow-hidden">
                <div className="w-full flex items-center gap-2 p-3 hover:bg-muted/40">
                  {editSubjectId === s.id ? (
                    <div className="flex-1 flex items-center gap-1.5">
                      <Input
                        className="h-8 text-sm"
                        value={editSubjectName}
                        onChange={(e) => setEditSubjectName(e.target.value)}
                        autoFocus
                      />
                      <Button size="icon" className="h-7 w-7" onClick={() => void updateSubject(s.id)}><Check className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditSubjectId(null)}><X className="h-3.5 w-3.5" /></Button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setExpandedSubject(isOpen ? null : s.id)}
                      className="flex-1 flex items-center gap-2 text-left"
                    >
                      <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
                      <span className="font-semibold text-sm">{s.name}</span>
                    </button>
                  )}
                  {editSubjectId !== s.id && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => { setEditSubjectId(s.id); setEditSubjectName(s.name); }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => deleteSubject(s.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                {isOpen && (
                  <div className="border-t bg-muted/20 p-2 space-y-1.5">
                    <div className="flex gap-2 p-1">
                      <Input
                        className="h-9 text-sm"
                        placeholder="নতুন অধ্যায়ের নাম লিখুন..."
                        value={chapterSubjectId === s.id ? chapterName : ""}
                        onChange={(e) => { setChapterSubjectId(s.id); setChapterName(e.target.value); }}
                      />
                      <Button
                        size="icon"
                        className="h-9 w-9 flex-shrink-0"
                        disabled={saving}
                        onClick={() => { setChapterSubjectId(s.id); void addChapter(); }}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    {chaptersOfSubject?.map((ch: any) => {
                      const chOpen = expandedChapter === ch.id;
                      return (
                        <div key={ch.id} className="border rounded-lg bg-card overflow-hidden">
                          <div className="flex items-center gap-2 p-2.5">
                            {editChapterId === ch.id ? (
                              <div className="flex-1 flex items-center gap-1.5">
                                <Input
                                  className="h-7 text-xs"
                                  value={editChapterName}
                                  onChange={(e) => setEditChapterName(e.target.value)}
                                  autoFocus
                                />
                                <Button size="icon" className="h-6 w-6" onClick={() => void updateChapter(ch.id)}><Check className="h-3 w-3" /></Button>
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setEditChapterId(null)}><X className="h-3 w-3" /></Button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setExpandedChapter(chOpen ? null : ch.id)}
                                className="flex-1 flex items-center gap-2 text-left text-xs"
                              >
                                <ChevronDown
                                  className={cn("h-3.5 w-3.5 transition-transform", chOpen && "rotate-180")}
                                />
                                <span className="font-medium">{ch.name}</span>
                                <span className="text-muted-foreground">({ch.topicCount} টপিক)</span>
                              </button>
                            )}
                            {editChapterId !== ch.id && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={() => { setEditChapterId(ch.id); setEditChapterName(ch.name); }}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => deleteChapter(ch.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                          {chOpen && (
                            <div className="border-t p-2 space-y-1.5 max-h-64 overflow-y-auto">
                              <div className="flex gap-2 p-1">
                                <Input
                                  className="h-8 text-xs flex-1"
                                  placeholder="নতুন টপিকের নাম লিখুন..."
                                  value={topicChapterId === ch.id ? topicNames : ""}
                                  onChange={(e) => { setTopicSubjectId(s.id); setTopicChapterId(ch.id); setTopicNames(e.target.value); }}
                                />
                                <Button
                                  size="icon"
                                  className="h-8 w-8 flex-shrink-0"
                                  disabled={saving}
                                  onClick={() => { setTopicSubjectId(s.id); setTopicChapterId(ch.id); void addTopics(); }}
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                              {(topicsOfChapter?.length ?? 0) > 0 && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="w-full text-[10.5px] h-7 border-primary/40 text-primary font-bold"
                                  disabled={saving}
                                  onClick={() => void applyTopicsToAllChapters(ch.id, s.id)}
                                >
                                  <Layers className="h-3 w-3 mr-1" /> এই {topicsOfChapter?.length}টি টপিক একই বিষয়ের বাকি সব অধ্যায়ে Apply করুন
                                </Button>
                              )}
                              {(() => {
                                const totalW = (topicsOfChapter || []).reduce((s2: number, t: any) => s2 + (t.weight || 1), 0);
                                const list = topicsOfChapter || [];
                                return list.map((t: any, idx: number) => {
                                  const pct = totalW > 0 ? Math.round(((t.weight || 1) / totalW) * 100) : 0;
                                  return (
                                <div
                                  key={t.id}
                                  className="flex items-center gap-2 text-[11px] bg-muted/30 rounded-md p-2"
                                >
                                  <div className="flex flex-col flex-shrink-0 -my-1">
                                    <button
                                      type="button"
                                      disabled={idx === 0 || saving}
                                      onClick={(e) => { e.stopPropagation(); void moveTopic(list, idx, "up"); }}
                                      className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:pointer-events-none"
                                    >
                                      <ChevronUp className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={idx === list.length - 1 || saving}
                                      onClick={(e) => { e.stopPropagation(); void moveTopic(list, idx, "down"); }}
                                      className="h-5 w-5 flex items-center justify-center text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:pointer-events-none"
                                    >
                                      <ChevronDown className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                  {editTopicId === t.id ? (
                                    <div className="flex-1 flex items-center gap-1">
                                      <Input
                                        className="h-6 text-[11px]"
                                        value={editTopicName}
                                        onChange={(e) => setEditTopicName(e.target.value)}
                                        autoFocus
                                      />
                                      <Button size="icon" className="h-5 w-5" onClick={() => void updateTopic(t.id)}><Check className="h-3 w-3" /></Button>
                                      <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setEditTopicId(null)}><X className="h-3 w-3" /></Button>
                                    </div>
                                  ) : (
                                    <span className="flex-1">{t.name}</span>
                                  )}
                                  <span className="text-[9.5px] text-primary font-bold min-w-[26px] text-right">{pct}%</span>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 flex-shrink-0 text-muted-foreground"
                                    title="Copy topic name"
                                    onClick={() => {
                                      navigator.clipboard.writeText(t.name);
                                      toast({ title: "কপি হয়েছে" });
                                    }}
                                  >
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                  <Input
                                    type="number"
                                    min={0.1}
                                    max={20}
                                    step={0.1}
                                    defaultValue={t.weight || 1}
                                    title="Weight"
                                    className="h-6 w-12 text-[10px] text-center px-1"
                                    onBlur={(e) => {
                                      const v = parseFloat(e.target.value) || 1;
                                      if (v !== (t.weight || 1)) void updateWeight(t.id, v);
                                    }}
                                  />
                                  {editTopicId !== t.id && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5 text-muted-foreground flex-shrink-0"
                                      onClick={() => { setEditTopicId(t.id); setEditTopicName(t.name); }}
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 text-destructive flex-shrink-0"
                                    onClick={() => deleteTopic(t.id)}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                                  );
                                });
                              })()}
                              {topicsOfChapter?.length === 0 && (
                                <p className="text-[11px] text-muted-foreground text-center py-2">
                                  কোনো টপিক নেই
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
      )}
    </div>
  );
};

export default AdminSyllabusTracker;
