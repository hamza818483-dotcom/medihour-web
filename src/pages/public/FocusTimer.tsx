import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Coffee,
  Moon,
  Pause,
  Play,
  Square,
  Trophy,
  Users,
  User,
} from "lucide-react";
import PublicHeader from "@/components/PublicHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Mood = "study" | "break" | "sleep";

const MOOD_META: Record<Mood, { label: string; statLabel: string; icon: typeof BookOpen; color: string; bg: string }> = {
  study: { label: "Study", statLabel: "পড়ছে", icon: BookOpen, color: "text-emerald-500", bg: "from-emerald-500 to-teal-500" },
  break: { label: "Break", statLabel: "বিরতিতে", icon: Coffee, color: "text-amber-500", bg: "from-amber-500 to-orange-500" },
  sleep: { label: "Sleep", statLabel: "ঘুমাচ্ছে", icon: Moon, color: "text-indigo-400", bg: "from-indigo-500 to-violet-500" },
};

// AtlasApp-style always-on dark gradients per mood (inactive state), the vivid
// gradient + glow-pulse animation when active, and matching digital-timer box tint.
const MOOD_BTN_IDLE: Record<Mood, string> = {
  study: "bg-gradient-to-br from-[#0f4c2a] via-[#166534] to-[#15803d] border-emerald-500/40",
  break: "bg-gradient-to-br from-[#5c3a00] via-[#92400e] to-[#b45309] border-amber-500/30",
  sleep: "bg-gradient-to-br from-[#1e1b4b] via-[#312e81] to-[#3730a3] border-indigo-500/30",
};
const MOOD_BTN_ACTIVE: Record<Mood, string> = {
  study: "bg-gradient-to-br from-emerald-500 via-emerald-600 to-emerald-700 border-emerald-500 shadow-[0_4px_16px_rgba(16,185,129,.4)] animate-mood-glow-study",
  break: "bg-gradient-to-br from-amber-500 via-amber-600 to-amber-700 border-amber-500 shadow-[0_4px_16px_rgba(245,158,11,.4)] animate-mood-glow-break",
  sleep: "bg-gradient-to-br from-indigo-500 via-indigo-600 to-indigo-700 border-indigo-500 shadow-[0_4px_16px_rgba(99,102,241,.4)] animate-mood-glow-sleep",
};
const MOOD_DIGIT_BOX: Record<Mood, string> = {
  study: "bg-gradient-to-br from-[#0d2a1a] to-[#0f3d22] border-emerald-500/30",
  break: "bg-gradient-to-br from-[#2a1800] to-[#3d2200] border-amber-500/30",
  sleep: "bg-gradient-to-br from-[#0e0d2a] to-[#17163d] border-indigo-500/30",
};

const STATE_KEY = "atlas_focus_state_v1";

interface PersistedState {
  sessionId: number;
  mood: Mood;
  elapsed: number;
  paused: boolean;
  userId: string;
  savedAt: number;
}

function formatHMS(totalSeconds: number) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return { h: String(h).padStart(2, "0"), m: String(m).padStart(2, "0"), s: String(s).padStart(2, "0") };
}

function loadState(): PersistedState | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    return raw ? (JSON.parse(raw) as PersistedState) : null;
  } catch {
    return null;
  }
}

function saveState(state: PersistedState) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable, session just won't resume after refresh */
  }
}

function clearState() {
  try {
    localStorage.removeItem(STATE_KEY);
  } catch {
    /* ignore */
  }
}

function sessionNumberKey(userId: string) {
  return `atlas_focus_session_num_${userId}`;
}

function loadSessionNumber(userId: string): number {
  try {
    const raw = localStorage.getItem(sessionNumberKey(userId));
    if (!raw) return 1;
    const d = JSON.parse(raw) as { date: string; n: number };
    const today = new Date().toISOString().split("T")[0];
    return d.date === today ? d.n : 1;
  } catch {
    return 1;
  }
}

function saveSessionNumber(userId: string, n: number) {
  try {
    const today = new Date().toISOString().split("T")[0];
    localStorage.setItem(sessionNumberKey(userId), JSON.stringify({ date: today, n }));
  } catch {
    /* ignore */
  }
}

