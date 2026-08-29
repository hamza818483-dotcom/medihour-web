import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { Video, History, Archive, Clock } from "lucide-react";
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

type ClassCategoryKey = "live" | "record" | "archive";

const CLASS_CATEGORIES: { key: ClassCategoryKey; label: string; icon: typeof Video }[] = [
  { key: "live", label: "Live Class", icon: Video },
  { key: "record", label: "Record Class", icon: History },
  { key: "archive", label: "Archive Class", icon: Archive },
];

// Row shape returned by the get_my_class_report RPC.
type ClassReportRow = {
  class_id: string;
  class_title: string;
  category: ClassCategoryKey;
  course_name: string | null;
  class_start_at: string | null;
  total_watched_seconds: number;
  last_watched_at: string;
  rank: number;
  total_participants: number;
};

const CategorySelector = ({ value, onChange }: { value: ClassCategoryKey; onChange: (v: ClassCategoryKey) => void }) => (
  <div className="grid grid-cols-3 gap-2">
    {CLASS_CATEGORIES.map(({ key, label, icon: Icon }) => (
      <button
        key={key}
        type="button"
        onClick={() => onChange(key)}
        className={cn(
          "flex flex-col items-center justify-center gap-1 h-14 rounded-lg border-2 px-2 text-xs font-semibold text-center transition-colors",
          value === key
            ? "border-primary bg-primary/10 text-primary"
            : "border-border text-muted-foreground hover:border-primary/40"
        )}
      >
        <Icon className="h-4 w-4 flex-shrink-0" />
        <span className="leading-tight">{label}</span>
      </button>
    ))}
  </div>
);

const StatBoxRow = ({
  totalAttended,
  avgWatchMinutes,
  avgRank,
}: {
  totalAttended: number;
  avgWatchMinutes: number | null;
  avgRank: number | null;
}) => (
  <div className="grid grid-cols-3 gap-2">
    <Card className="border-blue-500/30 bg-blue-50/50 dark:bg-blue-950/20">
      <CardContent className="p-2 flex flex-col items-center text-center gap-0.5">
        <span className="text-[10px] text-muted-foreground leading-tight">Total Class Attended</span>
        <span className="text-base font-bold text-blue-600 leading-tight">{totalAttended}</span>
      </CardContent>
    </Card>
    <Card className="border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20">
      <CardContent className="p-2 flex flex-col items-center text-center gap-0.5">
        <span className="text-[10px] text-muted-foreground leading-tight">Avg. Watch Duration</span>
        <span className="text-xs font-bold text-emerald-600 leading-tight">
          {avgWatchMinutes !== null ? `${avgWatchMinutes.toFixed(0)} min` : "-"}
        </span>
      </CardContent>
    </Card>
    <Card className="border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20">
      <CardContent className="p-2 flex flex-col items-center text-center gap-0.5">
        <span className="text-[10px] text-muted-foreground leading-tight">Your Average Rank</span>
        <span className="text-xs font-bold text-amber-600 leading-tight">
          {avgRank !== null ? `#${avgRank.toFixed(1)}` : "-"}
        </span>
      </CardContent>
    </Card>
  </div>
);

