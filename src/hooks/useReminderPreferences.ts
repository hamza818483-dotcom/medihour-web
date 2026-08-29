import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { Tables } from "@/integrations/supabase/types";

export type ReminderPreferences = Tables<"reminder_preferences">;

export const useReminderPreferences = () => {
  const { user } = useAuth();

  const query = useQuery<{ data: ReminderPreferences | null }>({
    queryKey: ["reminder-preferences", user?.id],
    queryFn: async () => {
      if (!user) return { data: null };

      const { data, error } = await supabase
        .from("reminder_preferences")
        .select("*")
        .eq("profile_id", user.id)
        .maybeSingle();

      if (error && error.code !== "PGRST116") throw error;

      return { data: data ?? null };
    },
    enabled: !!user,
  });

  return {
    ...query,
    preferences: query.data?.data ?? null,
  };
};
