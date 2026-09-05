import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trophy, Star, Scale, Loader2, Clock, BookOpen, Flame, Timer, CalendarCheck } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

const PERIODS = [
  { key: 0, label: "আজকে" },
  { key: 3, label: "৩ দিন" },
  { key: 7, label: "৭ দিন" },
  { key: 15, label: "১৫ দিন" },
  { key: 30, label: "৩০ দিন" },
];

type Performer = {
  profile_id: string;
  full_name: string;
  avatar_url: string | null;
  exam_count: number;
  avg_score_pct: number;
  avg_seconds_per_question: number | null;
  class_watch_seconds: number;
  focus_seconds: number;
  active_days: number;
  composite_score: number;
  rank_position: number;
};

const fmtDuration = (totalSeconds: number) => {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h > 0) return `${h}ঘ ${m}মি`;
  return `${m}মি`;
};

const PodiumItem = ({ student, rank, color, height, glowColor, zIndex, CrownIcon }: { student?: Performer; rank: number; color: string; height: string; glowColor: string; zIndex: number; CrownIcon?: boolean }) => {
  if (!student) return <div className="w-24 sm:w-32 hidden md:block" />;
  return (
    <div className="flex flex-col items-center justify-end mx-0.5 sm:mx-1.5 md:mx-2" style={{ zIndex }}>
      <div className="relative mb-1.5 flex flex-col items-center group">
        {CrownIcon && (
          <div className="absolute -top-5 text-yellow-400 drop-shadow-md z-20 animate-bounce">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.956-.734L2.02 6.02a.5.5 0 0 1 .798-.518l4.276 3.664a1 1 0 0 0 1.516-.294z" /></svg>
          </div>
        )}
        <div className={`relative p-0.5 rounded-lg bg-gradient-to-br ${color} shadow-md transition-transform duration-300 group-hover:scale-110`}>
          <Avatar className="w-11 h-11 sm:w-14 sm:h-14 lg:w-16 lg:h-16 rounded-md border-2 border-background bg-background shadow-inner">
            <AvatarImage src={student.avatar_url || undefined} className="rounded-md" />
            <AvatarFallback className="rounded-md text-sm font-bold bg-muted text-foreground">
              {student.full_name?.slice(0, 2)?.toUpperCase() || "??"}
            </AvatarFallback>
          </Avatar>
          <div className={`absolute -bottom-2 left-1/2 transform -translate-x-1/2 px-2 py-0.5 rounded-full text-[10px] font-bold text-white shadow-md whitespace-nowrap bg-gradient-to-r ${color}`}>
            {student.composite_score.toFixed(0)} pts
          </div>
        </div>
      </div>
      <div className="text-center mb-1.5 max-w-[90px] sm:max-w-[120px]">
        <div className="font-bold text-xs sm:text-sm text-foreground leading-tight break-words drop-shadow-sm" title={student.full_name}>
          {student.full_name || "Unknown"}
        </div>
      </div>
      <div
        className={`w-16 sm:w-20 lg:w-24 rounded-t-lg relative flex items-start justify-center pt-2 sm:pt-3 transition-all duration-500 hover:brightness-110 overflow-hidden text-white shadow-[0_-5px_25px_-5px_rgba(0,0,0,0.1)] bg-gradient-to-b ${color}`}
        style={{ height, boxShadow: `0 -5px 25px -5px ${glowColor}` }}
      >
        <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent pointer-events-none" />
        <span className="font-black text-xl sm:text-2xl lg:text-4xl drop-shadow-md z-10 opacity-90">{rank}</span>
      </div>
    </div>
  );
};

const Podium = ({ topThree }: { topThree: Performer[] }) => {
  if (!topThree || topThree.length === 0) return null;
  const [first, second, third] = topThree;
  return (
    <div className="relative flex justify-center items-end pt-6 pb-1 px-2 mb-1 bg-gradient-to-t from-slate-100/50 to-transparent dark:from-slate-900/50 rounded-xl mx-auto overflow-hidden">
      <div className="absolute top-6 left-8 text-yellow-300 opacity-50"><Star size={16} fill="currentColor" /></div>
      <div className="absolute top-10 right-10 text-blue-300 opacity-40"><Star size={12} fill="currentColor" /></div>
      <div className="absolute top-3 right-1/4 text-blue-300 opacity-60"><Star size={14} fill="currentColor" /></div>
      <PodiumItem student={second} rank={2} color="from-slate-400 to-slate-500" glowColor="rgba(148, 163, 184, 0.5)" height="70px" zIndex={20} />
      <PodiumItem student={first} rank={1} color="from-yellow-400 to-amber-500" glowColor="rgba(250, 204, 21, 0.6)" height="95px" zIndex={30} CrownIcon />
      <PodiumItem student={third} rank={3} color="from-orange-400 to-orange-600" glowColor="rgba(249, 115, 22, 0.5)" height="55px" zIndex={10} />
    </div>
  );
};

