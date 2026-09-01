import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BookOpen, Calendar, Coffee, Lightbulb, Moon } from "lucide-react";
import PublicHeader from "@/components/PublicHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

const BN_DAYS = ["রবি", "সোম", "মঙ্গল", "বুধ", "বৃহ", "শুক্র", "শনি"];
const BN_MONTHS = ["জানু", "ফেব্রু", "মার্চ", "এপ্রিল", "মে", "জুন", "জুলাই", "আগস্ট", "সেপ্ট", "অক্টো", "নভে", "ডিসে"];

function fmtHM(s: number) {
  s = Math.max(0, Math.round(s));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

interface DayRow {
  day: string; // yyyy-mm-dd
  study_seconds: number;
  break_seconds: number;
  sleep_seconds: number;
  breaks_used: number;
  session_count: number;
  is_ongoing: boolean;
}

const PERIODS = [
  { label: "আজকে", days: 1 },
  { label: "বিগত ৩ দিন", days: 3 },
  { label: "বিগত ৭ দিন", days: 7 },
  { label: "বিগত ১৫ দিন", days: 15 },
  { label: "বিগত ৩০ দিন", days: 30 },
  { label: "সবসময়", days: 0 },
];

const StudyHistory = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [periodDays, setPeriodDays] = useState(1);
  const [selectedDay, setSelectedDay] = useState<DayRow | null>(null);
  const [showAdvice, setShowAdvice] = useState(false);

  const { data: rows, isLoading, refetch: refetchHistory } = useQuery({
    queryKey: ["focus-history-daily"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("focus_history_daily" as any, { p_days: 0 });
      if (error) throw error;
      return ((data as unknown) || []) as DayRow[];
    },
    enabled: !!user,
    refetchInterval: (query) => {
      const data = query.state.data as DayRow[] | undefined;
      return data?.some((r) => r.is_ongoing) ? 6000 : false;
    },
    refetchOnWindowFocus: true,
  });

  // Re-sync immediately when the user comes back to this tab/page (e.g. from Focus Timer),
  // so the numbers here don't lag behind what's shown on the live timer screen.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refetchHistory();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refetchHistory]);

  const today = new Date().toISOString().slice(0, 10);

  const periodRows = useMemo(() => {
    if (!rows) return [];
    if (periodDays === 1) return rows.filter((r) => r.day === today);
    if (periodDays === 0) return rows;
    const since = new Date(Date.now() - (periodDays - 1) * 86400000).toISOString().slice(0, 10);
    return rows.filter((r) => r.day >= since);
  }, [rows, periodDays, today]);

  const periodTotals = useMemo(() => {
    const study = periodRows.reduce((a, r) => a + r.study_seconds, 0);
    const brk = periodRows.reduce((a, r) => a + r.break_seconds, 0);
    const slp = periodRows.reduce((a, r) => a + r.sleep_seconds, 0);
    return { study, brk, slp };
  }, [periodRows]);

  const periodLabel =
    periodDays === 1 ? "আজকে" : periodDays === 0 ? "সবসময়" : `বিগত ${periodDays} দিন`;

  // Last 7 days for the chart, always relative to today regardless of period filter
  const chartDays = useMemo(() => {
    const map = new Map((rows || []).map((r) => [r.day, r]));
    const days: { date: string; secs: number; isToday: boolean }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      const row = map.get(d);
      const secs = Math.min(row?.study_seconds || 0, 86400);
      days.push({ date: d, secs, isToday: d === today });
    }
    return days;
  }, [rows, today]);

  const maxChartSecs = Math.max(...chartDays.map((d) => d.secs), 1);

  const advice = useMemo(() => buildAdvice(rows || [], today), [rows, today]);

  useEffect(() => {
    if (selectedDay || showAdvice) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [selectedDay, showAdvice]);

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <div className="max-w-2xl mx-auto px-4 pt-4 pb-8">
        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={() => navigate("/focus-timer")}
            className="h-9 w-9 rounded-full border flex items-center justify-center hover:bg-muted flex-shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="font-extrabold text-base flex items-center gap-1.5">
              <Calendar className="h-4 w-4 text-primary" /> Study Time History
            </h1>
            <p className="text-[11px] text-muted-foreground">তোমার পড়াশোনার সম্পূর্ণ ইতিহাস</p>
          </div>
        </div>

        {!user ? (
          <div className="text-center text-sm text-muted-foreground bg-muted/40 rounded-xl p-4">
            ইতিহাস দেখতে লগইন করুন।
          </div>
        ) : (
          <>
            {/* Period filter */}
            <div className="flex gap-2 overflow-x-auto pb-1 mb-3">
              {PERIODS.map((p) => (
                <button
                  key={p.days}
                  onClick={() => setPeriodDays(p.days)}
                  className={cn(
                    "px-3 py-1.5 rounded-full text-[11px] font-bold border flex-shrink-0",
                    periodDays === p.days
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-border text-muted-foreground"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Today boxes (reflect selected period, label changes with period) */}
            <div className="grid grid-cols-3 gap-2 mb-3">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-center py-2.5">
                <div className="text-base font-black text-emerald-500">{fmtHM(periodTotals.study)}</div>
                <div className="text-[9px] font-bold text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
                  <BookOpen className="h-2.5 w-2.5" /> {periodLabel}
                </div>
              </div>
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 text-center py-2.5">
                <div className="text-base font-black text-amber-500">{fmtHM(periodTotals.brk)}</div>
                <div className="text-[9px] font-bold text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
                  <Coffee className="h-2.5 w-2.5" /> Break
                </div>
              </div>
              <div className="rounded-xl border border-indigo-400/30 bg-indigo-400/5 text-center py-2.5">
                <div className="text-base font-black text-indigo-400">{fmtHM(periodTotals.slp)}</div>
                <div className="text-[9px] font-bold text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
                  <Moon className="h-2.5 w-2.5" /> Sleep
                </div>
              </div>
            </div>

            {/* 7-day chart */}
            <div className="rounded-2xl border bg-card p-3.5 mb-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-extrabold">গত ৭ দিনের পড়াশোনা</span>
                <button
                  onClick={() => setShowAdvice(true)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-extrabold text-white bg-gradient-to-r from-violet-500 via-indigo-500 to-violet-500"
                >
                  <Lightbulb className="h-3 w-3" /> পরামর্শ
                </button>
              </div>
              <div className="flex items-end gap-1.5 h-28">
                {chartDays.map((d) => {
                  const heightPct = d.secs > 0 ? Math.max(8, Math.round((d.secs / maxChartSecs) * 90)) : 4;
                  const dow = BN_DAYS[new Date(d.date + "T00:00:00").getDay()];
                  const label = d.secs >= 60 ? fmtHM(d.secs) : d.secs > 0 ? `${d.secs}s` : "—";
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
                      <div className="text-[7.5px] font-bold text-muted-foreground whitespace-nowrap">{label}</div>
                      <div
                        className={cn(
                          "w-full max-w-[26px] rounded-t-md",
                          d.isToday ? "bg-gradient-to-b from-emerald-500 to-emerald-700" : "bg-gradient-to-b from-primary to-indigo-700",
                          d.secs === 0 && "opacity-50 bg-border"
                        )}
                        style={{ height: `${heightPct}%` }}
                      />
                      <div className={cn("text-[9px] font-bold", d.isToday ? "text-emerald-500 font-black" : "text-muted-foreground")}>
                        {dow}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Session list */}
            <div className="flex items-center gap-1.5 text-xs font-black mb-2">
              <Calendar className="h-3.5 w-3.5 text-primary" /> সেশন তালিকা
            </div>

            {isLoading && <p className="text-center text-sm text-muted-foreground py-8">লোড হচ্ছে...</p>}

            {!isLoading && (!rows || rows.length === 0) && (
              <p className="text-center text-sm text-muted-foreground py-10">
                এখনো কোনো সেশন রেকর্ড নেই।
                <br />
                <br />
                Focus Timer শুরু করো!
              </p>
            )}

            <div className="space-y-2">
              {(rows || []).map((g) => {
                const d = new Date(g.day + "T00:00:00");
                const dateLabel = `${d.getDate()} ${BN_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
                const dayLabel = BN_DAYS[d.getDay()];
                return (
                  <button
                    key={g.day}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setSelectedDay(g);
                    }}
                    className={cn(
                      "w-full text-left rounded-2xl border p-3 bg-gradient-to-br from-primary/5 via-emerald-500/5 to-amber-500/5 active:scale-[0.98] transition-transform",
                      g.is_ongoing ? "border-emerald-500/30" : "border-primary/20"
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <div className="text-xs font-black">
                          {dateLabel} <span className="text-[8.5px] font-bold text-muted-foreground">{dayLabel}</span>
                        </div>
                        <div className="text-[9px] text-muted-foreground mt-0.5">
                          {g.is_ongoing ? "🟢 চলছে" : "✓ সম্পন্ন"} · {g.session_count}টি সেশন · {g.breaks_used}টি বিরতি
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-black text-emerald-500">{fmtHM(g.study_seconds)}</div>
                        <div className="text-[8.5px] text-muted-foreground">পড়েছে</div>
                      </div>
                    </div>
                    <div className="flex border-t pt-2">
                      <div className="flex-1 text-center border-r">
                        <div className="text-[11px] font-black text-emerald-500">{fmtHM(g.study_seconds)}</div>
                        <div className="text-[7.5px] font-bold text-muted-foreground">পড়া</div>
                      </div>
                      <div className="flex-1 text-center border-r">
                        <div className="text-[11px] font-black text-amber-500">{g.break_seconds > 0 ? fmtHM(g.break_seconds) : "—"}</div>
                        <div className="text-[7.5px] font-bold text-muted-foreground">Break</div>
                      </div>
                      <div className="flex-1 text-center border-r">
                        <div className="text-[11px] font-black text-indigo-400">{g.sleep_seconds > 0 ? fmtHM(g.sleep_seconds) : "—"}</div>
                        <div className="text-[7.5px] font-bold text-muted-foreground">Sleep</div>
                      </div>
                      <div className="flex-1 text-center">
                        <div className="text-[11px] font-black text-muted-foreground">
                          {fmtHM(Math.max(0, 86400 - (g.study_seconds + g.break_seconds + g.sleep_seconds)))}
                        </div>
                        <div className="text-[7.5px] font-bold text-muted-foreground">বাকি</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Day detail popup */}
      {selectedDay && (
        <div
          className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center"
          onClick={() => setSelectedDay(null)}
        >
          <div
            className="bg-card border rounded-t-3xl w-full max-w-lg p-5 pb-8 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-9 h-1 rounded-full bg-border mx-auto" />
            <div className="text-center">
              <p className="text-[11px] font-bold text-muted-foreground">
                {new Date(selectedDay.day + "T00:00:00").getDate()}{" "}
                {BN_MONTHS[new Date(selectedDay.day + "T00:00:00").getMonth()]}{" "}
                {new Date(selectedDay.day + "T00:00:00").getFullYear()},{" "}
                {BN_DAYS[new Date(selectedDay.day + "T00:00:00").getDay()]}
              </p>
              <p className="text-sm font-black mt-1">{selectedDay.is_ongoing ? "⏳ চলছে..." : "📊 দিনের সারসংক্ষেপ"}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border p-3 text-center">
                <div className="text-lg font-black text-emerald-500">{fmtHM(selectedDay.study_seconds)}</div>
                <div className="text-[9px] font-bold text-muted-foreground mt-0.5">পড়েছে</div>
              </div>
              <div className="rounded-xl border p-3 text-center">
                <div className="text-lg font-black text-amber-500">{fmtHM(selectedDay.break_seconds)}</div>
                <div className="text-[9px] font-bold text-muted-foreground mt-0.5">Break</div>
              </div>
              <div className="rounded-xl border p-3 text-center">
                <div className="text-lg font-black text-indigo-400">{fmtHM(selectedDay.sleep_seconds)}</div>
                <div className="text-[9px] font-bold text-muted-foreground mt-0.5">Sleep</div>
              </div>
              <div className="rounded-xl border p-3 text-center">
                <div className="text-lg font-black text-muted-foreground">
                  {fmtHM(Math.max(0, 86400 - (selectedDay.study_seconds + selectedDay.break_seconds + selectedDay.sleep_seconds)))}
                </div>
                <div className="text-[9px] font-bold text-muted-foreground mt-0.5">⏳ বাকি সময়</div>
              </div>
            </div>
            <div className="rounded-xl border border-primary/25 bg-primary/5 p-3 text-xs">
              {dayFeedback(selectedDay)}
            </div>
          </div>
        </div>
      )}

      {/* Advice panel */}
      {showAdvice && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center" onClick={() => setShowAdvice(false)}>
          <div
            className="bg-card border rounded-t-3xl w-full max-w-lg p-5 pb-8 space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-9 h-1 rounded-full bg-border mx-auto mb-1" />
            <div className="text-sm font-black flex items-center gap-2" style={{ color: advice.statusColor }}>
              <span className="text-xl">{advice.statusIcon}</span> {advice.headline}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border p-2.5 text-center">
                <div className="text-sm font-black">{fmtHM(advice.totalStudy)}</div>
                <div className="text-[8.5px] font-bold text-muted-foreground mt-0.5">মোট পড়াশোনা</div>
              </div>
              <div className="rounded-xl border p-2.5 text-center">
                <div className="text-sm font-black">{advice.activeDays}/৭</div>
                <div className="text-[8.5px] font-bold text-muted-foreground mt-0.5">সক্রিয় দিন</div>
              </div>
              <div className="rounded-xl border p-2.5 text-center">
                <div className="text-sm font-black">{fmtHM(advice.avgStudy)}</div>
                <div className="text-[8.5px] font-bold text-muted-foreground mt-0.5">দৈনিক গড়</div>
              </div>
            </div>
            <div className="text-xs font-extrabold mt-2">পরামর্শ</div>
            {advice.tips.map((t, i) => (
              <div key={i} className="flex items-start gap-2 text-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                <span>{t}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

function dayFeedback(day: DayRow) {
  const studyH = day.study_seconds / 3600;
  let feedback = "";
  if (studyH >= 8) feedback = `অসাধারণ! ${fmtHM(day.study_seconds)} পড়েছো — এটা একটা অবিশ্বাস্য দিন! 🏆`;
  else if (studyH >= 5) feedback = `দারুণ পারফরম্যান্স! ${fmtHM(day.study_seconds)} পড়েছো। ধারাবাহিকতা ধরে রাখো। 🔥`;
  else if (studyH >= 3) feedback = `ভালো দিন! ${fmtHM(day.study_seconds)} পড়েছো। আরো একটু বাড়ালে আরো ভালো হবে। 📈`;
  else if (studyH >= 1) feedback = `${fmtHM(day.study_seconds)} পড়েছো। ছোট শুরু থেকেই বড় লক্ষ্য — আরো সময় দেওয়ার চেষ্টা করো। 🌱`;
  else feedback = "এই দিন পড়াশোনা কম হয়েছে। আগামীকাল আরো মনোযোগ দিতে পারবে! 💡";
  if (day.breaks_used > 0) feedback += ` ${day.breaks_used}টি বিরতি নিয়েছো।`;
  return feedback;
}

function buildAdvice(rows: DayRow[], today: string) {
  const map = new Map(rows.map((r) => [r.day, r]));
  const days: { date: string; studySecs: number; breaksUsed: number; sleepSecs: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    const row = map.get(d);
    days.push({ date: d, studySecs: row?.study_seconds || 0, breaksUsed: row?.breaks_used || 0, sleepSecs: row?.sleep_seconds || 0 });
  }

  const totalStudy = days.reduce((a, d) => a + d.studySecs, 0);
  const totalSleepSecs = days.reduce((a, d) => a + d.sleepSecs, 0);
  const avgStudy = totalStudy / 7;
  const activeDays = days.filter((d) => d.studySecs > 0).length;
  const totalBreaks = days.reduce((a, d) => a + d.breaksUsed, 0);
  const zeroDays = 7 - activeDays;
  const firstHalf = days.slice(0, 3).reduce((a, d) => a + d.studySecs, 0) / 3;
  const lastHalf = days.slice(3, 6).reduce((a, d) => a + d.studySecs, 0) / 3;
  const trendUp = lastHalf > firstHalf * 1.15;
  const trendDown = lastHalf < firstHalf * 0.7;
  const sorted = [...days].sort((a, b) => b.studySecs - a.studySecs);
  const bestDay = sorted[0];
  const bestDayName = bestDay.studySecs > 0 ? BN_DAYS[new Date(bestDay.date + "T12:00:00Z").getUTCDay()] : null;

  let headline = "";
  let tips: string[] = [];
  let statusColor = "#6366F1";
  let statusIcon = "💡";

  if (totalStudy === 0) {
    statusColor = "#EF4444";
    statusIcon = "😴";
    headline = "গত ৭ দিনে কোনো পড়াশোনার রেকর্ড নেই";
    tips.push("আজই Focus Timer চালু করে একটা ছোট ২৫ মিনিটের session দিয়ে শুরু করো।");
    tips.push("বড় লক্ষ্য না ভেবে প্রতিদিন মাত্র ৩০ মিনিট দিয়ে অভ্যাস তৈরি করো।");
  } else if (zeroDays >= 4) {
    statusColor = "#F59E0B";
    statusIcon = "⚠️";
    headline = `ধারাবাহিকতা অনেক কম — সপ্তাহে মাত্র ${activeDays} দিন পড়েছো`;
    tips.push("প্রতিদিন অল্প হলেও পড়ার অভ্যাস গড়ে তোলো — ধারাবাহিকতাই বড় ফলাফলের চাবিকাঠি।");
    tips.push("একটানা বেশি পড়ার চেয়ে প্রতিদিন নিয়মিত ১ ঘণ্টা পড়া বেশি কার্যকর।");
    if (bestDayName) tips.push(`${bestDayName}বার তুমি সবচেয়ে ভালো পড়েছিলে (${fmtHM(bestDay.studySecs)}) — সেই রুটিন বাকি দিনগুলোতেও রাখার চেষ্টা করো।`);
  } else if (trendDown) {
    statusColor = "#F59E0B";
    statusIcon = "📉";
    headline = "পড়াশোনার সময় কমে আসছে — মনোযোগ ধরে রাখতে হবে";
    tips.push(`সপ্তাহের শুরুর দিকে গড়ে ${fmtHM(firstHalf)} পড়তে, এখন তা কমে ${fmtHM(lastHalf)} হয়েছে।`);
    tips.push("Break Mode ব্যবহার করে ছোট ছোট বিরতি নিয়ে ক্লান্তি কমাও, যাতে দীর্ঘ সময় মনোযোগ ধরে রাখতে পারো।");
    tips.push("ঘুমের সময় ঠিক রাখো — পর্যাপ্ত ঘুম মনোযোগ ফিরিয়ে আনতে সাহায্য করে।");
  } else if (totalBreaks > activeDays * 4) {
    statusColor = "#F59E0B";
    statusIcon = "☕";
    headline = "অতিরিক্ত বিরতি নিচ্ছো — একটানা পড়ার অভ্যাস দরকার";
    tips.push(`গড়ে দিনে প্রায় ${(totalBreaks / Math.max(activeDays, 1)).toFixed(1)}টি বিরতি নিচ্ছো — এটা মনোযোগ ভেঙে দিতে পারে।`);
    tips.push("Pomodoro পদ্ধতি ব্যবহার করো — ২৫ মিনিট একটানা পড়ে তারপর ৫ মিনিট বিরতি নাও।");
    tips.push("বিরতির সময় ফোন থেকে দূরে থেকো, যাতে দ্রুত আবার মনোযোগ ফিরে আসে।");
  } else if (avgStudy >= 14400) {
    statusColor = "#10B981";
    statusIcon = "🏆";
    headline = `চমৎকার পারফরম্যান্স! গড়ে দৈনিক ${fmtHM(avgStudy)} পড়ছো`;
    tips.push("এই ধারাবাহিকতা বজায় রাখো — তুমি দারুণ পথে আছো!");
    if (totalSleepSecs / 7 < 18000) tips.push("তবে ঘুমের প্রতি একটু বেশি যত্ন নাও — পর্যাপ্ত বিশ্রাম দীর্ঘমেয়াদে পড়াশোনার মান বাড়ায়।");
    else tips.push("ঘুম ও পড়াশোনার ভারসাম্য ভালো আছে — এভাবেই চালিয়ে যাও।");
  } else if (trendUp) {
    statusColor = "#10B981";
    statusIcon = "📈";
    headline = "দারুণ! পড়াশোনার সময় বাড়ছে প্রতিদিন";
    tips.push(`সপ্তাহের শুরুতে গড়ে ${fmtHM(firstHalf)} ছিল, এখন ${fmtHM(lastHalf)} হয়েছে — চমৎকার উন্নতি!`);
    tips.push("এই গতি ধরে রাখলে সামনের সপ্তাহে আরও ভালো ফলাফল আসবে।");
  } else {
    headline = "মোটামুটি ভালো চলছে — আরেকটু ধারাবাহিক হলে আরও ভালো হবে";
    tips.push(`গত ৭ দিনে গড়ে দৈনিক ${fmtHM(avgStudy)} পড়েছো, মোট ${activeDays} দিন সক্রিয় ছিলে।`);
    tips.push("প্রতিদিন একটা নির্দিষ্ট সময়ে পড়তে বসার অভ্যাস করো — এতে মস্তিষ্ক স্বয়ংক্রিয়ভাবে প্রস্তুত হয়ে যাবে।");
    if (bestDayName) tips.push(`${bestDayName}বার তোমার সেরা দিন ছিল (${fmtHM(bestDay.studySecs)}) — কী আলাদা করেছিলে সেদিন, মনে করার চেষ্টা করো।`);
  }

  return { headline, tips, statusColor, statusIcon, totalStudy, activeDays, avgStudy };
}

export default StudyHistory;
