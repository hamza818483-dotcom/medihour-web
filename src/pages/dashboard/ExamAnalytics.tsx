import { useEffect, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";

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

const DayRangeSelector = ({ value, onChange }: { value: RangeKey, onChange: (v: RangeKey) => void }) => (
  <div className="flex flex-wrap gap-1.5">
    {DAY_RANGES.map(r => (
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

type ReadymadeAttempt = {
  attempt_id: string;
  exam_id: string;
  title: string;
  subject: string[] | null;
  chapter: string | null;
  total_marks: number | null;
  score: number;
  rank: number;
  total_participants: number;
  attempt_date: string;
};


type AnalyticsExam = {
  id: string;
  title: string;
  total_marks: number | null;
  time_window_start: string | null;
  time_window_end: string | null;
  created_at: string;
  is_archive?: boolean;
  course_name: string;
  live_attempt: {
    score: number;
    rank: number;
    highest_score: number | null;
  } | null;
  practice_attempt: {
    score: number;
    rank: number;
    highest_score: number | null;
  } | null;
  highest_live_score: number | null;
  highest_practice_score: number | null;
};

type ScoredItem = { score: number; total_marks: number | null; rank?: number | null };

// Splits items into 50-mark and 100-mark buckets and averages score/rank within each.
// Per Rafi's rule: for repeat/2nd-timer attempts on the same exam, the LOWER score
// (i.e. the one with marks cut) is what counts toward the average — callers should
// pre-reduce to one row per exam using the min-score attempt before calling this.
const computeAverages = (items: ScoredItem[]) => {
  const buckets: Record<50 | 100, { scoreSum: number; rankSum: number; rankCount: number; count: number }> = {
    50: { scoreSum: 0, rankSum: 0, rankCount: 0, count: 0 },
    100: { scoreSum: 0, rankSum: 0, rankCount: 0, count: 0 },
  };
  items.forEach(item => {
    const bucketKey: 50 | 100 = item.total_marks === 50 ? 50 : 100;
    buckets[bucketKey].count += 1;
    buckets[bucketKey].scoreSum += item.score;
    if (item.rank !== null && item.rank !== undefined) {
      buckets[bucketKey].rankSum += item.rank;
      buckets[bucketKey].rankCount += 1;
    }
  });
  return {
    avgScore50: buckets[50].count > 0 ? (buckets[50].scoreSum / buckets[50].count) : null,
    avgScore100: buckets[100].count > 0 ? (buckets[100].scoreSum / buckets[100].count) : null,
    avgRank50: buckets[50].rankCount > 0 ? (buckets[50].rankSum / buckets[50].rankCount) : null,
    avgRank100: buckets[100].rankCount > 0 ? (buckets[100].rankSum / buckets[100].rankCount) : null,
  };
};

const StatBoxRow = ({ totalAttended, avgScore50, avgScore100, avgRank50, avgRank100 }: {
  totalAttended: number;
  avgScore50: number | null; avgScore100: number | null;
  avgRank50: number | null; avgRank100: number | null;
}) => (
  <div className="grid grid-cols-3 gap-2">
    <Card className="border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/20">
      <CardContent className="p-2 flex flex-col items-center text-center gap-0.5">
        <span className="text-[10px] text-muted-foreground leading-tight">Total Exam Attended</span>
        <span className="text-base font-bold text-blue-600 leading-tight">{totalAttended}</span>
      </CardContent>
    </Card>
    <Card className="border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20">
      <CardContent className="p-2 flex flex-col items-center text-center gap-0.5">
        <span className="text-[10px] text-muted-foreground leading-tight">Your Average Score</span>
        <span className="text-xs font-bold text-emerald-600 leading-tight">
          {avgScore50 !== null ? `${avgScore50.toFixed(1)}/50` : "-"} · {avgScore100 !== null ? `${avgScore100.toFixed(1)}/100` : "-"}
        </span>
      </CardContent>
    </Card>
    <Card className="border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20">
      <CardContent className="p-2 flex flex-col items-center text-center gap-0.5">
        <span className="text-[10px] text-muted-foreground leading-tight">Your Average Rank</span>
        <span className="text-xs font-bold text-amber-600 leading-tight">
          {avgRank50 !== null ? `#${avgRank50.toFixed(1)}` : "-"} (50) · {avgRank100 !== null ? `#${avgRank100.toFixed(1)}` : "-"} (100)
        </span>
      </CardContent>
    </Card>
  </div>
);

const CompactTrendGraph = ({ data, title }: { data: { name: string; fullTitle: string; date: string; score: number; total: number | null }[]; title: string }) => {
  if (data.length === 0) {
    return (
      <Card className="shadow-sm border">
        <CardContent className="py-6 text-center text-xs text-muted-foreground">
          No attempts in this range.
        </CardContent>
      </Card>
    );
  }

  // Find the point with the highest percentage (score/total) to highlight on the graph
  let bestIndex = -1;
  let bestPct = -1;
  data.forEach((d, i) => {
    if (d.total && d.total > 0) {
      const pct = d.score / d.total;
      if (pct > bestPct) { bestPct = pct; bestIndex = i; }
    }
  });

  const HighlightDot = (props: any) => {
    const { cx, cy, index } = props;
    if (index === bestIndex) {
      return (
        <g>
          <circle cx={cx} cy={cy} r={7} fill="#f59e0b" stroke="#fff" strokeWidth={2} />
          <circle cx={cx} cy={cy} r={2.5} fill="#fff" />
        </g>
      );
    }
    return <circle cx={cx} cy={cy} r={3} strokeWidth={1} fill="#fff" stroke="#2563eb" />;
  };

  return (
    <Card className="shadow-sm border">
      <CardHeader className="py-2 px-3">
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="h-[180px] px-2 pb-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} tickMargin={6} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={35} domain={[0, (dataMax: number) => Math.max(200, dataMax)]} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload;
                  const isBest = d === data[bestIndex];
                  return (
                    <div className="bg-background border rounded-lg shadow-lg p-2 text-xs">
                      <p className="font-bold mb-0.5">{d.fullTitle} {isBest && <span className="text-amber-500">🏆 Best</span>}</p>
                      <p className="text-muted-foreground mb-1">{label}</p>
                      <p className="font-semibold text-primary">Score: {d.score} / {d.total}</p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Line type="monotone" dataKey="score" stroke="#2563eb" strokeWidth={2} dot={<HighlightDot />} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

const getLiveStatus = (exam: AnalyticsExam) => {
    if (exam.live_attempt) return exam.live_attempt.score;
    const now = new Date();
    if (exam.time_window_end) {
        const endTime = new Date(exam.time_window_end);
        if (now > endTime) return "Absent";
    }
    return "-";
};

const getPracticeStatus = (exam: AnalyticsExam) => {
    if (exam.practice_attempt) return exam.practice_attempt.score;
    return "Absent"; // Per user request
};

const CourseTable = ({ courseName, exams }: { courseName?: string, exams: AnalyticsExam[] }) => {
  const currentExams = exams;

  // Summary Calculations
  const liveStats = exams.reduce((acc, exam) => {
      const status = getLiveStatus(exam);
      if (typeof status === 'number') {
          acc.obtained += status;
          acc.total += exam.total_marks || 0;
      } else if (status === "Absent") {
           acc.total += exam.total_marks || 0;
      }
      return acc;
  }, { obtained: 0, total: 0 });

  const practiceStats = exams.reduce((acc, exam) => {
       acc.total += exam.total_marks || 0;
       if (exam.practice_attempt) {
           acc.obtained += Number(exam.practice_attempt.score) || 0;
       }
       return acc;
  }, { obtained: 0, total: 0 });


  return (
    <div className="space-y-4">
      {courseName && (
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-foreground border-l-4 border-primary pl-3">
            {courseName}
          </h2>
          <span className="text-sm text-muted-foreground bg-muted px-2 py-1 rounded">
              {exams.length} Exams
          </span>
        </div>
      )}

      {/* Desktop View */}
      <div className="hidden md:block rounded-md border bg-card overflow-hidden shadow-sm">
        <Table className="text-sm">
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
              <TableHead className="w-[30%] py-2 text-xs font-semibold">Exam Name</TableHead>
              <TableHead className="py-2 text-xs font-semibold whitespace-nowrap">Date</TableHead>

              <TableHead className="py-2 text-xs font-semibold text-right whitespace-nowrap">Live Mark</TableHead>
              <TableHead className="py-2 text-xs font-semibold text-right whitespace-nowrap">Rank</TableHead>

              <TableHead className="py-2 text-xs font-semibold text-right whitespace-nowrap">Prac Mark</TableHead>
              <TableHead className="py-2 text-xs font-semibold text-right whitespace-nowrap">Rank</TableHead>

              <TableHead className="py-2 text-xs font-semibold text-right whitespace-nowrap">Top (Live)</TableHead>
              <TableHead className="py-2 text-xs font-semibold text-right whitespace-nowrap">Top (Prac)</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {currentExams.map((item) => {
              const liveStatus = getLiveStatus(item);
              const practiceStatus = getPracticeStatus(item);

              return (
              <TableRow key={item.id} className="hover:bg-muted/50 transition-colors">
                <TableCell className="py-2 font-medium">
                  <div className="line-clamp-2 leading-tight" title={item.title}>
                    {item.title}
                  </div>
                </TableCell>
                <TableCell className="py-2 whitespace-nowrap">
                  {new Date(item.time_window_start || item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  <span className="text-[10px] text-muted-foreground block">
                     {new Date(item.time_window_start || item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </TableCell>

                {/* Live Mark Column */}
                <TableCell className="py-2 text-right font-bold whitespace-nowrap">
                  {liveStatus === "Absent" ? (
                      <span className="text-red-500 font-medium text-xs">Absent</span>
                  ) : liveStatus === "-" ? (
                      <span className="text-muted-foreground">-</span>
                  ) : (
                      <span>{liveStatus} <span className="text-muted-foreground text-[10px] font-normal">/ {item.total_marks}</span></span>
                  )}
                </TableCell>

                {/* Live Rank */}
                <TableCell className="py-2 text-right font-mono whitespace-nowrap">
                    {item.live_attempt?.rank ? (
                        <span className="inline-flex items-center justify-center h-5 px-2 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                            #{item.live_attempt.rank}
                        </span>
                    ) : (
                        <span className="text-muted-foreground/30">-</span>
                    )}
                </TableCell>

                 {/* Practice Mark Column */}
                 <TableCell className="py-2 text-right font-bold whitespace-nowrap">
                  {practiceStatus === "Absent" ? (
                      <span className="text-muted-foreground/50 font-normal text-xs">Absent</span>
                  ) : (
                      <span>{practiceStatus} <span className="text-muted-foreground text-[10px] font-normal">/ {item.total_marks}</span></span>
                  )}
                </TableCell>

                {/* Practice Rank */}
                <TableCell className="py-2 text-right font-mono whitespace-nowrap">
                    {item.practice_attempt?.rank ? (
                        <span className="inline-flex items-center justify-center h-5 px-2 rounded-full bg-secondary text-secondary-foreground text-[10px] font-bold">
                            #{item.practice_attempt.rank}
                        </span>
                    ) : (
                        <span className="text-muted-foreground/30">-</span>
                    )}
                </TableCell>

                <TableCell className="py-2 text-right text-muted-foreground whitespace-nowrap font-mono text-xs">
                  {item.highest_live_score !== null ? item.highest_live_score : "-"}
                </TableCell>
                <TableCell className="py-2 text-right text-muted-foreground whitespace-nowrap font-mono text-xs">
                  {item.highest_practice_score !== null ? item.highest_practice_score : "-"}
                </TableCell>
              </TableRow>
            )})}
          </TableBody>
          <TableFooter>
            <TableRow className="bg-primary/5 hover:bg-primary/10">
                <TableCell colSpan={2} className="py-2 font-bold text-primary text-xs">Summary</TableCell>
                <TableCell className="py-2 text-right font-bold text-primary whitespace-nowrap text-xs">
                    {liveStats.obtained} / {liveStats.total}
                </TableCell>
                <TableCell className="py-2 text-right font-bold text-primary whitespace-nowrap text-xs">
                    -
                </TableCell>
                <TableCell className="py-2 text-right font-bold text-primary whitespace-nowrap text-xs">
                    {practiceStats.obtained} / {practiceStats.total}
                </TableCell>
                <TableCell colSpan={3} />
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      {/* Mobile Cards View */}
      <div className="md:hidden space-y-3">
        {currentExams.map((item) => {
             const liveStatus = getLiveStatus(item);
             const practiceStatus = getPracticeStatus(item);
             return (
                 <Card key={item.id} className="text-sm shadow-sm border-2 border-green-500/20">
                     <CardContent className="p-3 space-y-3">
                         <div className="flex justify-between items-start gap-2">
                             <div className="font-semibold leading-tight">{item.title}</div>
                             <div className="text-[10px] text-muted-foreground whitespace-nowrap text-right">
                                 <div>{new Date(item.time_window_start || item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</div>
                                 <div>{new Date(item.time_window_start || item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                             </div>
                         </div>

                         <div className="grid grid-cols-2 gap-2 text-xs">
                             <div className="space-y-1 bg-muted/30 p-2 rounded">
                                 <div className="font-semibold text-muted-foreground flex items-center gap-1">Live <span className="ml-auto text-[10px] font-normal opacity-70">Top: {item.highest_live_score ?? '-'}</span></div>
                                 <div className="flex justify-between items-center">
                                     <span className={liveStatus === "Absent" ? "text-red-500 font-medium" : "font-bold"}>
                                         {liveStatus === "Absent" ? "Absent" : liveStatus === "-" ? "-" : `${liveStatus}/${item.total_marks}`}
                                     </span>
                                     {item.live_attempt?.rank && (
                                         <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded-full text-[10px] font-bold">#{item.live_attempt.rank}</span>
                                     )}
                                 </div>
                             </div>

                             <div className="space-y-1 bg-muted/30 p-2 rounded">
                                 <div className="font-semibold text-muted-foreground flex items-center gap-1">Practice <span className="ml-auto text-[10px] font-normal opacity-70">Top: {item.highest_practice_score ?? '-'}</span></div>
                                 <div className="flex justify-between items-center">
                                      <span className={practiceStatus === "Absent" ? "text-muted-foreground/50" : "font-bold"}>
                                         {practiceStatus === "Absent" ? "Absent" : `${practiceStatus}/${item.total_marks}`}
                                     </span>
                                     {item.practice_attempt?.rank && (
                                         <span className="bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded-full text-[10px] font-bold">#{item.practice_attempt.rank}</span>
                                     )}
                                 </div>
                             </div>
                         </div>
                     </CardContent>
                 </Card>
             );
        })}
      </div>
    </div>
  );
};

const filterByRange = <T,>(items: T[], getDate: (item: T) => Date, range: RangeKey): T[] => {
  const rangeDef = DAY_RANGES.find(r => r.key === range);
  if (!rangeDef || rangeDef.days === null) return items;
  const cutoff = new Date();
  if (rangeDef.days === 0) {
    cutoff.setHours(0, 0, 0, 0); // "আজকে" = since start of today
  } else {
    cutoff.setDate(cutoff.getDate() - rangeDef.days);
  }
  return items.filter(item => getDate(item) >= cutoff);
};

const RoutinewiseReport = ({ analyticsData, isLoading }: { analyticsData: AnalyticsExam[] | null | undefined; isLoading: boolean }) => {
  const [range, setRange] = useState<RangeKey>("total");

  const rangedData = useMemo(() => {
    if (!analyticsData) return [];
    return filterByRange(analyticsData, e => new Date(e.time_window_start || e.created_at), range);
  }, [analyticsData, range]);

  const graphData = useMemo(() => {
    return rangedData
      .slice()
      .sort((a, b) => new Date(a.time_window_start || a.created_at).getTime() - new Date(b.time_window_start || b.created_at).getTime())
      .map(exam => {
        let score = null;
        if (exam.live_attempt) score = Number(exam.live_attempt.score);
        else if (exam.practice_attempt) score = Number(exam.practice_attempt.score);
        if (score === null) return null;
        return {
          name: exam.title.length > 15 ? exam.title.slice(0, 15) + "..." : exam.title,
          fullTitle: exam.title,
          date: new Date(exam.time_window_start || exam.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' }),
          score,
          total: exam.total_marks,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [rangedData]);

  // For averages: one row per exam, preferring live score, else practice.
  // If a user has both a normal + 2nd-timer style repeat resulting in multiple
  // attempts feeding into live_attempt (the RPC already picks the stored score),
  // we just use whatever the RPC surfaced (it reflects the recorded/kept score).
  const scoredRows = useMemo(() => {
    return rangedData
      .map(exam => {
        const attempt = exam.live_attempt || exam.practice_attempt;
        if (!attempt) return null;
        return { score: Number(attempt.score), total_marks: exam.total_marks, rank: attempt.rank ?? null };
      })
      .filter((r): r is ScoredItem => r !== null);
  }, [rangedData]);

  const averages = useMemo(() => computeAverages(scoredRows), [scoredRows]);

  const allExamsSorted = useMemo(() => {
    return rangedData.slice().sort((a, b) => new Date(b.time_window_start || b.created_at).getTime() - new Date(a.time_window_start || a.created_at).getTime());
  }, [rangedData]);

  const totalExams = rangedData.length;

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading analysis...</p>;

  if (!analyticsData || analyticsData.length === 0) {
    return (
      <Card className="border border-foreground/60">
        <CardContent className="pt-6 text-center text-sm text-muted-foreground">
          No exams found available for you.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <DayRangeSelector value={range} onChange={setRange} />
      <CompactTrendGraph data={graphData} title="Performance Trend" />
      <StatBoxRow
        totalAttended={scoredRows.length}
        avgScore50={averages.avgScore50}
        avgScore100={averages.avgScore100}
        avgRank50={averages.avgRank50}
        avgRank100={averages.avgRank100}
      />
      {totalExams === 0 ? (
        <Card className="border border-foreground/60">
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            No exams in this range.
          </CardContent>
        </Card>
      ) : (
        <CourseTable exams={allExamsSorted} />
      )}
    </div>
  );
};

const ReadymadeReport = ({ user }: { user: any }) => {
  const [range, setRange] = useState<RangeKey>("total");

  const { data: readymadeData, isLoading } = useQuery({
    queryKey: ["readymade-exam-analytics-rpc-v1", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase.rpc('get_student_readymade_exam_analytics' as any);
      if (error) {
        console.error("Error fetching readymade analytics:", error);
        throw error;
      }
      return (data as any) as ReadymadeAttempt[];
    },
    enabled: !!user,
  });

  const rangedData = useMemo(() => {
    if (!readymadeData) return [];
    return filterByRange(readymadeData, r => new Date(r.attempt_date), range);
  }, [readymadeData, range]);

  const sortedRangedData = useMemo(() => {
    return rangedData.slice().sort((a, b) => new Date(b.attempt_date).getTime() - new Date(a.attempt_date).getTime());
  }, [rangedData]);

  const graphData = useMemo(() => {
    return rangedData
      .slice()
      .sort((a, b) => new Date(a.attempt_date).getTime() - new Date(b.attempt_date).getTime())
      .map(r => ({
        name: r.title.length > 15 ? r.title.slice(0, 15) + "..." : r.title,
        fullTitle: r.title,
        date: new Date(r.attempt_date).toLocaleDateString([], { month: 'short', day: 'numeric' }),
        score: Number(r.score),
        total: r.total_marks,
      }));
  }, [rangedData]);

  const scoredRows = useMemo(() => {
    return rangedData.map(r => ({ score: Number(r.score), total_marks: r.total_marks, rank: r.rank }));
  }, [rangedData]);

  const averages = useMemo(() => computeAverages(scoredRows), [scoredRows]);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading analysis...</p>;

  if (!readymadeData || readymadeData.length === 0) {
    return (
      <Card className="border border-foreground/60">
        <CardContent className="pt-6 text-center text-sm text-muted-foreground">
          এখনো কোনো Readymade Exam attempt করা হয়নি।
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <DayRangeSelector value={range} onChange={setRange} />
      <CompactTrendGraph data={graphData} title="Readymade Performance Trend" />
      <StatBoxRow
        totalAttended={scoredRows.length}
        avgScore50={averages.avgScore50}
        avgScore100={averages.avgScore100}
        avgRank50={averages.avgRank50}
        avgRank100={averages.avgRank100}
      />
      {sortedRangedData.length === 0 ? (
        <Card className="border border-foreground/60">
          <CardContent className="pt-6 text-center text-sm text-muted-foreground">
            No attempts in this range.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sortedRangedData.map(item => (
            <Card key={item.attempt_id} className="shadow-sm border">
              <CardContent className="p-3 flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-sm leading-tight line-clamp-1">{item.title}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    {new Date(item.attempt_date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                    {" · "}
                    {new Date(item.attempt_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <div className="text-right whitespace-nowrap">
                  <div className="font-bold text-sm">{item.score} <span className="text-[10px] text-muted-foreground font-normal">/ {item.total_marks}</span></div>
                  <span className="inline-flex items-center justify-center h-5 px-2 mt-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
                    #{item.rank} / {item.total_participants}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

const ExamAnalytics = () => {
  const { user } = useAuth();

  useEffect(() => {
    document.title = "Exam Analytics – Atlas";
  }, []);

  const { data: analyticsData, isLoading } = useQuery({
    queryKey: ["exam-analytics-rpc-v1", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase.rpc('get_student_exam_analytics');
      if (error) {
        console.error("Error fetching analytics:", error);
        throw error;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data as any) as AnalyticsExam[];
    },
    enabled: !!user,
  });

  return (
    <section className="space-y-6 pb-10 overflow-x-hidden max-w-full">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Exam Analysis Report</h1>
        <p className="text-sm text-muted-foreground">
          Comprehensive course-wise performance analysis.
        </p>
      </header>

      <Tabs defaultValue="routinewise" className="space-y-4">
        <TabsList className="w-full grid grid-cols-2 h-auto">
          <TabsTrigger value="routinewise" className="text-[11px] xs:text-xs sm:text-sm px-1 py-2 whitespace-pre-line leading-tight">Routinewise Exam Report</TabsTrigger>
          <TabsTrigger value="readymade" className="text-[11px] xs:text-xs sm:text-sm px-1 py-2 whitespace-pre-line leading-tight">ReadyMade Exam Report</TabsTrigger>
        </TabsList>
        <TabsContent value="routinewise">
          <RoutinewiseReport analyticsData={analyticsData} isLoading={isLoading} />
        </TabsContent>
        <TabsContent value="readymade">
          <ReadymadeReport user={user} />
        </TabsContent>
      </Tabs>
    </section>
  );
};

export default ExamAnalytics;
