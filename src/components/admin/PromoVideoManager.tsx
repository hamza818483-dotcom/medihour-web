import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const PROMO_VIDEO_KEY = "landing_promo_video";

export const PromoVideoManager = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-landing-promo-video"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", PROMO_VIDEO_KEY)
        .maybeSingle();
      return (data?.value as { title?: string; youtube_url?: string } | null) || null;
    },
  });

  useEffect(() => {
    if (data) {
      setTitle(data.title || "");
      setYoutubeUrl(data.youtube_url || "");
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("app_settings")
        .upsert({ key: PROMO_VIDEO_KEY, value: { title, youtube_url: youtubeUrl } }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Landing page promo video updated." });
      queryClient.invalidateQueries({ queryKey: ["landing-promo-video"] });
      queryClient.invalidateQueries({ queryKey: ["admin-landing-promo-video"] });
    },
    onError: (e: any) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Landing Page Promo Video</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <>
            <div className="space-y-2">
              <Label>Video Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. আমাদের সম্পর্কে জানুন" />
            </div>
            <div className="space-y-2">
              <Label>YouTube Video URL</Label>
              <Input value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} placeholder="https://www.youtube.com/watch?v=..." />
            </div>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
            <p className="text-xs text-muted-foreground">Leave URL empty to hide this card on the landing page.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
};
