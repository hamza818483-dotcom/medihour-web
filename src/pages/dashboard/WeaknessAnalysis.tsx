import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ClipboardX, Video, Lightbulb, TrendingDown, AlertTriangle, BookX, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

const DAY_RANGES = [
  { key: "total", label: "Total", days: null },
  { key: "today", label: "আজকে", days: 0 },
  { key: "3", label: "বিগত ৩ দিন", days: 3 },
  { key: "7", label: "বিগত ৭ দিন", days: 7 },
  { key: "15", label: "বিগত ১৫ দিন", days: 15 },
  { key: "30", label: "বিগত ৩০ দিন", days: 30 },
  { key: "45", label: "বিগত ৪৫ দিন", days: 45 },
  { key: "60", label: "বিগত ৬০ দিন", days: 60 },
  { key: "75", label: "বিগত ৭৫ দিন", days: 75 },
  { key: "90", label: "বিগত ৯০ দিন", days: 90 },
] as const;

type RangeKey = typeof DAY_RANGES[number]["key"];

const DayRangeSelector = ({ value, onChange }: { value: RangeKey; onChange: (v: RangeKey) => void }) => (
  <div className="flex flex-wrap gap-1.5">
    {DAY_RANGES.map((r) => (
      <Button
        key={r.key}
        size="sm"
        variant={value === r.key ? "default" : "outline"}
        className="h-7 px-2.5 text-xs"
        onClick={() => onChange(r.key)}
      >
        {r.label}
      </Button>
    ))}
  </div>
);

type WeaknessCategoryKey = "exam" | "class" | "overall";

const WEAKNESS_CATEGORIES: { key: WeaknessCategoryKey; label: string; icon: typeof ClipboardX }[] = [
  { key: "exam", label: "Exam Weakness Report", icon: ClipboardX },
  { key: "class", label: "Class Weakness Report", icon: Video },
  { key: "overall", label: "Overall Suggestion", icon: Lightbulb },
];

const CategorySelector = ({ value, onChange }: { value: WeaknessCategoryKey; onChange: (v: WeaknessCategoryKey) => void }) => (
  <div className="grid grid-cols-3 gap-2">
    {WEAKNESS_CATEGORIES.map(({ key, label, icon: Icon }) => (
      <button
        key={key}
        type="button"
        onClick={() => onChange(key)}
        className={cn(
          "flex flex-col items-center justify-center gap-1 h-16 rounded-lg border-2 px-2 text-[11px] font-semibold text-center leading-tight transition-colors",
          value === key
            ? "border-primary bg-primary/10 text-primary"
            : "border-border text-muted-foreground hover:border-primary/40"
        )}
      >
        <Icon className="h-4 w-4 flex-shrink-0" />
        <span>{label}</span>
      </button>
    ))}
  </div>
);

const rangeToCutoff = (range: RangeKey): Date | null => {
  const def = DAY_RANGES.find((r) => r.key === range);
  if (!def || def.days === null) return null;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - def.days);
  cutoff.setHours(0, 0, 0, 0);
  return cutoff;
};

// -----------------------------------------------------------------------
// Exam Weakness Report — will eventually combine data from: Exam Report
// (routinewise + readymade), Exam History (every category result), My
// Mistakes, Readymade Exam attempts, Quick Practice, and Unlimited Mock
// Test — to surface which exams/subjects/chapters need more focus, and
// which question types are commonly missed. Rule-based (not AI-generated):
// fixed thresholds compare subject/chapter-wise average score against the
// student's own overall average and flag the weakest ones.
// -----------------------------------------------------------------------
// (comments above kept, header)
// Rule-based (not AI-generated):
// fixed thresholds compare subject/chapter-wise average score against the
// student's own overall average and flag the weakest ones.
// -----------------------------------------------------------------------
type SubjectStat = { subject: string; total: number; correct: number; accuracy: number };
type ChapterStat = { subject: string; chapter: string; total: number; correct: number; accuracy: number };
type QTypeStat = { question_type: string; total: number; correct: number; accuracy: number };
type DailyStat = { date: string; total: number; correct: number; accuracy: number };
type ExamWeaknessData = {
  subjects: SubjectStat[];
  chapters: ChapterStat[];
  question_types: QTypeStat[];
  daily: DailyStat[];
  overall_accuracy: number;
  total_answered: number;
};

// A subject/chapter counts as "weak" when its accuracy is at least 10
// percentage points below the student's own overall accuracy (and it has
// at least 3 answered questions, so a single lucky/unlucky question doesn't
// flag a whole chapter). This threshold is a simple, transparent rule —
// not an AI judgement — and is easy to tune later if needed.
const WEAK_THRESHOLD_GAP = 10;
const MIN_SAMPLE_SIZE = 3;