const FocusTimer = () => {
  const navigate = useNavigate();
  const { user, profile } = useAuth();

  const [mood, setMood] = useState<Mood>("study");
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [nowTick, setNowTick] = useState(0);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [leaderboardMood, setLeaderboardMood] = useState<Mood>("study");
  const [leaderboardDays, setLeaderboardDays] = useState(1);
  // (removed unused showLiveNow toggle — live list is now always visible, matching AtlasApp)
  const [selectedBatch, setSelectedBatch] = useState<string>("all");
  const [breaksUsed, setBreaksUsed] = useState(0);
  const accumulatedBreakRef = useRef(0); // break seconds used before the current live break segment
  const accumulatedStudyRef = useRef(0); // study seconds accumulated before the current live study segment
  const pauseStartRef = useRef<number | null>(null);
  const autoSleepCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoBreakCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const runningRef = useRef(false);
  const [toast, setToast] = useState<{ title: string; sub: string; mood?: Mood } | null>(null);
  const [stopStats, setStopStats] = useState<{ studySeconds: number; breaks: number; sleepSeconds: number } | null>(null);
  const sleepSecsRef = useRef(0); // accumulated sleep seconds across this run (for the stop summary)
  const [sessionNumber, setSessionNumber] = useState(1);
  const hasStoppedOnceRef = useRef(false);
  const [overlayMood, setOverlayMood] = useState<Mood | null>(null);
  const [showLbFullScreen, setShowLbFullScreen] = useState(false); // Ultimate Leaderboard fullscreen — matches AtlasApp's openLbView()
  const [compareTarget, setCompareTarget] = useState<{ userId: string; name: string; secs: number } | null>(null);
  const [cmpDays, setCmpDays] = useState(1);
  const [overlayDays, setOverlayDays] = useState(1);
  const [showIntro, setShowIntro] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const pausedRef = useRef(false);
  const sessionIdRef = useRef<number | null>(null);
  const moodRef = useRef<Mood>("study");
  const resumedRef = useRef(false);

  useEffect(() => {
    document.title = "Focus Timer — Atlas";
    try {
      if (!localStorage.getItem("atlas_focus_intro_seen")) setShowIntro(true);
    } catch {
      /* ignore */
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    };
  }, []);

  useEffect(() => {
    const id = setInterval(() => setNowTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (user) setSessionNumber(loadSessionNumber(user.id));
  }, [user]);

  // Attempt resume from a previous page load (survives refresh/navigation).
  useEffect(() => {
    if (!user || resumedRef.current) return;
    resumedRef.current = true;
    const saved = loadState();
    if (!saved || saved.userId !== user.id) return;

    (async () => {
      const { data, error } = await supabase.rpc("focus_start_session", {
        p_mood: saved.mood,
        p_resume_id: saved.sessionId,
      });
      if (error || !data) {
        clearState();
        return;
      }
      const id = data as number;
      setSessionId(id);
      setMood(saved.mood);
      setElapsed(saved.elapsed);
      setPaused(saved.paused);
      setRunning(true); runningRef.current = true;
      sessionIdRef.current = id;
      moodRef.current = saved.mood;
      elapsedRef.current = saved.elapsed;
      pausedRef.current = saved.paused;
      // Keep ticking + heartbeat in sync with the same paused check — a prior mismatch
      // here (heartbeat always starting regardless of paused state) was the likely
      // cause of sessions showing "Live" with a frozen duration.
      if (!saved.paused) startTicking();
      startHeartbeat();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const { data: leaderboard, refetch: refetchLeaderboard } = useQuery({
    queryKey: ["focus-leaderboard", leaderboardMood, leaderboardDays],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("focus_mood_leaderboard", {
        p_mood: leaderboardMood,
        p_days: leaderboardDays,
      });
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 15000,
  });

  const queryClient = useQueryClient();
  const liveNowFetchedAtRef = useRef<number>(Date.now());
  const { data: liveNow, refetch: refetchLiveNow } = useQuery({
    queryKey: ["focus-live-now"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("focus_live_now");
      if (error) throw error;
      liveNowFetchedAtRef.current = Date.now();
      return data || [];
    },
    refetchInterval: 3000,
    enabled: !!user,
  });

  // Drive a 1s re-render so other students' live cards tick smoothly every second
  // instead of jumping only on the 3s liveNow refetch.
  useEffect(() => {
    const id = setInterval(() => setNowTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const { data: overlayRanking } = useQuery({
    queryKey: ["focus-overlay-ranking", overlayMood, overlayDays],
    queryFn: async () => {
      if (!overlayMood) return [];
      const { data, error } = await supabase.rpc("focus_mood_leaderboard", {
        p_mood: overlayMood,
        p_days: overlayDays,
      });
      if (error) throw error;
      return data || [];
    },
    enabled: !!overlayMood,
  });

  const { data: cmpDaily } = useQuery({
    queryKey: ["focus-compare-daily", compareTarget?.userId, cmpDays],
    queryFn: async () => {
      if (!compareTarget) return [];
      const { data, error } = await supabase.rpc("focus_compare_daily" as any, {
        p_other_user: compareTarget.userId,
        p_days: cmpDays,
      });
      if (error) throw error;
      return ((data as unknown) || []) as { user_id: string; day: string; total_seconds: number }[];
    },
    enabled: !!compareTarget && cmpDays > 1,
  });

  const { data: cmpBreaksToday } = useQuery({
    queryKey: ["focus-breaks-today", compareTarget?.userId, user?.id],
    queryFn: async () => {
      if (!compareTarget || !user) return { mine: 0, theirs: 0 };
      const [mine, theirs] = await Promise.all([
        supabase.rpc("focus_breaks_today" as any, { p_user_id: user.id }),
        supabase.rpc("focus_breaks_today" as any, { p_user_id: compareTarget.userId }),
      ]);
      return { mine: Number(mine.data || 0), theirs: Number(theirs.data || 0) };
    },
    enabled: !!compareTarget && !!user,
  });

  const { data: myTotalToday } = useQuery({
    queryKey: ["focus-my-today", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const { data, error } = await supabase
        .from("focus_sessions")
        .select("duration_seconds")
        .eq("user_id", user!.id)
        .eq("mood", "study")
        .gte("created_at", startOfDay.toISOString());
      if (error) throw error;
      return (data || []).reduce((sum, r) => sum + (r.duration_seconds || 0), 0);
    },
  });

  const startTicking = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsed(elapsedRef.current);
    }, 1000);
  };

  const startHeartbeat = () => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    heartbeatRef.current = setInterval(() => {
      if (sessionIdRef.current == null) return;
      void supabase.rpc("focus_update_session", {
        p_id: sessionIdRef.current,
        p_duration_seconds: elapsedRef.current,
        p_is_paused: pausedRef.current,
      });
      saveState({
        sessionId: sessionIdRef.current,
        mood: moodRef.current,
        elapsed: elapsedRef.current,
        paused: pausedRef.current,
        userId: user!.id,
        savedAt: Date.now(),
      });
    }, 5000);
  };

  const start = async () => {
    if (!user) return;
    const { data, error } = await supabase.rpc("focus_start_session", { p_mood: "study" });
    if (error || data == null) return;
    const id = data as number;
    elapsedRef.current = 0;
    pausedRef.current = false;
    sessionIdRef.current = id;
    moodRef.current = "study";
    setSessionId(id);
    setMood("study");
    setBreaksUsed(0);
    setSelectedBatch("all");
    setElapsed(0);
    setRunning(true); runningRef.current = true;
    setPaused(false);
    startTicking();
    startHeartbeat();
    saveState({ sessionId: id, mood: "study", elapsed: 0, paused: false, userId: user.id, savedAt: Date.now() });
    refetchLeaderboard();
    refetchLiveNow();
    if (hasStoppedOnceRef.current) {
      const next = sessionNumber + 1;
      setSessionNumber(next);
      saveSessionNumber(user.id, next);
    }
  };

  const pause = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    pausedRef.current = true;
    setPaused(true);
    pauseStartRef.current = Date.now();
    if (sessionIdRef.current != null) {
      void supabase.rpc("focus_update_session", {
        p_id: sessionIdRef.current,
        p_duration_seconds: elapsedRef.current,
        p_is_paused: true,
      });
    }
    // Pausing Study immediately switches to Break mode — time keeps counting
    // there instead of sitting idle, matching the requested behavior.
    if (moodRef.current === "study") {
      void switchMood("break");
    }
  };

  const resume = async () => {
    pausedRef.current = false;
    setPaused(false);
    pauseStartRef.current = null;
    startTicking();
    // Instantly reflect the resume in the live list (don't wait for 3s refetch).
    queryClient.setQueryData(["focus-live-now"], (old: any[] | undefined) => {
      if (!old) return old;
      const rest = old.filter((r: any) => r.user_id !== user?.id);
      const selfRow = old.find((r: any) => r.user_id === user?.id);
      return [
        ...rest,
        { ...(selfRow || { user_id: user?.id, full_name: profile?.full_name, hsc_batch: profile?.hsc_batch }), mood: moodRef.current, duration_seconds: elapsedRef.current, is_paused: false },
      ];
    });
    liveNowFetchedAtRef.current = Date.now();
    if (sessionIdRef.current != null) {
      // The old session row may have been auto-closed server-side (60s no-heartbeat
      // staleness sweep, e.g. tab was backgrounded and JS timers got throttled) while
      // we were away. focus_update_session only affects status='active' rows, so if it
      // got closed, that update would silently no-op and the 3s poll would then show the
      // card gone. focus_start_session with p_resume_id reactivates it if still active,
      // or transparently opens a fresh active row (carrying our locally-tracked elapsed
      // time forward) if it was closed — either way the row is guaranteed 'active' after.
      const { data, error } = await supabase.rpc("focus_start_session", {
        p_mood: moodRef.current,
        p_resume_id: sessionIdRef.current,
      });
      if (!error && data) {
        sessionIdRef.current = data as number;
        setSessionId(data as number);
      }
      await supabase.rpc("focus_update_session", {
        p_id: sessionIdRef.current,
        p_duration_seconds: elapsedRef.current,
        p_is_paused: false,
      });
      startHeartbeat();
    }
    // NOTE: do NOT call refetchLiveNow() here — the focus_update_session RPC above is
    // fire-and-forget (void), so an immediate refetch can race ahead of it and pull back
    // stale is_paused:true from the server, overwriting our optimistic patch. The normal
    // 3s poll will pick up the confirmed server state once the RPC has landed.
  };

  // রাত ১২টা থেকে সকাল ৮টার মধ্যে Study Mood paused অবস্থায় ১.৫ ঘণ্টা পার হলে
  // স্বয়ংক্রিয়ভাবে Sleep Mode চালু হয়ে যায়।
  const checkAutoSleepFromPause = async () => {
    if (!pauseStartRef.current || moodRef.current !== "study" || !pausedRef.current) return;
    const hr = new Date().getHours();
    const inNightWindow = hr >= 0 && hr < 8;
    if (!inNightWindow) return;
    const pausedSecs = Math.floor((Date.now() - pauseStartRef.current) / 1000);
    if (pausedSecs < 5400) return; // 1.5 hours

    if (intervalRef.current) clearInterval(intervalRef.current);
    if (sessionIdRef.current != null) {
      await supabase.rpc("focus_end_session", {
        p_id: sessionIdRef.current,
        p_duration_seconds: elapsedRef.current,
      });
    }
    const { data, error } = await supabase.rpc("focus_start_session", { p_mood: "sleep" });
    if (error || data == null) return;
    const id = data as number;
    elapsedRef.current = pausedSecs;
    pausedRef.current = false;
    pauseStartRef.current = Date.now(); // reset so further night-pauses keep converting to sleep, matching AtlasApp
    sessionIdRef.current = id;
    moodRef.current = "sleep";
    setSessionId(id);
    setMood("sleep");
    setElapsed(pausedSecs);
    setPaused(false);
    startTicking();
    saveState({ sessionId: id, mood: "sleep", elapsed: pausedSecs, paused: false, userId: user!.id, savedAt: Date.now() });
    refetchLeaderboard();
    refetchLiveNow();
    setToast({ title: "Sleep মোড চালু", sub: "দীর্ঘ সময় নিষ্ক্রিয় দেখে স্বয়ংক্রিয়ভাবে চালু হলো", mood: "sleep" });
    setTimeout(() => setToast(null), 4000);
  };

  // ৬ ঘণ্টা টানা Break মোডে থাকলে (running/active, normal 1h auto-return
  // miss হয়ে গেলেও — যেমন ট্যাব inactive থাকা অবস্থায়) স্বয়ংক্রিয়ভাবে Sleep
  // মোডে চলে যায়, যাতে সারারাত ভুলবশত "Break" হিসেবে গণনা না হয়।
  const MAX_CONTINUOUS_BREAK_SEC = 6 * 3600; // 6 hours
  const checkAutoSleepFromLongBreak = async () => {
    if (moodRef.current !== "break" || sessionIdRef.current == null) return;
    const totalBreakSecs = accumulatedBreakRef.current + elapsedRef.current;
    if (totalBreakSecs < MAX_CONTINUOUS_BREAK_SEC) return;

    if (intervalRef.current) clearInterval(intervalRef.current);
    if (sessionIdRef.current != null) {
      await supabase.rpc("focus_end_session", {
        p_id: sessionIdRef.current,
        p_duration_seconds: elapsedRef.current,
      });
    }
    const { data, error } = await supabase.rpc("focus_start_session", { p_mood: "sleep" });
    if (error || data == null) return;
    const id = data as number;
    elapsedRef.current = sleepSecsRef.current;
    sleepSecsRef.current = 0;
    accumulatedBreakRef.current = 0;
    pausedRef.current = false;
    sessionIdRef.current = id;
    moodRef.current = "sleep";
    setSessionId(id);
    setMood("sleep");
    setElapsed(elapsedRef.current);
    setPaused(false);
    startTicking();
    saveState({ sessionId: id, mood: "sleep", elapsed: elapsedRef.current, paused: false, userId: user!.id, savedAt: Date.now() });
    refetchLeaderboard();
    refetchLiveNow();
    setToast({ title: "Sleep মোড চালু", sub: "দীর্ঘ সময় বিরতিতে থাকায় স্বয়ংক্রিয়ভাবে চালু হলো", mood: "sleep" });
    setTimeout(() => setToast(null), 4000);
  };

  // যদি Study Mood কোনো কারণে (browser/tab ছেড়ে যাওয়া, বা ম্যানুয়াল) paused অবস্থায়
  // ১ ঘণ্টা পার হয়ে যায়, স্বয়ংক্রিয়ভাবে Break মোডে চলে যায়।
  const checkAutoBreakFromPause = async () => {
    if (!pauseStartRef.current || moodRef.current !== "study" || !pausedRef.current) return;
    const pausedSecs = Math.floor((Date.now() - pauseStartRef.current) / 1000);
    if (pausedSecs < 3600) return; // 1 hour
    pauseStartRef.current = null;
    await switchMood("break");
  };

  useEffect(() => {
    autoBreakCheckRef.current = setInterval(() => {
      void checkAutoBreakFromPause();
    }, 30000);
    return () => {
      if (autoBreakCheckRef.current) clearInterval(autoBreakCheckRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // পেজ/ট্যাব ছেড়ে গেলে (মিনিমাইজ, অন্য ট্যাবে যাওয়া, বা পেজ বন্ধ) timer শুধু pause হয় —
  // mode বদলায় না। ফিরে এসে resume করলেই আগের elapsed time-এর সাথে যোগ হয়ে চলতে থাকে।
  useEffect(() => {
    const handleHide = () => {
      if (
        runningRef.current &&
        !pausedRef.current &&
        sessionIdRef.current != null
      ) {
        pausedRef.current = true;
        setPaused(true);
        pauseStartRef.current = Date.now();
        if (intervalRef.current) clearInterval(intervalRef.current);
        // Show the pause tag instantly on our own card too, not just after a poll.
        queryClient.setQueryData(["focus-live-now"], (old: any[] | undefined) => {
          if (!old) return old;
          return old.map((r: any) =>
            r.user_id === user?.id ? { ...r, is_paused: true, duration_seconds: elapsedRef.current } : r
          );
        });
        // Regular supabase-js fetch can get killed mid-flight once the tab is actually
        // backgrounded/suspended, which is why other users never saw the pause tag —
        // the update never reached the server. keepalive:true tells the browser to
        // finish sending this request even after the page is hidden/unloaded.
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/focus_update_session`;
        supabase.auth.getSession().then(({ data }) => {
          const token = data.session?.access_token;
          fetch(url, {
            method: "POST",
            keepalive: true,
            headers: {
              "Content-Type": "application/json",
              apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
              Authorization: `Bearer ${token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: JSON.stringify({
              p_id: sessionIdRef.current,
              p_duration_seconds: elapsedRef.current,
              p_is_paused: true,
            }),
          }).catch(() => {});
        });
      }
    };
    const handleVisibilityChange = () => {
      if (document.hidden) {
        handleHide();
      }
      // ফিরে এসে auto-resume হবে না — ইউজারকে ম্যানুয়ালি Resume বাটনে ক্লিক করতে হবে।
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handleHide);
    window.addEventListener("beforeunload", handleHide);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handleHide);
      window.removeEventListener("beforeunload", handleHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    autoSleepCheckRef.current = setInterval(() => {
      void checkAutoSleepFromPause();
      void checkAutoSleepFromLongBreak();
    }, 30000);
    return () => {
      if (autoSleepCheckRef.current) clearInterval(autoSleepCheckRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Tapping a mood button switches instantly — AtlasApp's confirmation popup exists in
  // markup but is never actually triggered in the real code, so real behavior is instant switch.
  const requestSwitchMood = (m: Mood) => {
    if (!running) {
      setToast({ title: "আগে পড়াশোনা শুরু করো", sub: "Study মোড চালু না করলে মোড পরিবর্তন করা যাবে না" });
      setTimeout(() => setToast(null), 2500);
      return;
    }
    if (m === moodRef.current) return;
    void switchMood(m);
  };

  const closeOverlay = useCallback(() => {
    setOverlayMood(null);
    try {
      if (window.history.state?.focusOverlay) window.history.back();
    } catch {
      /* ignore */
    }
  }, []);

  // Back button closes the mood overlay instead of navigating away, matching AtlasApp.
  useEffect(() => {
    const onPopState = () => { setOverlayMood(null); setShowLbFullScreen(false); };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const switchMood = async (m: Mood) => {
    if (!running) {
      setToast({ title: "আগে পড়াশোনা শুরু করো", sub: "Study মোড চালু না করলে মোড পরিবর্তন করা যাবে না" });
      setTimeout(() => setToast(null), 2500);
      return;
    }
    if (m === moodRef.current) return;
    // end current live segment, freeze its elapsed time into that mood's own bucket
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (sessionIdRef.current != null) {
      await supabase.rpc("focus_end_session", {
        p_id: sessionIdRef.current,
        p_duration_seconds: elapsedRef.current,
      });
    }
    if (moodRef.current === "break") {
      accumulatedBreakRef.current += elapsedRef.current;
    } else if (moodRef.current === "sleep") {
      sleepSecsRef.current += elapsedRef.current;
    } else if (moodRef.current === "study") {
      accumulatedStudyRef.current += elapsedRef.current;
    }
    if (m === "break" && moodRef.current === "study") {
      setBreaksUsed((n) => n + 1);
    }
    setLeaderboardDays(1);
    const { data, error } = await supabase.rpc("focus_start_session", { p_mood: m });
    if (error || data == null) return;
    const id = data as number;
    // Resume the target mood's timer from where it was left, not from 0.
    let resumeSecs = 0;
    if (m === "break") {
      resumeSecs = accumulatedBreakRef.current;
      accumulatedBreakRef.current = 0;
    } else if (m === "sleep") {
      resumeSecs = sleepSecsRef.current;
      sleepSecsRef.current = 0;
    } else if (m === "study") {
      resumeSecs = accumulatedStudyRef.current;
      accumulatedStudyRef.current = 0;
    }
    elapsedRef.current = resumeSecs;
    pausedRef.current = false;
    sessionIdRef.current = id;
    moodRef.current = m;
    setSessionId(id);
    setMood(m);
    setElapsed(resumeSecs);
    setPaused(false);
    startTicking();
    saveState({ sessionId: id, mood: m, elapsed: resumeSecs, paused: false, userId: user!.id, savedAt: Date.now() });
    // Optimistically patch our own row in the liveNow cache right away — don't wait for the
    // network round-trip, so counts/lists reflect the new mood the instant the button is tapped.
    queryClient.setQueryData(["focus-live-now"], (old: any[] | undefined) => {
      if (!old) return old;
      const rest = old.filter((r: any) => r.user_id !== user?.id);
      const selfRow = old.find((r: any) => r.user_id === user?.id);
      return [
        ...rest,
        { ...(selfRow || { user_id: user?.id, full_name: profile?.full_name, hsc_batch: profile?.hsc_batch }), mood: m, duration_seconds: resumeSecs, is_paused: false },
      ];
    });
    refetchLeaderboard();
    refetchLiveNow();
    const moodToastCopy: Record<Mood, { title: string; sub: string; mood: Mood }> = {
      study: { title: "Study মোড চালু", sub: "মনোযোগ ধরে রাখো, সময় এখন গুনছে", mood: "study" },
      break: { title: "বিরতি চালু", sub: "কিছুক্ষণ রিল্যাক্স করো, তারপর আবার ফিরে আসো", mood: "break" },
      sleep: { title: "ঘুম মোড চালু", sub: "ভালো ঘুম মানে পরদিনের ভালো প্রস্তুতি", mood: "sleep" },
    };
    setToast(moodToastCopy[m]);
    setTimeout(() => setToast(null), 3000);
  };

  // Break time limit reached — auto-return to Study mood.
  const stop = async () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (heartbeatRef.current) clearInterval(heartbeatRef.current);
    if (sessionIdRef.current != null) {
      await supabase.rpc("focus_end_session", {
        p_id: sessionIdRef.current,
        p_duration_seconds: elapsedRef.current,
      });
    }
    if (moodRef.current === "sleep") {
      sleepSecsRef.current += elapsedRef.current;
    }
    if (moodRef.current === "study") {
      accumulatedStudyRef.current += elapsedRef.current;
    }
    clearState();
    setStopStats({ studySeconds: accumulatedStudyRef.current, breaks: breaksUsed, sleepSeconds: sleepSecsRef.current });
    hasStoppedOnceRef.current = true;
    sessionIdRef.current = null;
    setSessionId(null);
    setRunning(false); runningRef.current = false;
    setPaused(false);
    setElapsed(0);
    accumulatedBreakRef.current = 0;
    accumulatedStudyRef.current = 0;
    sleepSecsRef.current = 0;
    setBreaksUsed(0);
    pauseStartRef.current = null;
    refetchLeaderboard();
    refetchLiveNow();
  };

  const dismissIntro = () => {
    setShowIntro(false);
    try {
      localStorage.setItem("atlas_focus_intro_seen", "1");
    } catch {
      /* ignore */
    }
  };

  const [showAuthPrompt, setShowAuthPrompt] = useState(false);

  const handleStartStudy = () => {
    if (!user) {
      setShowAuthPrompt(true);
      return;
    }
    dismissIntro();
  };

  const { h, m: min, s } = formatHMS(elapsed);
  const meta = MOOD_META[mood];
  const Icon = meta.icon;

  return (
    <div className="min-h-screen bg-background text-foreground pb-16">
      <PublicHeader />

      {showIntro ? (
        <div className="max-w-2xl mx-auto px-3.5 pt-4">
          <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-extrabold text-sm">ATLAS Focus Timer</h3>
                <p className="text-[11px] text-muted-foreground">মনোযোগী পড়াশোনার জন্য বাংলাদেশের সেরা টাইমার</p>
              </div>
              <button onClick={dismissIntro} className="text-xs font-bold text-muted-foreground hover:text-foreground">
                ✕
              </button>
            </div>

            <div className="rounded-xl border bg-card p-3 space-y-1.5">
              <div className="text-xs font-extrabold flex items-center gap-1">
                <Trophy className="h-3 w-3 text-primary" /> কেন ব্যবহার করবে?
              </div>
              <ul className="text-[11px] space-y-1 list-disc pl-4 text-muted-foreground">
                <li>পড়াশোনার সময় track করো এবং নিজেকে motivate রাখো</li>
                <li>Live দেখো কতজন student এই মুহূর্তে পড়ছে</li>
                <li>Top Focused Student হওয়ার সুযোগ পাও</li>
                <li>Study, Break ও Sleep Mood আলাদাভাবে track হবে</li>
              </ul>
            </div>

            <div className="space-y-2 text-xs">
              <div className="text-xs font-extrabold">কীভাবে ব্যবহার করবে?</div>
              <div className="flex items-start gap-2">
                <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground font-black text-[10px] flex items-center justify-center flex-shrink-0">১</span>
                <span>"পড়াশোনা শুরু করো" বাটনে চাপো — Study Mood timer শুরু হবে</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground font-black text-[10px] flex items-center justify-center flex-shrink-0">২</span>
                <span>ক্লান্ত হলে Break মোডে চাপো — Study pause হয়ে Break timer শুরু হবে</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground font-black text-[10px] flex items-center justify-center flex-shrink-0">৩</span>
                <span>Sleep Mood on থাকলে phone off করলেও timer চলতে থাকবে</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="h-5 w-5 rounded-full bg-primary text-primary-foreground font-black text-[10px] flex items-center justify-center flex-shrink-0">৪</span>
                <span>পড়া শেষে Stop — সময় সেভ হবে এবং rank update হবে</span>
              </div>
            </div>
            <button
              onClick={handleStartStudy}
              className="w-full py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs"
            >
              পড়াশোনা শুরু করো
            </button>
          </div>
        </div>
      ) : (
      <div className="max-w-2xl mx-auto px-3.5 pt-1 space-y-1.5">
        {!user && (
          <div className="text-center text-sm text-muted-foreground bg-muted/40 rounded-xl p-4">
            টাইমার সেভ করতে লগইন করুন।
          </div>
        )}

        {/* User header — name/batch + Study Time History (matches AtlasApp position, above banner) */}
        <div className="flex items-center justify-between rounded-2xl border bg-card px-3 py-2.5">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-white font-black text-sm flex-shrink-0 overflow-hidden">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {(profile as any)?.avatar_url ? (
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                <img src={(profile as any).avatar_url} alt={profile?.full_name || "Profile"} className="h-full w-full object-cover" />
              ) : (
                (profile?.full_name || "?").charAt(0).toUpperCase()
              )}
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-xs font-extrabold">{profile?.full_name || "লোড হচ্ছে..."}</span>
              {profile?.hsc_batch && (
                <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded-full w-fit mt-0.5">
                  {profile.hsc_batch}
                </span>
              )}
            </div>
          </div>
          <button
            onClick={() => navigate("/focus-timer/history")}
            className="flex items-center gap-1 text-[10px] font-bold text-muted-foreground border rounded-lg px-2 py-1.5 hover:bg-muted"
          >
            <Trophy className="h-3 w-3" /> Study Time History
          </button>
        </div>

        {/* Premium ATLAS Focus Timer banner */}
        <div className="flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-2">
          <Icon className={cn("h-4 w-4", meta.color)} />
          <span className="text-sm font-black tracking-wide bg-gradient-to-r from-primary via-primary/70 to-primary bg-clip-text text-transparent">
            ATLAS Focus Timer
          </span>
          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-gradient-to-r from-primary to-primary/70 text-primary-foreground tracking-wide">
            PREMIUM
          </span>
        </div>

        {/* Unified box — Mood row + Digital timer + Controls together, matching AtlasApp's timer-unified-box */}
        <div
          className={cn(
            "rounded-2xl p-4 flex flex-col items-center gap-4 border-2 shadow-sm",
            mood === "study" && "border-emerald-500/30 bg-emerald-500/5",
            mood === "break" && "border-amber-500/30 bg-amber-500/5",
            mood === "sleep" && "border-indigo-500/30 bg-indigo-500/5"
          )}
        >
          {/* Mood switcher (top row, inside unified box) */}
          <div className="grid grid-cols-3 gap-1.5 w-full">
            {(Object.keys(MOOD_META) as Mood[]).map((m) => {
              const md = MOOD_META[m];
              const MIcon = md.icon;
              const active = mood === m;
              return (
                <button
                  key={m}
                  onClick={() => requestSwitchMood(m)}
                  className={cn(
                    "relative overflow-hidden flex flex-col items-center gap-1 rounded-xl py-2 border-[1.5px] text-white transition-all duration-300",
                    active ? MOOD_BTN_ACTIVE[m] : MOOD_BTN_IDLE[m]
                  )}
                >
                  <MIcon className="h-4 w-4" />
                  <span className="text-[9px] font-extrabold tracking-wide">{md.label}</span>
                  <span
                    className={cn(
                      "h-1.5 w-1.5 rounded-full transition-all",
                      active ? "bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]" : "bg-white/40"
                    )}
                  />
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 text-sm font-bold">
            <Icon className={cn("h-4 w-4", meta.color)} />
            <span className={meta.color}>
              {meta.label} Mode{mood === "study" && sessionNumber > 1 ? ` (Session ${sessionNumber})` : ""}
            </span>
            {running && paused && (
              <span className="text-[10px] font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                Paused
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <div
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl px-3.5 py-2.5 border transition-colors duration-500 shadow-[0_2px_8px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.07)]",
                MOOD_DIGIT_BOX[mood]
              )}
            >
              <span className="font-mono text-3xl font-black tabular-nums tracking-wider text-white [text-shadow:0_0_4px_rgba(255,255,255,.18)]">{h}</span>
              <span className="text-[9px] font-bold text-white/70 tracking-wide">HRS</span>
            </div>
            <span className="pb-4 text-lg font-black text-muted-foreground animate-colon-blink">:</span>
            <div
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl px-3.5 py-2.5 border transition-colors duration-500 shadow-[0_2px_8px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.07)]",
                MOOD_DIGIT_BOX[mood]
              )}
            >
              <span className="font-mono text-3xl font-black tabular-nums tracking-wider text-white [text-shadow:0_0_4px_rgba(255,255,255,.18)]">{min}</span>
              <span className="text-[9px] font-bold text-white/70 tracking-wide">MIN</span>
            </div>
            <span className="pb-4 text-lg font-black text-muted-foreground animate-colon-blink">:</span>
            <div
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl px-3.5 py-2.5 border transition-colors duration-500 shadow-[0_2px_8px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.07)]",
                MOOD_DIGIT_BOX[mood]
              )}
            >
              <span className="font-mono text-3xl font-black tabular-nums tracking-wider text-white [text-shadow:0_0_4px_rgba(255,255,255,.18)]">{s}</span>
              <span className="text-[9px] font-bold text-white/70 tracking-wide">SEC</span>
            </div>
          </div>

          <div className="flex gap-2 w-full">
            {!running && (
              <button
                onClick={() => (user ? void start() : setShowAuthPrompt(true))}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm"
              >
                <Play className="h-4 w-4 fill-current" /> পড়াশোনা শুরু করো
              </button>
            )}
            {running && mood === "study" && !paused && (
              <>
                <button
                  onClick={() => void switchMood("break")}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border font-bold text-sm hover:bg-muted"
                >
                  <Pause className="h-4 w-4" /> Pause
                </button>
                <button
                  onClick={() => void stop()}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-destructive text-destructive-foreground font-bold text-sm"
                >
                  <Square className="h-4 w-4" /> Stop
                </button>
              </>
            )}
            {running && mood === "study" && paused && (
              <>
                <button
                  onClick={resume}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm"
                >
                  <Play className="h-4 w-4 fill-current" /> Resume
                </button>
                <button
                  onClick={() => void stop()}
                  className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-destructive text-destructive-foreground font-bold text-sm"
                >
                  <Square className="h-4 w-4" /> Stop
                </button>
              </>
            )}
            {/* Break/Sleep mood: no Pause/Resume/Stop controls — switching mood (tabs above) is enough, matching AtlasApp exactly */}
          </div>
        </div>

        {/* ═══ ULTIMATE LEADERBOARD TRIGGER — title + বিগত X দিন period row ONLY.
             Matches AtlasApp exactly: tapping a period button opens a separate fullscreen
             view (openLbView) — the podium + ranked list do NOT render inline here. ═══ */}
        <div id="focus-leaderboard" className="space-y-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            <h2 className="font-extrabold text-sm">Ultimate Leaderboard</h2>
          </div>

          <div className="flex gap-2">
            {[3, 7, 15, 30].map((d) => (
              <button
                key={d}
                onClick={() => {
                  setLeaderboardMood("study");
                  setLeaderboardDays(d);
                  setShowLbFullScreen(true);
                  try {
                    window.history.pushState({ focusLbFullScreen: true }, "");
                  } catch {
                    /* ignore */
                  }
                }}
                className="flex-1 px-2 py-1.5 rounded-full text-[11px] font-bold border bg-card border-border text-muted-foreground hover:border-primary/40 transition-colors"
              >
                বিগত {d} দিন
              </button>
            ))}
          </div>
        </div>


        <div className="border-t" />

        {/* ═══ LIVE STATS ROW — পড়ছে/বিরতিতে/ঘুমাচ্ছে counts (matches AtlasApp live-stats-row) ═══ */}
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(MOOD_META) as Mood[]).map((m) => {
            const count = (liveNow || []).filter((r: any) => r.mood === m).length;
            const md = MOOD_META[m];
            const isActive = mood === m;
            return (
              <div
                key={m}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-xl border bg-card py-2 transition-colors duration-200",
                  isActive && m === "study" && "border-emerald-500 bg-emerald-500/[0.08]",
                  isActive && m === "break" && "border-amber-500 bg-amber-500/[0.08]",
                  isActive && m === "sleep" && "border-indigo-400 bg-indigo-400/[0.08]"
                )}
              >
                <span className={cn("text-lg font-black", md.color)}>{count}</span>
                <span className="text-[10px] font-bold text-muted-foreground">{md.statLabel}</span>
              </div>
            );
          })}
        </div>

        {/* ═══ MOOD INLINE LIST — only when own current mood is break/sleep, shows a small
             chip list of everyone else currently in that same mood (matches AtlasApp's
             updateMoodInlineList / #moodInlineList exactly) ═══ */}
        {(mood === "break" || mood === "sleep") && (() => {
          const list = (liveNow || []).filter((r: any) => r.mood === mood);
          const selfInList = list.some((r: any) => r.user_id === user?.id);
          const others = list.filter((r: any) => r.user_id !== user?.id);
          if (list.length === 0 || (list.length === 1 && selfInList)) {
            return (
              <div className="mx-0 mb-2 px-2.5 py-2 rounded-lg border bg-card flex items-center">
                <span className="text-[11px] text-muted-foreground">
                  {mood === "break" ? "🧃 এখন তুমি একাই বিরতিতে" : "🌙 এখন তুমি একাই ঘুমে"}
                </span>
              </div>
            );
          }
          return (
            <div className="mx-0 mb-2 px-2.5 py-2 rounded-lg border bg-card flex flex-wrap gap-1.5 items-center">
              {list.map((r: any) => {
                const isMe = r.user_id === user?.id;
                return (
                  <span
                    key={r.user_id}
                    className={cn(
                      "inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10.5px] font-bold",
                      mood === "break" ? "bg-amber-500/12 text-amber-500" : "bg-indigo-400/12 text-indigo-400",
                      isMe && "font-black shadow-[0_0_0_1.5px_currentColor_inset]"
                    )}
                  >
                    {mood === "break" ? "☕" : "😴"} {isMe ? "তুমি" : (r.full_name || "Student")}
                  </span>
                );
              })}
            </div>
          );
        })()}

        {/* ═══ TODAY LIVE — always-visible pulsing green banner + batch filter + আজকে/X দিন row + list (matches AtlasApp live-today-section) ═══ */}
        <div className="space-y-3">
          <div className="flex items-center justify-center gap-1.5 text-sm font-black text-emerald-500 bg-emerald-500/10 border border-emerald-500/25 rounded-lg px-3 py-2.5">
            <span className="h-[7px] w-[7px] rounded-full bg-emerald-500 animate-pulse" />
            {mood === "break" ? "☕ বিরতিতে আছে" : mood === "sleep" ? "😴 ঘুমাচ্ছে" : "এখন Live পড়ছে"}
          </div>
          <>
            {/* Batch filter chips — Atlas: batch-filter row, only shown when >1 batch present */}
            {(() => {
              const moodPool = mood === "study" ? (liveNow || []) : (liveNow || []).filter((r: any) => r.mood === mood);
              const batches = Array.from(
                new Set(moodPool.map((r: any) => r.hsc_batch || "অন্যান্য"))
              );
              if (batches.length <= 1) return null;
              return (
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  <button
                    onClick={() => setSelectedBatch("all")}
                    className={cn(
                      "flex-shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold border",
                      selectedBatch === "all"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card border-border text-muted-foreground"
                    )}
                  >
                    সবাই ({moodPool.length})
                  </button>
                  {batches.map((b) => {
                    const cnt = moodPool.filter((r: any) => (r.hsc_batch || "অন্যান্য") === b).length;
                    return (
                      <button
                        key={b as string}
                        onClick={() => setSelectedBatch(b as string)}
                        className={cn(
                          "flex-shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold border",
                          selectedBatch === b
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-card border-border text-muted-foreground"
                        )}
                      >
                        {b as string} ({cnt})
                      </button>
                    );
                  })}
                </div>
              );
            })()}

            {/* আজকে/৩/৭/১৫/৩০ দিন — Atlas: mood-period-row-compact, no "বিগত" prefix here */}
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {[1, 3, 7, 15, 30].map((d) => (
                <button
                  key={d}
                  onClick={() => setLeaderboardDays(d)}
                  className={cn(
                    "flex-shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold border",
                    leaderboardDays === d
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card border-border text-muted-foreground"
                  )}
                >
                  {d === 1 ? "আজকে" : `${d} দিন`}
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              {(() => {
                const moodPool = mood === "study" ? (liveNow || []) : (liveNow || []).filter((r: any) => r.mood === mood);
                const filtered = moodPool.filter(
                  (r: any) => selectedBatch === "all" || (r.hsc_batch || "অন্যান্য") === selectedBatch
                );
                if (filtered.length === 0) {
                  const emptyMsg =
                    mood === "break"
                      ? "এই মুহূর্তে কেউ বিরতিতে নেই"
                      : mood === "sleep"
                      ? "এই মুহূর্তে কেউ ঘুমাচ্ছে না"
                      : "এই মুহূর্তে কেউ নেই";
                  return (
                    <p className="text-center text-xs text-muted-foreground py-4">
                      {emptyMsg}
                    </p>
                  );
                }
                const liveAdjusted = (row: any) => {
                  if (row.user_id === user?.id) {
                    return row.duration_seconds + ((!paused && mood === row.mood) ? elapsed : 0);
                  }
                  const extra = !row.is_paused ? (nowTick, Math.floor((Date.now() - liveNowFetchedAtRef.current) / 1000)) : 0;
                  return row.duration_seconds + extra;
                };
                return [...filtered]
                  .sort((a: any, b: any) => {
                    const aPaused = !!a.is_paused ? 1 : 0;
                    const bPaused = !!b.is_paused ? 1 : 0;
                    if (aPaused !== bPaused) return aPaused - bPaused; // active (0) first, paused/break/sleep (1) below
                    return liveAdjusted(b) - liveAdjusted(a);
                  })
                  .map((row: any, i: number) => {
                  const md = MOOD_META[row.mood as Mood] || MOOD_META.study;
                  const isMe = row.user_id === user?.id;
                  const isPaused = !!row.is_paused;
                  const liveExtra = isMe
                    ? ((!paused && mood === row.mood) ? elapsed : 0)
                    : (!isPaused ? (nowTick, Math.floor((Date.now() - liveNowFetchedAtRef.current) / 1000)) : 0);
                  const t = formatHMS(row.duration_seconds + liveExtra);
                  const isRankOne = i === 0;
                  return (
                    <div
                      key={row.user_id}
                      className={cn(
                        "relative flex items-center gap-2 rounded-[10px] border px-2 py-1.5 bg-white/[0.04] backdrop-blur-md overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.07)]",
                        !isPaused && !isRankOne && "border-emerald-500/30",
                        isRankOne && !isPaused && "border-amber-400/35 bg-gradient-to-br from-amber-400/[0.07] to-white/[0.03]",
                        isPaused && "opacity-50 !border-red-500/40"
                      )}
                    >
                      {isRankOne && <div className="absolute left-0 top-0 bottom-0 w-[2.5px] bg-gradient-to-b from-amber-300 via-amber-500 to-amber-600 rounded-l" />}
                      <div className="w-[26px] text-center flex-shrink-0 font-mono font-black text-muted-foreground">
                        {i < 3 ? ["🥇", "🥈", "🥉"][i] : <span className="text-[11px]">#{i + 1}</span>}
                      </div>
                      <div className="h-[42px] w-[42px] rounded-lg flex-shrink-0 border border-white/10 bg-gradient-to-br from-indigo-500/20 to-emerald-500/15 flex items-center justify-center overflow-hidden">
                        {row.avatar_url ? (
                          <img src={row.avatar_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <User className="h-[22px] w-[22px] text-indigo-400/60" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                        <div className="text-xs font-black truncate flex items-center gap-1">
                          <span className="truncate">{row.full_name || "Student"}{isMe && " (তুমি)"}</span>
                          {row.is_premium && (
                            <span className="shrink-0 text-[7px] font-black px-[5px] py-px rounded bg-gradient-to-r from-amber-400/20 to-amber-500/10 border border-amber-400/30 text-amber-400 tracking-wide">
                              PRO
                            </span>
                          )}
                        </div>
                        {row.hsc_batch && (
                          <div className="relative overflow-hidden inline-flex items-center gap-0.5 self-start px-1.5 py-px rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-[8.5px] font-black text-indigo-400 font-mono tracking-wide">
                            HSC {row.hsc_batch}
                            <span className="absolute top-0 left-[-100%] w-full h-full bg-gradient-to-r from-transparent via-white/15 to-transparent animate-batch-shimmer" />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                        <span className={cn(
                          "inline-flex items-center gap-1 text-[7.5px] font-black px-[5px] py-px rounded-md font-mono tracking-wide",
                          isPaused ? "bg-red-500/12 text-red-500 border border-red-500/25" :
                          row.mood === "break" ? "bg-amber-500/12 text-amber-500 border border-amber-500/20" :
                          row.mood === "sleep" ? "bg-indigo-400/12 text-indigo-400 border border-indigo-400/20" :
                          "bg-emerald-500/12 text-emerald-500 border border-emerald-500/20"
                        )}>
                          <span className="h-1 w-1 rounded-full bg-current animate-focus-blink" />
                          {isPaused ? "Pause" : row.mood === "break" ? "বিরতি" : row.mood === "sleep" ? "ঘুম" : "Live"}
                        </span>
                        <div className="text-xs font-black font-mono text-emerald-500 tracking-wide">{t.h}h {t.m}m {t.s}s</div>
                        {!isMe && (
                          <button
                            onClick={() => (setCompareTarget({ userId: row.user_id, name: row.full_name || "Student", secs: row.duration_seconds }), setCmpDays(1))}
                            className="text-[9px] font-bold px-2 py-0.5 rounded-md border border-white/10 bg-white/[0.04] text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                          >
                            তুলনা করো
                          </button>
                        )}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </>
        </div>
      {stopStats && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-5">
          <div className="bg-card border rounded-2xl p-6 max-w-sm w-full space-y-4 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
            <h3 className="text-base font-extrabold">সেশন শেষ হয়েছে 🎉</h3>
            <div className="rounded-xl bg-primary/10 py-3">
              <div className="text-2xl font-black text-primary">
                {formatHMS(stopStats.studySeconds).h}h {formatHMS(stopStats.studySeconds).m}m
              </div>
              <div className="text-[11px] font-bold text-muted-foreground mt-0.5">পড়েছো</div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-muted/50 py-3">
                <div className="text-xl font-black">{stopStats.breaks}</div>
                <div className="text-[10px] font-bold text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
                  <Coffee className="h-3 w-3" /> বিরতি
                </div>
              </div>
              <div className="rounded-xl bg-muted/50 py-3">
                <div className="text-xl font-black">
                  {formatHMS(stopStats.sleepSeconds).h}:{formatHMS(stopStats.sleepSeconds).m}
                </div>
                <div className="text-[10px] font-bold text-muted-foreground flex items-center justify-center gap-1 mt-0.5">
                  <Moon className="h-3 w-3" /> ঘুম
                </div>
              </div>
            </div>
            <button
              onClick={() => setStopStats(null)}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-bold text-sm"
            >
              ঠিক আছে
            </button>
          </div>
        </div>
      )}
      {/* Full-screen mood overlay — everyone in Study/Break/Sleep, ranked by time, with period filter */}
      {overlayMood && (
        <div className="fixed inset-0 bg-background z-[70] flex flex-col">
          <div className="flex items-center gap-3 px-4 py-3 border-b">
            <button
              onClick={closeOverlay}
              className="h-9 w-9 rounded-full border flex items-center justify-center hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <h2 className={cn("flex-1 font-extrabold text-base", MOOD_META[overlayMood].color)}>
              {MOOD_META[overlayMood].label} মোডে {overlayDays === 1 ? "এখন যারা আছে" : "যারা সময় দিয়েছে"}
            </h2>
          </div>
          <div className="flex gap-2 px-4 py-2.5 border-b overflow-x-auto">
            {[1, 3, 7, 15, 30].map((d) => (
              <button
                key={d}
                onClick={() => setOverlayDays(d)}
                className={cn(
                  "px-3 py-1.5 rounded-full text-[11px] font-bold border flex-shrink-0",
                  overlayDays === d
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border text-muted-foreground"
                )}
              >
                {d === 1 ? "আজকে" : `${d} দিন`}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-1.5">
            {overlayDays === 1 ? (
              <>
                {(liveNow || []).filter((r: any) => r.mood === overlayMood).length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-10">এখন কেউ এই মোডে নেই।</p>
                )}
                {(liveNow || [])
                  .filter((r: any) => r.mood === overlayMood)
                  .sort((a: any, b: any) => b.duration_seconds - a.duration_seconds)
                  .map((row: any, i: number) => {
                    const md = MOOD_META[overlayMood];
                    const t = formatHMS(row.duration_seconds);
                    const isMe = row.user_id === user?.id;
                    const isRankOne = i === 0;
                    const isPaused = !!row.is_paused;
                    return (
                      <div
                        key={row.user_id}
                        className={cn(
                          "relative flex items-center gap-2 rounded-[10px] border px-2 py-1.5 bg-white/[0.04] backdrop-blur-md overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.07)]",
                          isRankOne && "border-amber-400/35 bg-gradient-to-br from-amber-400/[0.07] to-white/[0.03]",
                          !isRankOne && !isPaused && "border-emerald-500/30",
                          isPaused && "opacity-50 !border-red-500/40"
                        )}
                      >
                        {isRankOne && <div className="absolute left-0 top-0 bottom-0 w-[2.5px] bg-gradient-to-b from-amber-300 via-amber-500 to-amber-600 rounded-l" />}
                        {isRankOne && <div className="absolute top-0 right-0 bottom-0 w-[50px] rounded-r-[10px] bg-gradient-to-l from-amber-400/5 to-transparent pointer-events-none" />}
                        <div className="w-[38px] text-center flex-shrink-0 font-mono font-black text-muted-foreground">
                          {i < 3 ? ["🥇", "🥈", "🥉"][i] : <span className="text-[13px]">#{i + 1}</span>}
                        </div>
                        <div className="h-[42px] w-[42px] rounded-lg -ml-1.5 flex-shrink-0 border border-white/10 bg-gradient-to-br from-indigo-500/20 to-emerald-500/15 flex items-center justify-center overflow-hidden">
                          {row.avatar_url ? (
                            <img src={row.avatar_url} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <User className="h-[22px] w-[22px] text-indigo-400/60" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                          <div className="text-xs font-black truncate flex items-center gap-1">
                            <span className="truncate">{row.full_name || "Student"}{isMe && " (তুমি)"}</span>
                            {row.is_premium && (
                              <span className="shrink-0 text-[7px] font-black px-[5px] py-px rounded bg-gradient-to-r from-amber-400/20 to-amber-500/10 border border-amber-400/30 text-amber-400 tracking-wide">
                                PRO
                              </span>
                            )}
                          </div>
                          {row.hsc_batch && (
                            <div className="relative overflow-hidden inline-flex items-center gap-0.5 self-start px-1.5 py-px rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-[8.5px] font-black text-indigo-400 font-mono tracking-wide">
                              HSC {row.hsc_batch}
                              <span className="absolute top-0 left-[-100%] w-full h-full bg-gradient-to-r from-transparent via-white/15 to-transparent animate-batch-shimmer" />
                            </div>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                          <span className={cn(
                            "inline-flex items-center gap-1 text-[7.5px] font-black px-[5px] py-px rounded-md font-mono tracking-wide",
                            isPaused ? "bg-red-500/12 text-red-500 border border-red-500/25" :
                            overlayMood === "break" ? "bg-amber-500/12 text-amber-500 border border-amber-500/20" :
                            overlayMood === "sleep" ? "bg-indigo-400/12 text-indigo-400 border border-indigo-400/20" :
                            "bg-emerald-500/12 text-emerald-500 border border-emerald-500/20"
                          )}>
                            <span className="h-1 w-1 rounded-full bg-current animate-focus-blink" />
                            {isPaused ? "Pause" : overlayMood === "break" ? "বিরতি" : overlayMood === "sleep" ? "ঘুম" : "Live"}
                          </span>
                          <div className="text-xs font-black font-mono text-emerald-500 tracking-wide">{t.h}h {t.m}m</div>
                          {!isMe && (
                            <button
                              onClick={() => (setCompareTarget({ userId: row.user_id, name: row.full_name || "Student", secs: row.duration_seconds }), setCmpDays(1))}
                              className="text-[9px] font-bold px-2 py-0.5 rounded-md border border-white/10 bg-white/[0.04] text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                            >
                              তুলনা করো
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </>
            ) : (
              <>
                {(!overlayRanking || overlayRanking.length === 0) && (
                  <p className="text-center text-sm text-muted-foreground py-10">এই সময়ে কেউ এই মোডে সময় দেয়নি।</p>
                )}
                {overlayRanking?.map((row: any, i: number) => {
                  const t = formatHMS(Number(row.total_seconds));
                  const isMe = row.user_id === user?.id;
                  const isRankOne = i === 0;
                  return (
                    <div
                      key={row.user_id}
                      className={cn(
                        "relative flex items-center gap-2 rounded-[10px] border px-2 py-1.5 bg-white/[0.04] backdrop-blur-md overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.18),inset_0_1px_0_rgba(255,255,255,0.07)]",
                        isRankOne ? "border-amber-400/35 bg-gradient-to-br from-amber-400/[0.07] to-white/[0.03]" : "border-white/[0.09]"
                      )}
                    >
                      {isRankOne && <div className="absolute left-0 top-0 bottom-0 w-[2.5px] bg-gradient-to-b from-amber-300 via-amber-500 to-amber-600 rounded-l" />}
                        {isRankOne && <div className="absolute top-0 right-0 bottom-0 w-[50px] rounded-r-[10px] bg-gradient-to-l from-amber-400/5 to-transparent pointer-events-none" />}
                      <div className="w-[38px] text-center flex-shrink-0 font-mono font-black text-muted-foreground">
                        {i < 3 ? ["🥇", "🥈", "🥉"][i] : <span className="text-[13px]">#{i + 1}</span>}
                      </div>
                      <div className="h-[42px] w-[42px] rounded-lg -ml-1.5 flex-shrink-0 border border-white/10 bg-gradient-to-br from-indigo-500/20 to-emerald-500/15 flex items-center justify-center overflow-hidden">
                        {row.avatar_url ? (
                          <img src={row.avatar_url} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <User className="h-[22px] w-[22px] text-indigo-400/60" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                        <div className="text-xs font-black truncate flex items-center gap-1">
                          <span className="truncate">{row.full_name || "Student"}{isMe && " (তুমি)"}</span>
                          {row.is_premium && (
                            <span className="shrink-0 text-[7px] font-black px-[5px] py-px rounded bg-gradient-to-r from-amber-400/20 to-amber-500/10 border border-amber-400/30 text-amber-400 tracking-wide">
                              PRO
                            </span>
                          )}
                        </div>
                        {row.hsc_batch && (
                          <div className="relative overflow-hidden inline-flex items-center gap-0.5 self-start px-1.5 py-px rounded-lg bg-indigo-500/15 border border-indigo-500/30 text-[8.5px] font-black text-indigo-400 font-mono tracking-wide">
                            HSC {row.hsc_batch}
                            <span className="absolute top-0 left-[-100%] w-full h-full bg-gradient-to-r from-transparent via-white/15 to-transparent animate-batch-shimmer" />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                        <div className="text-xs font-black font-mono text-emerald-500 tracking-wide">{t.h}h {t.m}m</div>
                        {!isMe && (
                          <button
                            onClick={() => (setCompareTarget({ userId: row.user_id, name: row.full_name || "Student", secs: Number(row.total_seconds) }), setCmpDays(overlayDays))}
                            className="text-[9px] font-bold px-2 py-0.5 rounded-md border border-white/10 bg-white/[0.04] text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                          >
                            তুলনা করো
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
      {/* ═══ ULTIMATE LEADERBOARD FULLSCREEN — matches AtlasApp's #lbFullScreen exactly:
           back button + title + বিগত X দিন period row + Top Performers podium + ranked list ═══ */}
      {showLbFullScreen && (
        <div className="fixed inset-0 z-50 bg-background overflow-y-auto">
          <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex items-center gap-3">
            <button
              onClick={() => {
                setShowLbFullScreen(false);
                try {
                  window.history.back();
                } catch {
                  /* ignore */
                }
              }}
              className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> ফিরে যাও
            </button>
            <h2 className="flex-1 text-center font-extrabold text-sm">
              Ultimate Leaderboard — বিগত {leaderboardDays} দিন
            </h2>
            <div className="w-16" />
          </div>

          <div className="px-4 py-3 flex gap-2">
            {[3, 7, 15, 30].map((d) => (
              <button
                key={d}
                onClick={() => setLeaderboardDays(d)}
                className={cn(
                  "flex-1 px-2 py-1.5 rounded-full text-[11px] font-bold border",
                  leaderboardDays === d
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card border-border text-muted-foreground"
                )}
              >
                বিগত {d} দিন
              </button>
            ))}
          </div>

          <div className="px-4 pb-6 space-y-1.5">
            {(!leaderboard || leaderboard.length === 0) && (
              <p className="text-center text-xs text-muted-foreground py-6">
                এখনো কেউ এই মোডে সময় রেকর্ড করেনি।
              </p>
            )}
            {/* Top 3 Podium — matches AtlasApp's Top Performers graph */}
            {leaderboard && leaderboard.length > 0 && (() => {
              const top3 = leaderboard.slice(0, 3);
              const maxSec = Math.max(1, ...top3.map((s: any) => Number(s.total_seconds)));
              const crowns = ["👑", "🥈", "🥉"];
              const rankLabels = ["১ম", "২য়", "৩য়"];
              const barColors = ["bg-amber-500", "bg-slate-400", "bg-amber-700"];
              const textColors = ["text-amber-500", "text-slate-400", "text-amber-700"];
              return (
                <div className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/5 to-primary/5 p-3 mb-2">
                  <div className="text-center text-[10px] font-black tracking-wider text-amber-500 mb-2.5 flex items-center justify-center gap-1">
                    <Trophy className="h-3 w-3" /> TOP PERFORMERS
                  </div>
                  <div className="flex items-end justify-center gap-2">
                    {top3.map((s: any, i: number) => {
                      const secs = Number(s.total_seconds);
                      const pct = Math.max(10, Math.round((secs / maxSec) * 72));
                      const t = formatHMS(secs);
                      return (
                        <div key={s.user_id} className="flex flex-col items-center gap-0.5 flex-1 min-w-0">
                          <div className="text-sm">{crowns[i]}</div>
                          {s.avatar_url ? (
                            <img src={s.avatar_url} alt={s.full_name || "Student"} className="h-6 w-6 rounded-md object-cover border" />
                          ) : null}
                          <div className="w-full flex justify-center">
                            <div
                              className={cn("w-8 rounded-t", barColors[i])}
                              style={{ height: `${pct}px`, boxShadow: "0 0 8px rgba(0,0,0,0.15)" }}
                            />
                          </div>
                          <div className={cn("text-[10px] font-black", textColors[i])}>{rankLabels[i]}</div>
                          <div className="text-[10px] font-extrabold truncate max-w-[70px] text-center">
                            {s.full_name || "Student"}
                          </div>
                          <div className="text-[9px] text-muted-foreground">{t.h}h {t.m}m</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
            {leaderboard?.map((row: any, i: number) => {
              const isMe = row.user_id === user?.id;
              // Live ticker: for my own row, when I'm actively in this exact mood (not paused),
              // add the current in-progress elapsed seconds on top of the DB total so my time
              // visibly counts up in real-time without waiting for the 15s refetch.
              const liveExtra = (isMe && mood === leaderboardMood && !paused) ? elapsed : 0;
              const t = formatHMS(Number(row.total_seconds) + liveExtra);
              const md = MOOD_META[leaderboardMood];
              const isRankOne = i === 0;
              return (
                <button
                  key={row.user_id}
                  onClick={() => !isMe && (setCompareTarget({ userId: row.user_id, name: row.full_name || "Student", secs: Number(row.total_seconds) }), setCmpDays(1))}
                  className={cn(
                    "relative w-full flex items-center gap-2.5 rounded-lg border px-2.5 py-2 bg-card/50 text-left overflow-hidden transition-colors",
                    isMe && "border-primary/40 bg-primary/5",
                    !isMe && "hover:border-primary/30 transition-colors",
                    isRankOne && "border-amber-500/50 shadow-[0_0_16px_rgba(245,158,11,0.35)] bg-gradient-to-r from-amber-500/10 via-card/50 to-card/50"
                  )}
                >
                  {isRankOne && (
                    <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-amber-400/10 via-transparent to-transparent" />
                  )}
                  <div className={cn(
                    "h-7 w-7 rounded-full flex items-center justify-center font-black text-xs font-mono flex-shrink-0",
                    isRankOne ? "bg-amber-500 text-amber-950" : "text-muted-foreground"
                  )}>
                    {i + 1}
                  </div>
                  <div className={cn("h-8 w-8 rounded-lg border flex items-center justify-center font-extrabold text-xs flex-shrink-0 overflow-hidden", md.color, "bg-current/10")}>
                    {row.avatar_url ? (
                      <img src={row.avatar_url} alt={row.full_name || "Student"} className="h-full w-full object-cover" />
                    ) : (
                      (row.full_name || "S").charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold truncate flex items-center gap-1">
                      <span className="truncate">{row.full_name || "Student"}{isMe && " (তুমি)"}</span>
                      {row.is_premium && (
                        <span className="shrink-0 text-[7px] font-black px-1 py-0.5 rounded bg-gradient-to-r from-amber-400/20 to-amber-500/10 border border-amber-400/30 text-amber-500 tracking-wide">
                          PRO
                        </span>
                      )}
                    </div>
                    {row.hsc_batch && (
                      <div className="text-[9px] text-muted-foreground font-semibold">HSC {row.hsc_batch}</div>
                    )}
                  </div>
                  <div className={cn("text-xs font-black font-mono flex-shrink-0", md.color)}>
                    {t.h}h {t.m}m
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
      {/* Compare modal — tap any leaderboard row to compare against yourself */}
      {compareTarget && (() => {
        const myRow = leaderboard?.find((r: any) => r.user_id === user?.id);
        const snapshotMySecs = myRow ? Number(myRow.total_seconds) : 0;

        let mySecs = snapshotMySecs;
        let theirSecs = compareTarget.secs;
        if (cmpDays > 1 && cmpDaily) {
          mySecs = cmpDaily.filter((r) => r.user_id === user?.id).reduce((a, r) => a + Number(r.total_seconds), 0);
          theirSecs = cmpDaily.filter((r) => r.user_id === compareTarget.userId).reduce((a, r) => a + Number(r.total_seconds), 0);
        }

        const maxSec = Math.max(mySecs, theirSecs, 1);
        const meW = Math.round((mySecs / maxSec) * 100);
        const thW = Math.round((theirSecs / maxSec) * 100);
        const ahead = mySecs >= theirSecs;
        const diff = Math.abs(mySecs - theirSecs);
        const diffFmt = formatHMS(diff);

        const dayKeys: string[] = [];
        if (cmpDays > 1) {
          for (let i = cmpDays - 1; i >= 0; i--) {
            dayKeys.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10));
          }
        }
        const myDailyMap = new Map((cmpDaily || []).filter((r) => r.user_id === user?.id).map((r) => [r.day, Number(r.total_seconds)]));
        const theirDailyMap = new Map((cmpDaily || []).filter((r) => r.user_id === compareTarget.userId).map((r) => [r.day, Number(r.total_seconds)]));
        const graphMax = Math.max(1, ...dayKeys.map((d) => Math.max(myDailyMap.get(d) || 0, theirDailyMap.get(d) || 0)));

        return (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-5">
            <div className="bg-card border rounded-2xl p-6 max-w-sm w-full space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-extrabold">তুলনা করো</h3>
                <button
                  onClick={() => setCompareTarget(null)}
                  className="h-8 w-8 rounded-full border flex items-center justify-center hover:bg-muted"
                >
                  ✕
                </button>
              </div>

              <div className="flex gap-1.5 overflow-x-auto">
                {[1, 3, 7, 15, 30].map((d) => (
                  <button
                    key={d}
                    onClick={() => setCmpDays(d)}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-[10px] font-bold border flex-shrink-0",
                      cmpDays === d ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground"
                    )}
                  >
                    {d === 1 ? "আজকে" : `${d} দিন`}
                  </button>
                ))}
              </div>

              <div className="space-y-2.5">
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span>তুমি</span>
                    <span className="text-primary">{formatHMS(mySecs).h}h {formatHMS(mySecs).m}m</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${meW}%` }} />
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span>{compareTarget.name}</span>
                    <span className="text-indigo-400">{formatHMS(theirSecs).h}h {formatHMS(theirSecs).m}m</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${thW}%` }} />
                  </div>
                </div>
              </div>

              {cmpDays === 1 && cmpBreaksToday && (
                <div className="rounded-lg border px-3 py-2 flex items-center justify-between text-xs font-bold bg-muted/30">
                  <span className="text-muted-foreground">বিরতি (আজ)</span>
                  <span>
                    তুমি: {cmpBreaksToday.mine}টি &nbsp;|&nbsp; {compareTarget.name}: {cmpBreaksToday.theirs}টি
                  </span>
                </div>
              )}

              {cmpDays > 1 && (
                <div className="border-t pt-2.5 space-y-1.5">
                  <div className="flex items-end gap-[3px] h-9">
                    {dayKeys.map((d) => {
                      const mv = myDailyMap.get(d) || 0;
                      const tv = theirDailyMap.get(d) || 0;
                      const mh = Math.max(2, Math.round((mv / graphMax) * 36));
                      const th = Math.max(2, Math.round((tv / graphMax) * 36));
                      return (
                        <div key={d} className="flex-1 flex flex-col items-center gap-0.5 min-w-0">
                          <div className="flex items-end gap-[1.5px]" style={{ height: 36 }}>
                            <div className="w-[5px] rounded-t bg-primary" style={{ height: mh }} />
                            <div className="w-[5px] rounded-t bg-indigo-400" style={{ height: th }} />
                          </div>
                          <div className="text-[6.5px] text-muted-foreground whitespace-nowrap">{d.slice(5).replace("-", "/")}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-3 justify-center text-[8px] text-muted-foreground">
                    <span><span className="inline-block w-[7px] h-[7px] rounded-sm bg-primary mr-1 align-middle" />তুমি</span>
                    <span><span className="inline-block w-[7px] h-[7px] rounded-sm bg-indigo-400 mr-1 align-middle" />{compareTarget.name}</span>
                  </div>
                </div>
              )}

              <div
                className={cn(
                  "rounded-xl px-3 py-2.5 text-xs font-bold text-center",
                  ahead ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"
                )}
              >
                {diff === 0
                  ? "সমান সমান! একটু বেশি পড়লেই এগিয়ে যাবে।"
                  : ahead
                  ? `তুমি ${diffFmt.h}h ${diffFmt.m}m এগিয়ে আছো! এই ধারা বজায় রাখো — বিরতি কম নিলে rank আরো ভালো হবে।`
                  : `${diffFmt.h}h ${diffFmt.m}m পিছিয়ে আছো। বিরতি কমাও এবং একটানা পড়ার session বাড়াও — তাহলে দ্রুত এগিয়ে যাবে।`}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
      )}

    <Dialog open={showAuthPrompt} onOpenChange={setShowAuthPrompt}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>একাউন্ট প্রয়োজন</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Focus Timer ব্যবহার করে পড়াশোনার সময় ট্র্যাক করতে এবং rank/history সেভ রাখতে একটি একাউন্ট লাগবে। মাত্র কয়েক সেকেন্ডে ফ্রি রেজিস্ট্রেশন করে সাথে সাথেই টাইমার ব্যবহার শুরু করতে পারবে — login বারবার করার দরকার নেই।
        </p>
        <div className="flex flex-col gap-2 pt-2">
          <Button className="w-full font-bold" onClick={() => navigate("/register")}>
            একাউন্ট তৈরি করো
          </Button>
          <Button variant="outline" className="w-full" onClick={() => navigate("/login")}>
            আগে থেকে একাউন্ট থাকলে লগইন করো
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </div>
  );
};

export default FocusTimer;
