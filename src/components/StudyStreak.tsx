import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Flame } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { differenceInCalendarDays, isToday, isYesterday } from "date-fns";

const StudyStreak = () => {
  const { user } = useAuth();
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStreak = async () => {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from("user_study_data")
          .select("streak_info")
          .eq("user_id", user.id)
          .single();

        if (error && error.code !== "PGRST116") throw error;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const info = data?.streak_info as any;
        const currentStreak = info?.current_streak || 0;
        const lastDate = info?.last_study_date ? new Date(info.last_study_date) : null;

        // Check if streak is broken (missed yesterday and today not done yet)
        // If last study date was yesterday or today, streak is valid.
        // If older than yesterday, reset to 0 (unless we update it now)
        let displayStreak = currentStreak;

        if (lastDate) {
            const diff = differenceInCalendarDays(new Date(), lastDate);
            if (diff > 1) {
                displayStreak = 0;
                // We don't update DB here, just display 0. DB updates on action.
                // OR we could be strict and say "0" until they do something today?
                // Usually "Streak" means "Active Streak". If I missed yesterday, it's 0.
            }
        }

        setStreak(displayStreak);

        // Auto-update streak simply by visiting dashboard?
        // Let's do it: if last date was yesterday, increment. If today, do nothing. If older, reset to 1.
        // This makes "visiting the dashboard" count as studying.
        const today = new Date().toISOString();
        let newStreak = displayStreak;
        let shouldUpdate = false;

        if (!lastDate) {
            newStreak = 1;
            shouldUpdate = true;
        } else if (isYesterday(lastDate)) {
            newStreak += 1;
            shouldUpdate = true;
        } else if (differenceInCalendarDays(new Date(), lastDate) > 1) {
            newStreak = 1; // Reset
            shouldUpdate = true;
        }
        // If isToday(lastDate), do nothing.

        if (shouldUpdate) {
            setStreak(newStreak);
            await supabase.from("user_study_data").upsert({
                user_id: user.id,
                streak_info: {
                    current_streak: newStreak,
                    last_study_date: today
                }
            }, { onConflict: 'user_id' });
        }

      } catch (error) {
        console.error("Error fetching streak:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchStreak();
  }, [user]);

  if (loading) return null;

  return (
    <Card className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950/20 dark:to-orange-900/10 border-orange-200 dark:border-orange-800">
      <CardContent className="p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-orange-100 dark:bg-orange-900/40 rounded-full">
            <Flame className={`h-6 w-6 text-orange-500 ${streak > 0 ? "fill-orange-500 animate-pulse" : ""}`} />
          </div>
          <div>
            <p className="text-sm font-medium text-orange-800 dark:text-orange-200">Study Streak</p>
            <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">
              {streak} <span className="text-sm font-normal text-orange-700/70 dark:text-orange-300/70">days</span>
            </p>
          </div>
        </div>
        <div className="text-right">
            <p className="text-xs text-orange-600/80 dark:text-orange-400/80 max-w-[120px]">
                {streak > 0 ? "Keep it up! 🔥" : "Start your streak today!"}
            </p>
        </div>
      </CardContent>
      <div className="px-4 pb-3">
        <p className="text-[10px] text-muted-foreground">
          Complete a 30 minutes plus class or attending 15 minutes plus exam will make count streak.
        </p>
      </div>
    </Card>
  );
};

export default StudyStreak;