const ExamWeaknessReport = ({ range }: { range: RangeKey }) => {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["exam-weakness-report", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase.rpc("get_my_exam_weakness_report" as any);
      if (error) throw error;
      return data as unknown as ExamWeaknessData;
    },
    enabled: !!user,
  });

  const cutoff = rangeToCutoff(range);

  const filteredDaily = useMemo(() => {
    if (!data) return [];
    if (!cutoff) return data.daily;
    return data.daily.filter((d) => new Date(d.date) >= cutoff);
  }, [data, cutoff]);

  // Recompute overall accuracy for the selected range from the daily buckets
  // (subject/chapter breakdowns stay lifetime-wide since the RPC doesn't
  // bucket those by day, but the daily trend + overall % respect the range).
  const rangedOverall = useMemo(() => {
    const totals = filteredDaily.reduce(
      (acc, d) => ({ total: acc.total + d.total, correct: acc.correct + d.correct }),
      { total: 0, correct: 0 }
    );
    return {
      total: totals.total,
      accuracy: totals.total > 0 ? Math.round((totals.correct / totals.total) * 1000) / 10 : 0,
    };
  }, [filteredDaily]);

  const weakSubjects = useMemo(() => {
    if (!data) return [];
    return data.subjects.filter(
      (s) => s.total >= MIN_SAMPLE_SIZE && data.overall_accuracy - s.accuracy >= WEAK_THRESHOLD_GAP
    );
  }, [data]);

  const weakChapters = useMemo(() => {
    if (!data) return [];
    return data.chapters
      .filter((c) => c.total >= MIN_SAMPLE_SIZE && data.overall_accuracy - c.accuracy >= WEAK_THRESHOLD_GAP)
      .slice(0, 10);
  }, [data]);

  const weakQuestionTypes = useMemo(() => {
    if (!data) return [];
    return data.question_types.filter(
      (q) => q.total >= MIN_SAMPLE_SIZE && data.overall_accuracy - q.accuracy >= WEAK_THRESHOLD_GAP
    );
  }, [data]);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  if (!data || data.total_answered === 0) {
    return (
      <Card className="border border-dashed">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          এখনো কোনো exam attempt পাওয়া যায়নি — অন্তত একটি exam দিলে এখানে বিস্তারিত বিশ্লেষণ দেখা যাবে।
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Card className="border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/20">
          <CardContent className="p-2.5 flex flex-col items-center text-center gap-0.5">
            <span className="text-[10px] text-muted-foreground leading-tight">মোট উত্তর (এই রেঞ্জে)</span>
            <span className="text-base font-bold text-blue-600 leading-tight">{rangedOverall.total}</span>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20">
          <CardContent className="p-2.5 flex flex-col items-center text-center gap-0.5">
            <span className="text-[10px] text-muted-foreground leading-tight">Accuracy (এই রেঞ্জে)</span>
            <span className="text-base font-bold text-emerald-600 leading-tight">{rangedOverall.accuracy}%</span>
          </CardContent>
        </Card>
      </div>

      <Card className="border-red-500/30 bg-red-50/40 dark:bg-red-950/10">
        <CardHeader className="py-2.5 px-3">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <TrendingDown className="h-4 w-4 text-red-500" /> দুর্বল বিষয় (Weak Subjects)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 pb-3 px-3">
          {weakSubjects.length === 0 ? (
            <p className="text-xs text-muted-foreground">কোনো বিষয়ে বড় দুর্বলতা পাওয়া যায়নি — চালিয়ে যাও!</p>
          ) : (
            <div className="space-y-1.5">
              {weakSubjects.map((s) => (
                <div key={s.subject} className="flex items-center justify-between text-xs bg-background/60 rounded px-2 py-1.5">
                  <span className="font-medium">{s.subject}</span>
                  <span className="text-red-600 font-semibold">{s.accuracy}% ({s.correct}/{s.total})</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-amber-500/30 bg-amber-50/40 dark:bg-amber-950/10">
        <CardHeader className="py-2.5 px-3">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> দুর্বল অধ্যায় (Weak Chapters)
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 pb-3 px-3">
          {weakChapters.length === 0 ? (
            <p className="text-xs text-muted-foreground">কোনো অধ্যায়ে বড় দুর্বলতা পাওয়া যায়নি।</p>
          ) : (
            <div className="space-y-1.5">
              {weakChapters.map((c) => (
                <div key={`${c.subject}-${c.chapter}`} className="flex items-center justify-between text-xs bg-background/60 rounded px-2 py-1.5">
                  <span className="font-medium">{c.chapter} <span className="text-muted-foreground">({c.subject})</span></span>
                  <span className="text-amber-600 font-semibold">{c.accuracy}% ({c.correct}/{c.total})</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-purple-500/30 bg-purple-50/40 dark:bg-purple-950/10">
        <CardHeader className="py-2.5 px-3">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <BookX className="h-4 w-4 text-purple-500" /> কম ধরা প্রশ্নের ধরন
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 pb-3 px-3">
          {weakQuestionTypes.length === 0 ? (
            <p className="text-xs text-muted-foreground">প্রশ্নের ধরন অনুযায়ী কোনো বড় দুর্বলতা পাওয়া যায়নি।</p>
          ) : (
            <div className="space-y-1.5">
              {weakQuestionTypes.map((q) => (
                <div key={q.question_type} className="flex items-center justify-between text-xs bg-background/60 rounded px-2 py-1.5">
                  <span className="font-medium">{q.question_type}</span>
                  <span className="text-purple-600 font-semibold">{q.accuracy}% ({q.correct}/{q.total})</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// -----------------------------------------------------------------------
// Class Weakness Report — uses get_my_class_report() (same RPC that powers
// the Class Report tab) to aggregate watched time per subject, and flags
// subjects with comparatively low watch time vs. the student's own average
// subject watch time. Rule-based: no fixed "good" duration is assumed —
// only relative comparison against the student's own subjects.
// -----------------------------------------------------------------------
type ClassReportRow = {
  class_id: string;
  class_title: string;
  category: "live" | "record" | "archive";
  course_name: string | null;
  class_start_at: string | null;
  total_watched_seconds: number;
  last_watched_at: string;
  rank: number;
  total_participants: number;
  subject: string[] | null;
};

const formatDuration = (totalSeconds: number) => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}ঘ ${m}মি`;
  return `${m}মি`;
};

const ClassWeaknessReport = ({ range }: { range: RangeKey }) => {
  const { user } = useAuth();

  const { data: rows, isLoading } = useQuery({
    queryKey: ["class-weakness-report", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.rpc("get_my_class_report" as any);
      if (error) throw error;
      return (data as unknown as ClassReportRow[]) || [];
    },
    enabled: !!user,
  });

  const cutoff = rangeToCutoff(range);

  const filteredRows = useMemo(() => {
    if (!rows) return [];
    if (!cutoff) return rows;
    return rows.filter((r) => new Date(r.last_watched_at) >= cutoff);
  }, [rows, cutoff]);

  const subjectStats = useMemo(() => {
    const map = new Map<string, { subject: string; totalSeconds: number; classCount: number }>();
    filteredRows.forEach((row) => {
      const subjects = row.subject && row.subject.length > 0 ? row.subject : ["Uncategorized"];
      subjects.forEach((s) => {
        const existing = map.get(s) || { subject: s, totalSeconds: 0, classCount: 0 };
        existing.totalSeconds += row.total_watched_seconds || 0;
        existing.classCount += 1;
        map.set(s, existing);
      });
    });
    return Array.from(map.values()).sort((a, b) => a.totalSeconds - b.totalSeconds);
  }, [filteredRows]);

  const avgSeconds = useMemo(() => {
    if (subjectStats.length === 0) return 0;
    return subjectStats.reduce((sum, s) => sum + s.totalSeconds, 0) / subjectStats.length;
  }, [subjectStats]);

  // A subject is "low watch time" when it's at least 40% below the
  // student's own average watch time across their subjects.
  const weakSubjects = useMemo(() => {
    if (subjectStats.length < 2) return [];
    return subjectStats.filter((s) => s.totalSeconds <= avgSeconds * 0.6);
  }, [subjectStats, avgSeconds]);

  const totalWatchedSeconds = filteredRows.reduce((sum, r) => sum + (r.total_watched_seconds || 0), 0);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  if (!rows || rows.length === 0) {
    return (
      <Card className="border border-dashed">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          এখনো কোনো ক্লাস দেখা হয়নি — একটি ক্লাস দেখলে এখানে বিস্তারিত বিশ্লেষণ দেখা যাবে।
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Card className="border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/20">
          <CardContent className="p-2.5 flex flex-col items-center text-center gap-0.5">
            <span className="text-[10px] text-muted-foreground leading-tight">মোট ক্লাস দেখা হয়েছে</span>
            <span className="text-base font-bold text-blue-600 leading-tight">{filteredRows.length}</span>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20">
          <CardContent className="p-2.5 flex flex-col items-center text-center gap-0.5">
            <span className="text-[10px] text-muted-foreground leading-tight">মোট সময় (এই রেঞ্জে)</span>
            <span className="text-base font-bold text-emerald-600 leading-tight">{formatDuration(totalWatchedSeconds)}</span>
          </CardContent>
        </Card>
      </div>

      <Card className="border-orange-500/30 bg-orange-50/40 dark:bg-orange-950/10">
        <CardHeader className="py-2.5 px-3">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <AlertTriangle className="h-4 w-4 text-orange-500" /> কম দেখা বিষয়
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 pb-3 px-3">
          {weakSubjects.length === 0 ? (
            <p className="text-xs text-muted-foreground">সব বিষয়ে মোটামুটি সমান সময় দেওয়া হচ্ছে — ভালো!</p>
          ) : (
            <div className="space-y-1.5">
              {weakSubjects.map((s) => (
                <div key={s.subject} className="flex items-center justify-between text-xs bg-background/60 rounded px-2 py-1.5">
                  <span className="font-medium">{s.subject} <span className="text-muted-foreground">({s.classCount}টি ক্লাস)</span></span>
                  <span className="text-orange-600 font-semibold">{formatDuration(s.totalSeconds)}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// -----------------------------------------------------------------------
// Overall Suggestion — combines everything (exam performance, class watch
// time, site activity/leaderboard position over recent days) into one
// rule-based recommendation of what to do next to improve overall rank.
// -----------------------------------------------------------------------
type RankTrendPoint = { date: string; rank: number; total_participants: number; percentile: number };
type OverallActivityData = {
  rank_trend: RankTrendPoint[];
  total_exams: number;
  total_quick_practice_sessions: number;
  total_mock_test_sessions: number;
  total_watch_seconds: number;
  avg_percentile: number;
};

const OverallSuggestion = ({ range }: { range: RangeKey }) => {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["overall-activity-report", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase.rpc("get_my_overall_activity_report" as any);
      if (error) throw error;
      return data as unknown as OverallActivityData;
    },
    enabled: !!user,
  });

  const cutoff = rangeToCutoff(range);

  const filteredTrend = useMemo(() => {
    if (!data) return [];
    if (!cutoff) return data.rank_trend;
    return data.rank_trend.filter((p) => new Date(p.date) >= cutoff);
  }, [data, cutoff]);

  // Split the ranged trend into first-half vs second-half to see whether
  // percentile is improving (rule-based trend direction, not AI).
  const trendDirection = useMemo(() => {
    if (filteredTrend.length < 2) return null;
    const mid = Math.floor(filteredTrend.length / 2);
    const firstHalf = filteredTrend.slice(0, mid);
    const secondHalf = filteredTrend.slice(mid);
    const avg = (arr: RankTrendPoint[]) => arr.reduce((s, p) => s + p.percentile, 0) / arr.length;
    const diff = avg(secondHalf) - avg(firstHalf);
    if (diff >= 3) return "up";
    if (diff <= -3) return "down";
    return "flat";
  }, [filteredTrend]);

  const rangedExamCount = filteredTrend.length;
  const rangedAvgPercentile = useMemo(() => {
    if (filteredTrend.length === 0) return 0;
    return Math.round((filteredTrend.reduce((s, p) => s + p.percentile, 0) / filteredTrend.length) * 10) / 10;
  }, [filteredTrend]);

  const suggestions = useMemo(() => {
    if (!data) return [];
    const tips: string[] = [];

    if (rangedExamCount === 0) {
      tips.push("এই সময়সীমায় কোনো exam দেওয়া হয়নি — নিয়মিত exam দিলে rank ও weakness সম্পর্কে স্পষ্ট ধারণা পাওয়া যাবে।");
    } else {
      if (rangedExamCount < 3) {
        tips.push("এই সময়ে খুব কম exam দেওয়া হয়েছে — আরও বেশি exam attempt করলে rank উন্নত করার সুযোগ বাড়বে।");
      }
      if (trendDirection === "down") {
        tips.push("সাম্প্রতিক exam গুলোতে percentile (rank) কমছে — 'Exam Weakness Report' ট্যাব থেকে দুর্বল বিষয়/অধ্যায় দেখে সেগুলোতে বেশি সময় দাও।");
      } else if (trendDirection === "up") {
        tips.push("সাম্প্রতিক exam গুলোতে rank ভালো হচ্ছে — এই গতি ধরে রাখো!");
      } else if (trendDirection === "flat") {
        tips.push("rank মোটামুটি স্থির আছে — নতুন কিছু চ্যাপ্টারে জোর দিলে আরও এগোনো সম্ভব।");
      }
      if (rangedAvgPercentile < 50) {
        tips.push("গড় percentile ৫০%-এর নিচে — Readymade Exam ও Quick Practice দিয়ে বেশি practice করলে দ্রুত উন্নতি হবে।");
      }
    }

    if (data.total_watch_seconds < 3600) {
      tips.push("ক্লাস দেখার সময় তুলনামূলক কম — নিয়মিত ক্লাস দেখলে concept আরও পরিষ্কার হবে যা exam score-এও প্রভাব ফেলবে।");
    }

    if (data.total_quick_practice_sessions === 0) {
      tips.push("এখনো কোনো Quick Practice সেশন দেওয়া হয়নি — দুর্বল অধ্যায়গুলো দ্রুত ঝালাই করতে Quick Practice ব্যবহার করতে পারো।");
    }

    if (data.total_mock_test_sessions === 0) {
      tips.push("এখনো কোনো Mock Test দেওয়া হয়নি — পুরো exam-এর মতো practice করতে Mock Test ব্যবহার করতে পারো।");
    }

    if (tips.length === 0) {
      tips.push("তোমার overall activity ভালো আছে — এভাবেই ধারাবাহিকভাবে চালিয়ে যাও!");
    }

    return tips;
  }, [data, rangedExamCount, trendDirection, rangedAvgPercentile]);

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading...</p>;
  }

  if (!data || (data.total_exams === 0 && data.total_watch_seconds === 0 && data.total_quick_practice_sessions === 0 && data.total_mock_test_sessions === 0)) {
    return (
      <Card className="border border-dashed">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          এখনো কোনো exam বা ক্লাস activity পাওয়া যায়নি — activity শুরু হলে এখানে বিস্তারিত পরামর্শ দেখা যাবে।
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Card className="border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/20">
          <CardContent className="p-2.5 flex flex-col items-center text-center gap-0.5">
            <span className="text-[10px] text-muted-foreground leading-tight">Exam (এই রেঞ্জে)</span>
            <span className="text-base font-bold text-blue-600 leading-tight">{rangedExamCount}</span>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20">
          <CardContent className="p-2.5 flex flex-col items-center text-center gap-0.5">
            <span className="text-[10px] text-muted-foreground leading-tight">গড় Percentile</span>
            <span className="text-base font-bold text-emerald-600 leading-tight">{rangedAvgPercentile}%</span>
          </CardContent>
        </Card>
      </div>

      <Card className={cn(
        "border",
        trendDirection === "up" ? "border-green-500/30 bg-green-50/40 dark:bg-green-950/10" :
        trendDirection === "down" ? "border-red-500/30 bg-red-50/40 dark:bg-red-950/10" :
        "border-border bg-muted/20"
      )}>
        <CardHeader className="py-2.5 px-3">
          <CardTitle className="text-sm flex items-center gap-1.5">
            {trendDirection === "up" ? <TrendingUp className="h-4 w-4 text-green-600" /> :
             trendDirection === "down" ? <TrendingDown className="h-4 w-4 text-red-600" /> :
             <Lightbulb className="h-4 w-4 text-primary" />}
            Rank Trend
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 pb-3 px-3 text-xs text-muted-foreground">
          {trendDirection === "up" && "সাম্প্রতিক exam গুলোতে rank/percentile উন্নত হচ্ছে।"}
          {trendDirection === "down" && "সাম্প্রতিক exam গুলোতে rank/percentile কমছে।"}
          {trendDirection === "flat" && "rank/percentile মোটামুটি স্থির আছে।"}
          {trendDirection === null && "trend দেখার জন্য আরও exam দরকার।"}
        </CardContent>
      </Card>

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader className="py-2.5 px-3">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Lightbulb className="h-4 w-4 text-primary" /> সার্বিক পরামর্শ
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 pb-3 px-3">
          <ul className="space-y-1.5">
            {suggestions.map((tip, i) => (
              <li key={i} className="text-xs bg-background/60 rounded px-2 py-1.5 leading-relaxed">
                {tip}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
};

const WeaknessAnalysis = () => {
  const [category, setCategory] = useState<WeaknessCategoryKey>("exam");
  const [range, setRange] = useState<RangeKey>("total");

  return (
    <div className="space-y-4">
      <CategorySelector value={category} onChange={setCategory} />
      <DayRangeSelector value={range} onChange={setRange} />
      {category === "exam" && <ExamWeaknessReport range={range} />}
      {category === "class" && <ClassWeaknessReport range={range} />}
      {category === "overall" && <OverallSuggestion range={range} />}
    </div>
  );
};

export default WeaknessAnalysis;
