import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Trophy,
  BarChart3,
  BookOpen,
  CalendarClock,
  TrendingUp,
  RotateCcw,
  Clock3,
  Calculator,
} from "lucide-react";
import PublicHeader from "@/components/PublicHeader";
import GPACalculator from "@/components/study/GPACalculator";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

// NOTE: Supabase not yet connected in Medihour. Data layer below is stubbed
// with empty results / no-op sync so the full UI/UX works standalone.
// When Supabase is wired, replace fetchSubjects/syncProgress/leaderboard
// fetch with real `st_subjects/st_chapters/st_topics` queries and
// `st_sync_progress` / `st_leaderboard` RPC calls (see LMS reference impl).

type Mode = "hsc" | "medical";
type DashPanel = "none" | "syllabus" | "routine" | "progress" | "revision" | "gpa";

interface Topic {
  id: number;
  name: string;
  weight: number;
}
interface Chapter {
  id: number;
  name: string;
  topics: Topic[];
}
interface Subject {
  id: number;
  name: string;
  short_name: string | null;
  chapters: Chapter[];
}

function progressKey(userId?: string | null) {
  return `st_progress_${userId || "guest"}`;
}
function revisionKey(userId?: string | null) {
  return `st_revision_${userId || "guest"}`;
}
function loadMap(key: string): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}
function saveMap(key: string, map: Record<string, boolean>) {
  try {
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}
function topicKey(mode: Mode, subjectId: number, chapterId: number, topicId: number) {
  return `${mode}|${subjectId}|${chapterId}|${topicId}`;
}
function revKey(mode: Mode, subjectId: number, chapterId: number, topicId: number) {
  return `rev|${mode}|${subjectId}|${chapterId}|${topicId}`;
}

const SyllabusTracker = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [panel, setPanel] = useState<DashPanel>("none");
  const [sylView, setSylView] = useState<"dashboard" | "leaderboard">("dashboard");
  const [mode, setMode] = useState<Mode>("medical");
  const [openSubjectId, setOpenSubjectId] = useState<number | null>(null);
  const [openChapterId, setOpenChapterId] = useState<number | null>(null);
  const [lbMode, setLbMode] = useState<Mode>("medical");

  const [revView, setRevView] = useState<"dashboard" | "leaderboard">("dashboard");
  const [revMode, setRevMode] = useState<Mode>("hsc");
  const [revLbMode, setRevLbMode] = useState<Mode>("hsc");

  const [routineTab, setRoutineTab] = useState<"daily" | "target">("daily");

  // Chrome/Android's back-forward cache (bfcache) can restore this page from
  // a frozen snapshot instead of re-mounting it, which would otherwise leave
  // stale view state (e.g. stuck on the leaderboard) when the user navigates
  // back here. Force a reset to the always-Dashboard/Medical default whenever
  // the page is restored from bfcache.
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setSylView("dashboard");
        setMode("medical");
        setLbMode("medical");
        setOpenSubjectId(null);
        setOpenChapterId(null);
        setPanel("none");
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  const [progress, setProgress] = useState<Record<string, boolean>>({});
  const [revision, setRevision] = useState<Record<string, boolean>>({});

  useEffect(() => {
    document.title = "Study Tracker — Medihour";
    setProgress(loadMap(progressKey(user?.id)));
    setRevision(loadMap(revisionKey(user?.id)));
  }, [user?.id]);

  async function fetchSubjects(m: Mode): Promise<Subject[]> {
    // Stub: Supabase not connected yet in Medihour. Returns empty until wired.
    void m;
    return [];
  }

  const { data: subjectsHsc, isLoading: loadingHsc } = useQuery({
    queryKey: ["public-st-subjects", "hsc"],
    queryFn: () => fetchSubjects("hsc"),
  });
  const { data: subjectsMedical, isLoading: loadingMedical } = useQuery({
    queryKey: ["public-st-subjects", "medical"],
    queryFn: () => fetchSubjects("medical"),
  });

  const subjectsByMode: Record<Mode, Subject[] | undefined> = { hsc: subjectsHsc, medical: subjectsMedical };
  const subjects = subjectsByMode[mode];
  const isLoading = mode === "hsc" ? loadingHsc : loadingMedical;

  const { data: leaderboard } = useQuery({
    queryKey: ["st-leaderboard", lbMode],
    enabled: panel === "syllabus" && sylView === "leaderboard",
    queryFn: async () => {
      // Stub: Supabase not connected yet. Returns empty leaderboard.
      void lbMode;
      return [] as any[];
    },
  });

  const { data: revLeaderboard } = useQuery({
    queryKey: ["st-leaderboard", revLbMode],
    enabled: panel === "revision" && revView === "leaderboard",
    queryFn: async () => {
      // Stub: Supabase not connected yet. Returns empty leaderboard.
      void revLbMode;
      return [] as any[];
    },
  });

  const subjPct = (m: Mode, s: Subject): [number, number, number] => {
    let totalW = 0, doneW = 0, t = 0, d = 0;
    for (const c of s.chapters) for (const tp of c.topics) {
      const w = tp.weight || 1;
      t++; totalW += w;
      if (progress[topicKey(m, s.id, c.id, tp.id)]) { d++; doneW += w; }
    }
    return [totalW ? Math.round((doneW / totalW) * 100) : 0, t, d];
  };
  const chapPct = (s: Subject, c: Chapter) => {
    let totalW = 0, doneW = 0;
    for (const tp of c.topics) {
      const w = tp.weight || 1;
      totalW += w;
      if (progress[topicKey(mode, s.id, c.id, tp.id)]) doneW += w;
    }
    return totalW ? Math.round((doneW / totalW) * 1000) / 10 : 0;
  };
  const overallPct = (m: Mode) => {
    const subs = subjectsByMode[m];
    if (!subs) return 0;
    let totalW = 0, doneW = 0;
    for (const s of subs) for (const c of s.chapters) for (const tp of c.topics) {
      const w = tp.weight || 1;
      totalW += w;
      if (progress[topicKey(m, s.id, c.id, tp.id)]) doneW += w;
    }
    return totalW ? Math.round((doneW / totalW) * 100) : 0;
  };
  const revOverallPct = (m: Mode) => {
    const subs = subjectsByMode[m];
    if (!subs) return { pct: 0, t: 0, d: 0 };
    let t = 0, d = 0;
    for (const s of subs) for (const c of s.chapters) for (const tp of c.topics) {
      t++;
      if (revision[revKey(m, s.id, c.id, tp.id)]) d++;
    }
    return { pct: t ? Math.round((d / t) * 100) : 0, t, d };
  };

  const overall = useMemo(() => {
    if (!subjects) return { pct: 0, totalChaps: 0, t: 0, d: 0 };
    let totalChaps = 0, t = 0, d = 0;
    for (const s of subjects) {
      totalChaps += s.chapters.length;
      const [, st, sd] = subjPct(mode, s);
      t += st; d += sd;
    }
    return { pct: t ? Math.round((d / t) * 100) : 0, totalChaps, t, d };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjects, progress, mode]);

  const dashSylPct = Math.round((overallPct("hsc") + overallPct("medical")) / 2);
  const dashRevPct = useMemo(() => {
    let t = 0, d = 0;
    for (const m of ["hsc", "medical"] as Mode[]) {
      const subs = subjectsByMode[m];
      if (!subs) continue;
      for (const s of subs) for (const c of s.chapters) for (const tp of c.topics) {
        t++;
        if (revision[revKey(m, s.id, c.id, tp.id)]) d++;
      }
    }
    return t ? Math.round((d / t) * 100) : 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectsHsc, subjectsMedical, revision]);

  const syncProgress = async (m: Mode, nextProgress: Record<string, boolean>) => {
    // Stub: Supabase not connected yet. Progress persists locally only for now.
    void m;
    void nextProgress;
  };

  const toggleTopic = (s: Subject, c: Chapter, tp: Topic) => {
    const key = topicKey(mode, s.id, c.id, tp.id);
    const next = { ...progress, [key]: !progress[key] };
    setProgress(next);
    saveMap(progressKey(user?.id), next);
    void syncProgress(mode, next);
  };

  const openSubject = subjects?.find((s) => s.id === openSubjectId) || null;

  const weakSubjects = useMemo(() => {
    const list: { name: string; pct: number; tone: "red" | "yellow" }[] = [];
    for (const m of ["hsc", "medical"] as Mode[]) {
      const subs = subjectsByMode[m];
      if (!subs) continue;
      for (const s of subs) {
        const [pct] = subjPct(m, s);
        if (pct > 0 && pct < 40) list.push({ name: s.short_name || s.name, pct, tone: "red" });
        else if (pct >= 40 && pct < 70) list.push({ name: s.short_name || s.name, pct, tone: "yellow" });
      }
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectsHsc, subjectsMedical, progress]);

  const doneTopicsCount = Object.values(progress).filter(Boolean).length;

  const suggestion = useMemo(() => {
    const avg = Math.round((overallPct("hsc") + overallPct("medical")) / 2);
    if (avg === 0) return "পড়া শুরু করুন এবং টপিক মার্ক করুন।";
    if (avg > 0 && avg < 30) return "সিলেবাসে আরও মনোযোগ দিন। প্রতিদিন ২-৩টি নতুন টপিক সম্পন্ন করুন।";
    if (avg >= 30 && avg < 60) return "ভালো অগ্রগতি! দুর্বল বিষয়গুলোতে বেশি সময় দিন এবং নিয়মিত রিভিশন করুন।";
    return "অসাধারণ! Revision Planner ব্যবহার করে পড়া শেষ করা বিষয়গুলো রিভাইস করুন।";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectsHsc, subjectsMedical, progress]);

  const goBack = () => {
    if (openSubject) { setOpenSubjectId(null); return; }
    if (panel !== "none") {
      setPanel("none");
      // Reset syllabus dashboard/leaderboard view so the next time the user
      // opens Syllabus Tracker (from the home grid or via browser back), it
      // always starts on Dashboard + Medical instead of wherever they left off.
      setSylView("dashboard");
      setMode("medical");
      setLbMode("medical");
      return;
    }
    navigate(user ? "/dashboard" : "/");
  };

  const panelTitle =
    panel === "syllabus" ? (openSubject ? openSubject.name : "Study Tracker") :
    panel === "routine" ? "Routine Maker" :
    panel === "progress" ? "Weak & Progress" :
    panel === "revision" ? "Revision Planner" :
    panel === "gpa" ? "GPA Calculator" :
    "Study Tracker";

  return (
    <div className="min-h-screen bg-background text-foreground pb-16">
      <PublicHeader />
      <div className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3 bg-card border-b">
        <button onClick={goBack} className="h-9 w-9 rounded-full border flex items-center justify-center hover:bg-muted flex-shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="flex-1 font-extrabold text-[17px] truncate">{panelTitle}</h1>

        {panel === "syllabus" && !openSubject && (
          <div className="flex gap-1.5 flex-shrink-0">
            <button
              onClick={() => setSylView("dashboard")}
              className={cn(
                "text-[11px] font-bold px-2.5 py-1.5 rounded-full transition-all",
                sylView === "dashboard" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
                // Subtle glow pulse while the user is on the leaderboard —
                // nudges them toward the Dashboard button without being loud.
                sylView === "leaderboard" && "animate-pulse shadow-[0_0_0_3px_hsl(var(--primary)/0.25)]"
              )}
            >
              Dashboard
            </button>
            <button onClick={() => setSylView("leaderboard")} className={cn("text-[11px] font-bold px-2.5 py-1.5 rounded-full flex items-center gap-1", sylView === "leaderboard" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}><Trophy className="h-3 w-3" /> Leaderboard</button>
          </div>
        )}
        {panel === "revision" && (
          <div className="flex gap-1.5 flex-shrink-0">
            <button onClick={() => setRevView("dashboard")} className={cn("text-[11px] font-bold px-2.5 py-1.5 rounded-full", revView === "dashboard" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>Dashboard</button>
            <button onClick={() => setRevView("leaderboard")} className={cn("text-[11px] font-bold px-2.5 py-1.5 rounded-full flex items-center gap-1", revView === "leaderboard" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}><Trophy className="h-3 w-3" /> Leaderboard</button>
          </div>
        )}
        {panel === "none" && (
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-gradient-to-r from-primary to-violet-500 text-white flex-shrink-0">MEDIHOUR</span>
        )}
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-5 space-y-5">
        {panel === "none" && (
          <>
            <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide">ড্যাশবোর্ড</div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setSylView("dashboard");
                  setMode("medical");
                  setLbMode("medical");
                  setOpenSubjectId(null);
                  setOpenChapterId(null);
                  setPanel("syllabus");
                }}
                className="text-left rounded-2xl border bg-card p-4 space-y-2 hover:border-primary/40 transition-colors"
              >
                <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><BookOpen className="h-5 w-5" /></div>
                <div className="text-sm font-bold">Syllabus Tracker</div>
                <div className="text-[11px] text-muted-foreground leading-relaxed">HSC ও Medical<br />টপিক মার্ক করুন</div>
                <div className="text-2xl font-black text-primary">{dashSylPct}%</div>
              </button>
              <button onClick={() => setPanel("routine")} className="text-left rounded-2xl border bg-card p-4 space-y-2 hover:border-emerald-500/40 transition-colors">
                <div className="h-10 w-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center"><CalendarClock className="h-5 w-5" /></div>
                <div className="text-sm font-bold">Routine Maker</div>
                <div className="text-[11px] text-muted-foreground leading-relaxed">Daily ও Target<br />রুটিন তৈরি করুন</div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
              <button onClick={() => setPanel("progress")} className="text-left rounded-2xl border bg-card p-4 space-y-2 hover:border-amber-500/40 transition-colors">
                <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center"><TrendingUp className="h-5 w-5" /></div>
                <div className="text-sm font-bold">Weak &amp; Progress</div>
                <div className="text-[11px] text-muted-foreground leading-relaxed">ইতিহাস ও পরামর্শ<br />দুর্বল বিষয় বিশ্লেষণ</div>
                <div className="text-2xl font-black text-amber-600">{dashSylPct}%</div>
              </button>
              <button onClick={() => setPanel("revision")} className="text-left rounded-2xl border bg-card p-4 space-y-2 hover:border-violet-500/40 transition-colors">
                <div className="h-10 w-10 rounded-xl bg-violet-500/10 text-violet-600 flex items-center justify-center"><RotateCcw className="h-5 w-5" /></div>
                <div className="text-sm font-bold">Revision Planner</div>
                <div className="text-[11px] text-muted-foreground leading-relaxed">HSC ও Medical<br />রিভিশন ট্র্যাক</div>
                <div className="text-2xl font-black text-violet-600">{dashRevPct}%</div>
              </button>
              <button onClick={() => setPanel("gpa")} className="text-left rounded-2xl border bg-card p-4 space-y-2 hover:border-rose-500/40 transition-colors">
                <div className="h-10 w-10 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center"><Calculator className="h-5 w-5" /></div>
                <div className="text-sm font-bold">GPA Calculator</div>
                <div className="text-[11px] text-muted-foreground leading-relaxed">Medical ও Dental<br />GPA হিসাব করুন</div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            </div>
          </>
        )}
        {panel === "gpa" && (
          <div className="pb-6">
            <GPACalculator />
          </div>
        )}

        {panel === "syllabus" && (
          <>
            {openSubject && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl border bg-card py-2.5 text-center"><div className="text-lg font-black">{openSubject.chapters.length}</div><div className="text-[10px] text-muted-foreground font-bold">অধ্যায়</div></div>
                  <div className="rounded-xl border bg-card py-2.5 text-center"><div className="text-lg font-black">{subjPct(mode, openSubject)[2]}</div><div className="text-[10px] text-muted-foreground font-bold">সম্পন্ন</div></div>
                  <div className="rounded-xl border bg-card py-2.5 text-center"><div className="text-lg font-black text-primary">{subjPct(mode, openSubject)[0]}%</div><div className="text-[10px] text-muted-foreground font-bold">অগ্রগতি</div></div>
                </div>
                <div className="space-y-2">
                  {openSubject.chapters.map((c, i) => {
                    const pct = chapPct(openSubject, c);
                    const done = c.topics.filter((tp) => progress[topicKey(mode, openSubject.id, c.id, tp.id)]).length;
                    const isOpen = openChapterId === c.id;
                    return (
                      <div key={c.id} className="rounded-xl border bg-card overflow-hidden">
                        <button onClick={() => setOpenChapterId(isOpen ? null : c.id)} className="w-full flex items-center gap-3 p-3 text-left">
                          <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-black text-xs flex-shrink-0">{i + 1}</div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-bold truncate">{c.name}</div>
                            <div className="text-[10px] text-muted-foreground">{done}/{c.topics.length} টপিক · <span className="text-primary font-bold">{pct}%</span></div>
                            <div className="h-1.5 rounded-full bg-muted mt-1 overflow-hidden"><div className={cn("h-full rounded-full", pct === 100 ? "bg-emerald-500" : "bg-primary")} style={{ width: `${pct}%` }} /></div>
                          </div>
                          <span className={cn("text-[11px] font-black px-1.5 py-0.5 rounded-md flex-shrink-0", pct === 100 ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground")}>{pct}%</span>
                          {isOpen ? <ChevronDown className="h-4 w-4 flex-shrink-0" /> : <ChevronRight className="h-4 w-4 flex-shrink-0" />}
                        </button>
                        {isOpen && (
                          <div className="border-t divide-y">
                            {c.topics.map((tp) => {
                              const tDone = !!progress[topicKey(mode, openSubject.id, c.id, tp.id)];
                              return (
                                <button key={tp.id} onClick={() => toggleTopic(openSubject, c, tp)} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-muted/40">
                                  <div className={cn("h-5 w-5 rounded-md border-2 flex items-center justify-center flex-shrink-0", tDone ? "bg-emerald-500 border-emerald-500" : "border-border")}>{tDone && <CheckCircle2 className="h-3.5 w-3.5 text-white" />}</div>
                                  <span className={cn("text-xs font-semibold", tDone && "line-through text-muted-foreground")}>{tp.name}</span>
                                </button>
                              );
                            })}
                            {c.topics.length === 0 && <p className="text-center text-xs text-muted-foreground py-3">কোনো টপিক নেই</p>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {!openSubject && sylView === "dashboard" && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setMode("medical")} className={cn("py-2.5 rounded-xl text-sm font-bold border-2", mode === "medical" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground")}>Medical Admission</button>
                  <button onClick={() => setMode("hsc")} className={cn("py-2.5 rounded-xl text-sm font-bold border-2", mode === "hsc" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground")}>HSC সিলেবাস</button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-xl border bg-card py-2.5 text-center"><div className="text-lg font-black">{subjects?.length ?? "—"}</div><div className="text-[10px] text-muted-foreground font-bold">বিষয়</div></div>
                  <div className="rounded-xl border bg-card py-2.5 text-center"><div className="text-lg font-black">{overall.totalChaps}</div><div className="text-[10px] text-muted-foreground font-bold">অধ্যায়</div></div>
                  <div className="rounded-xl border bg-card py-2.5 text-center"><div className="text-lg font-black text-primary">{overall.pct}%</div><div className="text-[10px] text-muted-foreground font-bold">সম্পন্ন</div></div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold text-muted-foreground"><span>সামগ্রিক অগ্রগতি</span><span>{overall.pct}%</span></div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary rounded-full transition-all" style={{ width: `${overall.pct}%` }} /></div>
                </div>
                {isLoading && <p className="text-center text-sm text-muted-foreground py-10">লোড হচ্ছে...</p>}
                {!isLoading && (!subjects || subjects.length === 0) && (
                  <div className="flex flex-col items-center text-center gap-3 pt-10">
                    <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center shadow-lg"><BarChart3 className="h-7 w-7 text-white" /></div>
                    <p className="text-sm text-muted-foreground max-w-xs">কোনো বিষয় পাওয়া যায়নি।</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2.5">
                  {subjects?.map((s) => {
                    const [pct, t] = subjPct(mode, s);
                    const full = pct === 100;
                    return (
                      <button key={s.id} onClick={() => setOpenSubjectId(s.id)} className={cn("relative text-left rounded-xl border-2 p-2.5 transition-colors", full ? "border-emerald-500/50 bg-emerald-500/5" : "border-border bg-card hover:border-primary/30")}>
                        {full && <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-600 bg-emerald-500/15 px-1.5 py-0.5 rounded-full mb-1"><CheckCircle2 className="h-2.5 w-2.5" /> সম্পন্ন</span>}
                        <div className="text-[13px] font-bold leading-snug whitespace-nowrap">{s.name}</div>
                        <div className="flex items-center gap-2 mt-2"><span className="text-sm font-black text-primary">{pct}%</span><div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${pct}%` }} /></div></div>
                        <div className="text-[10px] text-muted-foreground mt-1.5">{s.chapters.length} অধ্যায় · {t} টপিক</div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {!openSubject && sylView === "leaderboard" && (
              <LeaderboardView lbMode={lbMode} setLbMode={setLbMode} leaderboard={leaderboard} currentUserId={user?.id} />
            )}
          </>
        )}

        {panel === "routine" && (
          <>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setRoutineTab("daily")} className={cn("py-2.5 rounded-xl text-sm font-bold border-2", routineTab === "daily" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground")}>Daily Routine</button>
              <button onClick={() => setRoutineTab("target")} className={cn("py-2.5 rounded-xl text-sm font-bold border-2", routineTab === "target" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground")}>Target Based</button>
            </div>
            <div className="flex flex-col items-center text-center gap-3 pt-14">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg"><Clock3 className="h-7 w-7 text-white" /></div>
              <div className="text-sm font-bold">{routineTab === "daily" ? "Daily Routine" : "Target Based Routine"}</div>
              <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">আপনার পড়ার সময়সূচি তৈরি করুন।<br />বিষয় অনুযায়ী সময় ভাগ করুন।</p>
              <button disabled className="mt-2 px-6 py-3 rounded-xl bg-gradient-to-r from-primary to-violet-500 text-white text-sm font-bold opacity-70 cursor-not-allowed">+ নতুন রুটিন তৈরি (শীঘ্রই আসছে)</button>
            </div>
          </>
        )}

        {panel === "progress" && (
          <div className="space-y-4">
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <div className="text-sm font-bold flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" /> Syllabus অগ্রগতি</div>
              <div className="space-y-1.5"><div className="flex justify-between text-[11px] text-muted-foreground font-bold"><span>HSC</span><span>{overallPct("hsc")}%</span></div><div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${overallPct("hsc")}%` }} /></div></div>
              <div className="space-y-1.5"><div className="flex justify-between text-[11px] text-muted-foreground font-bold"><span>Medical</span><span>{overallPct("medical")}%</span></div><div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${overallPct("medical")}%` }} /></div></div>
            </div>
            <div className="rounded-xl border bg-card p-4 space-y-3">
              <div className="text-sm font-bold flex items-center gap-2"><TrendingUp className="h-4 w-4 text-amber-600" /> দুর্বল বিষয়সমূহ</div>
              <div className="flex flex-wrap gap-1.5">
                {weakSubjects.length === 0 && <span className="text-xs text-muted-foreground">পড়া শুরু করলে দুর্বল বিষয় চিহ্নিত হবে।</span>}
                {weakSubjects.map((w, i) => (
                  <span key={i} className={cn("text-[11px] font-bold px-2.5 py-1 rounded-full border", w.tone === "red" ? "bg-red-500/10 text-red-600 border-red-500/25" : "bg-amber-500/10 text-amber-600 border-amber-500/25")}>{w.name} {w.pct}%</span>
                ))}
              </div>
            </div>
            <div className="rounded-xl border bg-card p-4 space-y-2">
              <div className="text-sm font-bold flex items-center gap-2"><Clock3 className="h-4 w-4 text-muted-foreground" /> সাম্প্রতিক কার্যক্রম</div>
              {doneTopicsCount ? (
                <div className="flex items-center gap-2.5 py-1"><span className="h-2 w-2 rounded-full bg-emerald-500 flex-shrink-0" /><span className="text-xs text-muted-foreground">{doneTopicsCount}টি টপিক সম্পন্ন করা হয়েছে</span></div>
              ) : (
                <p className="text-xs text-muted-foreground py-1">এখনো কোনো কার্যক্রম নেই।</p>
              )}
            </div>
            <div className="rounded-xl border bg-card p-4 space-y-2">
              <div className="text-sm font-bold">পরামর্শ</div>
              <p className="text-xs text-muted-foreground leading-relaxed">{suggestion}</p>
            </div>
          </div>
        )}

        {panel === "revision" && (
          <>
            {revView === "dashboard" && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setRevMode("medical")} className={cn("py-2.5 rounded-xl text-sm font-bold border-2", revMode === "medical" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground")}>Medical Revision</button>
                  <button onClick={() => setRevMode("hsc")} className={cn("py-2.5 rounded-xl text-sm font-bold border-2", revMode === "hsc" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground")}>HSC Revision</button>
                </div>
                {(() => {
                  const subs = subjectsByMode[revMode];
                  const { pct, d } = revOverallPct(revMode);
                  return (
                    <>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="rounded-xl border bg-card py-2.5 text-center"><div className="text-lg font-black">{subs?.length ?? "—"}</div><div className="text-[10px] text-muted-foreground font-bold">বিষয়</div></div>
                        <div className="rounded-xl border bg-card py-2.5 text-center"><div className="text-lg font-black">{d}</div><div className="text-[10px] text-muted-foreground font-bold">রিভিশন সম্পন্ন</div></div>
                        <div className="rounded-xl border bg-card py-2.5 text-center"><div className="text-lg font-black text-violet-600">{pct}%</div><div className="text-[10px] text-muted-foreground font-bold">অগ্রগতি</div></div>
                      </div>
                      <div className="space-y-1.5"><div className="flex justify-between text-xs font-bold text-muted-foreground"><span>রিভিশন অগ্রগতি</span><span>{pct}%</span></div><div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full bg-violet-500 rounded-full transition-all" style={{ width: `${pct}%` }} /></div></div>
                      {!subs?.length && <p className="text-center text-xs text-muted-foreground py-8">কোনো বিষয় নেই।</p>}
                      <div className="grid grid-cols-2 gap-2.5">
                        {subs?.map((s) => {
                          let st = 0, sd = 0;
                          for (const c of s.chapters) for (const tp of c.topics) { st++; if (revision[revKey(revMode, s.id, c.id, tp.id)]) sd++; }
                          const spct = st ? Math.round((sd / st) * 100) : 0;
                          return (
                            <div key={s.id} className="rounded-xl border-2 border-border bg-card p-3.5">
                              <div className="text-sm font-bold">{s.name}</div>
                              <div className="flex items-center gap-2 mt-2"><span className="text-sm font-black text-violet-600">{spct}%</span><div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-violet-500 rounded-full" style={{ width: `${spct}%` }} /></div></div>
                              <div className="text-[10px] text-muted-foreground mt-1.5">{s.chapters.length} অধ্যায় · {st} টপিক</div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
              </>
            )}
            {revView === "leaderboard" && (
              <LeaderboardView lbMode={revLbMode} setLbMode={setRevLbMode} leaderboard={revLeaderboard} currentUserId={user?.id} />
            )}
          </>
        )}
      </div>
    </div>
  );
};

function LeaderboardView({ lbMode, setLbMode, leaderboard, currentUserId }: { lbMode: Mode; setLbMode: (m: Mode) => void; leaderboard?: any[]; currentUserId?: string; }) {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button onClick={() => setLbMode("medical")} className={cn("flex-1 py-2 rounded-xl text-xs font-bold border-2", lbMode === "medical" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground")}>Medical</button>
        <button onClick={() => setLbMode("hsc")} className={cn("flex-1 py-2 rounded-xl text-xs font-bold border-2", lbMode === "hsc" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground")}>HSC</button>
      </div>
      <div className="space-y-1.5">
        {(!leaderboard || leaderboard.length === 0) && <p className="text-center text-xs text-muted-foreground py-8">এখনো কেউ এই মোডে অগ্রগতি রেকর্ড করেনি।</p>}
        {leaderboard?.map((row, i) => {
          const isMe = row.user_id === currentUserId;
          const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
          return (
            <div key={row.user_id} className={cn("flex items-center gap-2.5 rounded-lg border px-2.5 py-2 bg-card/50", isMe && "border-primary/40 bg-primary/5")}>
              <span className="w-6 text-center font-black text-xs text-muted-foreground">{medal || `#${i + 1}`}</span>
              <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-extrabold text-xs flex-shrink-0">{(row.full_name || "S").charAt(0).toUpperCase()}</div>
              <div className="flex-1 min-w-0"><div className="text-xs font-bold truncate">{row.full_name || "Student"}{isMe && " (তুমি)"}</div>{row.hsc_batch && <div className="text-[10px] text-muted-foreground">{row.hsc_batch}</div>}</div>
              <div className="text-xs font-black text-primary flex-shrink-0">{Number(row.pct).toFixed(1)}%</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SyllabusTracker;