const CompactTrendGraph = ({
  data,
  title,
}: {
  data: { name: string; fullTitle: string; date: string; watched: number; total: number | null }[];
  title: string;
}) => {
  if (data.length === 0) {
    return (
      <Card className="shadow-sm border">
        <CardContent className="py-6 text-center text-xs text-muted-foreground">
          No class activity in this range.
        </CardContent>
      </Card>
    );
  }

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
            <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={35} />
            <Tooltip
              content={({ active, payload, label }) => {
                if (active && payload && payload.length) {
                  const d = payload[0].payload;
                  return (
                    <div className="bg-background border rounded-lg shadow-lg p-2 text-xs">
                      <p className="font-bold mb-0.5">{d.fullTitle}</p>
                      <p className="text-muted-foreground mb-1">{label}</p>
                      <p className="font-semibold text-primary">
                        Watched: {d.watched} min{d.total ? ` / ${d.total} min` : ""}
                      </p>
                    </div>
                  );
                }
                return null;
              }}
            />
            <Line type="monotone" dataKey="watched" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

const ClassRecordCard = ({ item }: { item: ClassReportRow }) => {
  const watchedMinutes = Math.round(item.total_watched_seconds / 60);
  const lastWatched = new Date(item.last_watched_at);
  return (
    <Card className="shadow-sm border">
      <CardContent className="p-3 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-sm leading-tight line-clamp-1">{item.class_title}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {lastWatched.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
            {" · "}
            {lastWatched.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
        <div className="text-right whitespace-nowrap">
          <div className="font-bold text-sm flex items-center gap-1 justify-end">
            <Clock className="h-3 w-3 text-muted-foreground" />
            {watchedMinutes} <span className="text-[10px] text-muted-foreground font-normal">min</span>
          </div>
          <span className="inline-flex items-center justify-center h-5 px-2 mt-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
            #{item.rank} / {item.total_participants}
          </span>
        </div>
      </CardContent>
    </Card>
  );
};

const filterByRange = (items: ClassReportRow[], range: RangeKey): ClassReportRow[] => {
  const rangeDef = DAY_RANGES.find((r) => r.key === range);
  if (!rangeDef || rangeDef.days === null) return items;
  const cutoff = new Date();
  if (rangeDef.days === 0) {
    cutoff.setHours(0, 0, 0, 0); // "আজকে" = since start of today
  } else {
    cutoff.setDate(cutoff.getDate() - rangeDef.days);
  }
  return items.filter((item) => new Date(item.last_watched_at) >= cutoff);
};

const CategoryReport = ({ category, allRows, isLoading }: { category: ClassCategoryKey; allRows: ClassReportRow[] | null | undefined; isLoading: boolean }) => {
  const [range, setRange] = useState<RangeKey>("total");

  const categoryRows = useMemo(() => (allRows ?? []).filter((r) => r.category === category), [allRows, category]);

  const rangedRows = useMemo(() => filterByRange(categoryRows, range), [categoryRows, range]);

  const sortedRows = useMemo(
    () => rangedRows.slice().sort((a, b) => new Date(b.last_watched_at).getTime() - new Date(a.last_watched_at).getTime()),
    [rangedRows]
  );

  const graphData = useMemo(() => {
    return rangedRows
      .slice()
      .sort((a, b) => new Date(a.last_watched_at).getTime() - new Date(b.last_watched_at).getTime())
      .map((r) => ({
        name: r.class_title.length > 15 ? r.class_title.slice(0, 15) + "..." : r.class_title,
        fullTitle: r.class_title,
        date: new Date(r.last_watched_at).toLocaleDateString([], { month: "short", day: "numeric" }),
        watched: Math.round(r.total_watched_seconds / 60),
        total: null,
      }));
  }, [rangedRows]);

  const avgWatchMinutes = useMemo(() => {
    if (rangedRows.length === 0) return null;
    const totalMin = rangedRows.reduce((sum, r) => sum + r.total_watched_seconds / 60, 0);
    return totalMin / rangedRows.length;
  }, [rangedRows]);

  const avgRank = useMemo(() => {
    if (rangedRows.length === 0) return null;
    const totalRank = rangedRows.reduce((sum, r) => sum + r.rank, 0);
    return totalRank / rangedRows.length;
  }, [rangedRows]);

  const categoryLabel = CLASS_CATEGORIES.find((c) => c.key === category)?.label ?? "";

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading...</p>;

  return (
    <div className="space-y-4">
      <DayRangeSelector value={range} onChange={setRange} />
      <CompactTrendGraph data={graphData} title={`${categoryLabel} Watch Trend`} />
      <StatBoxRow totalAttended={rangedRows.length} avgWatchMinutes={avgWatchMinutes} avgRank={avgRank} />
      {sortedRows.length === 0 ? (
        <Card className="border border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            এই পরিসরে কোনো {categoryLabel} watch activity নেই।
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {sortedRows.map((item) => (
            <ClassRecordCard key={`${item.class_id}-${item.category}`} item={item} />
          ))}
        </div>
      )}
    </div>
  );
};

const ClassReport = () => {
  const { user } = useAuth();
  const [category, setCategory] = useState<ClassCategoryKey>("live");

  const { data: allRows, isLoading } = useQuery({
    queryKey: ["my-class-report", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase.rpc("get_my_class_report" as any);
      if (error) {
        console.error("Error fetching class report:", error);
        throw error;
      }
      return (data as any) as ClassReportRow[];
    },
    enabled: !!user,
  });

  return (
    <div className="space-y-4">
      <CategorySelector value={category} onChange={setCategory} />
      <CategoryReport category={category} allRows={allRows} isLoading={isLoading} />
    </div>
  );
};

export default ClassReport;
