/**
 * StudyTrackerProgress — Weak & Progress analytics leaderboard for admin.
 * Ported from AtlasApp's admin-study-tracker.js (stAdminLoadProgress).
 * Reads st_user_progress and joins to profiles (lms uses profiles, not
 * AtlasApp's phone-keyed users table).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ProgMode = "hsc" | "medical";

const RANK_COLORS: Record<number, string> = {
  1: "#F5B800",
  2: "#94A3B8",
  3: "#CD7C3A",
};
const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

export function StudyTrackerProgress() {
  const [progMode, setProgMode] = useState<ProgMode>("hsc");

  const { data: rows, isLoading } = useQuery({
    queryKey: ["admin-st-user-progress", progMode],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("st_leaderboard", { p_mode: progMode });
      if (error) throw error;
      return data || [];
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" />
          <CardTitle className="text-base">Weak &amp; Progress Analytics</CardTitle>
        </div>
        <div className="flex gap-2 pt-2">
          <Button size="sm" variant={progMode === "hsc" ? "default" : "outline"} onClick={() => setProgMode("hsc")}>
            HSC
          </Button>
          <Button size="sm" variant={progMode === "medical" ? "default" : "outline"} onClick={() => setProgMode("medical")}>
            Medical
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="text-center text-sm text-muted-foreground py-8">লোড হচ্ছে...</div>
        ) : !rows || rows.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8">
            কোনো Student এখনো Progress sync করেনি।
          </div>
        ) : (
          <div className="divide-y">
            {rows.map((r: any, i: number) => {
              const rank = i + 1;
              const name = r.full_name || "Unknown";
              const batch = r.hsc_batch || "";
              const initial = (name[0] || "?").toUpperCase();
              const rankColor = rank <= 3 ? RANK_COLORS[rank] : "hsl(var(--muted-foreground))";
              const medal = rank <= 3 ? MEDALS[rank] : rank;
              const pct = Number(r.pct || 0);
              return (
                <div key={r.user_id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="w-6 text-center text-xs font-bold flex-shrink-0" style={{ color: rankColor }}>
                    {medal}
                  </span>
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-sky-400 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {initial}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate">{name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {batch} · {r.done_topics || 0}/{r.total_topics || 0} টপিক
                    </div>
                    <div className="mt-1 h-[3px] bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-sky-400"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-sm font-extrabold flex-shrink-0" style={{ color: rankColor }}>
                    {pct.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