const CompareDialog = ({ open, onOpenChange, a, b }: { open: boolean; onOpenChange: (v: boolean) => void; a: Performer | null; b: Performer | null }) => {
  if (!a || !b) return null;
  const rows: [string, any, (p: Performer) => string | number][] = [
    ["মোট পয়েন্ট", Trophy, (p) => p.composite_score.toFixed(1)],
    ["এক্সাম সংখ্যা", BookOpen, (p) => p.exam_count],
    ["গড় মার্ক %", Star, (p) => `${p.avg_score_pct}%`],
    ["প্রশ্নপ্রতি গড় সময়", Clock, (p) => (p.avg_seconds_per_question ? `${p.avg_seconds_per_question}s` : "—")],
    ["ক্লাস দেখার সময়", Timer, (p) => fmtDuration(p.class_watch_seconds)],
    ["ফোকাস টাইমার", Flame, (p) => fmtDuration(p.focus_seconds)],
    ["একটিভ দিন", CalendarCheck, (p) => p.active_days],
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Scale className="h-4 w-4" /> বিস্তারিত তুলনা</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-center mb-2">
          <div>
            <Avatar className="h-10 w-10 mx-auto mb-1">
              <AvatarImage src={a.avatar_url || undefined} />
              <AvatarFallback>{a.full_name?.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <p className="text-xs font-semibold truncate">{a.full_name}</p>
            <Badge variant="secondary" className="text-[10px]">Rank #{a.rank_position}</Badge>
          </div>
          <div>
            <Avatar className="h-10 w-10 mx-auto mb-1">
              <AvatarImage src={b.avatar_url || undefined} />
              <AvatarFallback>{b.full_name?.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <p className="text-xs font-semibold truncate">{b.full_name}</p>
            <Badge variant="secondary" className="text-[10px]">Rank #{b.rank_position}</Badge>
          </div>
        </div>
        <div className="space-y-1 divide-y">
          {rows.map(([label, Icon, getVal]) => (
            <div key={label} className="grid grid-cols-3 items-center py-1.5 text-xs">
              <span className={`text-right font-semibold ${getVal(a) === getVal(b) ? "" : (Number(String(getVal(a)).replace(/[^0-9.-]/g, "")) > Number(String(getVal(b)).replace(/[^0-9.-]/g, "")) ? "text-emerald-600" : "text-muted-foreground")}`}>{getVal(a)}</span>
              <span className="text-center text-muted-foreground flex items-center justify-center gap-1"><Icon className="h-3 w-3" />{label}</span>
              <span className={`text-left font-semibold ${getVal(a) === getVal(b) ? "" : (Number(String(getVal(b)).replace(/[^0-9.-]/g, "")) > Number(String(getVal(a)).replace(/[^0-9.-]/g, "")) ? "text-emerald-600" : "text-muted-foreground")}`}>{getVal(b)}</span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const DetailDialog = ({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) => {
  const { data, isLoading } = useQuery({
    queryKey: ["my-performance-detail"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_performance_detail" as any);
      if (error) throw error;
      return data as any;
    },
    enabled: open,
  });

  const graphData = (data?.daily_activity || []).map((d: any) => ({
    date: new Date(d.date).toLocaleDateString("bn-BD", { day: "2-digit", month: "short" }),
    exams: d.exams,
    classMin: Math.round((d.class_seconds || 0) / 60),
    focusMin: Math.round((d.focus_seconds || 0) / 60),
  }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>বিস্তারিত পারফরম্যান্স রিপোর্ট</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(data?.summaries || []).map((s: any) => (
                <Card key={s.days} className="border-muted">
                  <CardContent className="p-2.5 space-y-1">
                    <p className="text-[11px] font-bold text-primary">{s.days === 0 ? "আজকে" : `বিগত ${s.days} দিন`}</p>
                    <p className="text-[9px] text-muted-foreground">
                      {s.days === 0
                        ? new Date(s.period_start).toLocaleDateString("bn-BD", { day: "2-digit", month: "long", year: "numeric" })
                        : `${new Date(s.period_start).toLocaleDateString("bn-BD", { day: "2-digit", month: "long", year: "numeric" })} – ${new Date(s.period_end).toLocaleDateString("bn-BD", { day: "2-digit", month: "long", year: "numeric" })}`}
                    </p>
                    <div className="text-[10px] space-y-0.5 pt-1">
                      <p>এক্সাম: <b>{s.exam_count}</b></p>
                      <p>গড় মার্ক: <b>{s.avg_score_pct ?? 0}%</b></p>
                      <p>ক্লাস: <b>{fmtDuration(s.class_watch_seconds)}</b></p>
                      <p>ফোকাস: <b>{fmtDuration(s.focus_seconds)}</b></p>
                      <p>একটিভ দিন: <b>{s.active_days}</b></p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div>
              <p className="text-sm font-semibold mb-2">বিগত ৯০ দিনের একটিভিটি গ্রাফ</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={graphData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={Math.floor(graphData.length / 8)} />
                  <YAxis tick={{ fontSize: 9 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="exams" name="এক্সাম" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="classMin" name="ক্লাস (মিনিট)" stroke="#3b82f6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="focusMin" name="ফোকাস (মিনিট)" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const TopPerformer = () => {
  const { user } = useAuth();
  const [period, setPeriod] = useState(30);
  const [compareTarget, setCompareTarget] = useState<Performer | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  useEffect(() => {
    document.title = "Top Performer – Atlas";
  }, []);

  const { data: performers, isLoading } = useQuery({
    queryKey: ["top-performers", period],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_top_performers" as any, { p_days: period });
      if (error) throw error;
      return (data || []) as Performer[];
    },
  });

  const myEntry = performers?.find((p) => p.profile_id === user?.id) || null;
  const topThree = performers?.slice(0, 3) || [];
  const rest = performers?.slice(3) || [];

  const periodStart = period <= 0 ? new Date() : new Date(Date.now() - period * 86400000);
  const fmtFullDate = (d: Date) => d.toLocaleDateString("bn-BD", { day: "2-digit", month: "long", year: "numeric" });
  const periodLabel = period <= 0
    ? fmtFullDate(new Date())
    : `${fmtFullDate(periodStart)} – ${fmtFullDate(new Date())}`;

  return (
    <div className="space-y-4 pb-10">
      <header className="space-y-0.5">
        <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" /> Top Performer
        </h1>
        <p className="text-xs text-muted-foreground">
          এক্সাম, ক্লাস, ফোকাস টাইমার ও নিয়মিততা মিলিয়ে সম্পূর্ণ সাইট-ওয়াইড র‍্যাঙ্কিং
        </p>
      </header>

      <Tabs value={String(period)} onValueChange={(v) => setPeriod(Number(v))}>
        <TabsList className="grid grid-cols-5 w-full">
          {PERIODS.map((p) => (
            <TabsTrigger key={p.key} value={String(p.key)} className="text-xs">{p.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <p className="text-[11px] text-center text-muted-foreground">{period <= 0 ? periodLabel : `${periodLabel} পর্যন্ত`}</p>

      {isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : !performers || performers.length === 0 ? (
        <Card className="border border-dashed">
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <Trophy className="h-10 w-10 text-yellow-500" />
            <p className="text-sm text-muted-foreground">এখনো কোনো একটিভিটি পাওয়া যায়নি।</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <Podium topThree={topThree} />

          <div className="space-y-2">
            {rest.map((p) => (
              <Card key={p.profile_id} className={p.profile_id === user?.id ? "border-primary/50 bg-primary/5" : ""}>
                <CardContent className="p-3 flex items-center gap-3">
                  <span className="text-sm font-bold text-muted-foreground w-6 text-center">#{p.rank_position}</span>
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={p.avatar_url || undefined} />
                    <AvatarFallback className="text-xs">{p.full_name?.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{p.full_name}</p>
                    <p className="text-[10px] text-muted-foreground">{p.exam_count} এক্সাম • গড় {p.avg_score_pct}% • {p.active_days} দিন একটিভ</p>
                  </div>
                  <Badge className="bg-primary/10 text-primary border-primary/30 text-[10px] shrink-0">{p.composite_score.toFixed(0)} pts</Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[10px] gap-1 shrink-0"
                    onClick={() => setCompareTarget(p)}
                  >
                    <Scale className="h-3 w-3" /> তুলনা করো
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {myEntry && (
            <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40">
              <Button className="shadow-lg gap-2" onClick={() => setDetailOpen(true)}>
                <BookOpen className="h-4 w-4" /> বিস্তারিত (আমার রিপোর্ট)
              </Button>
            </div>
          )}
        </>
      )}

      <CompareDialog
        open={!!compareTarget}
        onOpenChange={(v) => !v && setCompareTarget(null)}
        a={myEntry}
        b={compareTarget}
      />
      <DetailDialog open={detailOpen} onOpenChange={setDetailOpen} />
    </div>
  );
};

export default TopPerformer;
