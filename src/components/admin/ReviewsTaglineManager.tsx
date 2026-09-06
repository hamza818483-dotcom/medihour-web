import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

const KEY = "reviews_tagline";
const DEFAULT_TEXT = "MediHour-এর হাত ধরে সাফল্যের পথে এগিয়ে চলেছে";

export const ReviewsTaglineManager = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [text, setText] = useState(DEFAULT_TEXT);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-reviews-tagline"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", KEY).maybeSingle();
      return (data?.value as { text?: string } | null)?.text || DEFAULT_TEXT;
    },
  });

  useEffect(() => {
    if (data) setText(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("app_settings").upsert({ key: KEY, value: { text } }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "Reviews tagline updated." });
      queryClient.invalidateQueries({ queryKey: ["reviews-tagline"] });
      queryClient.invalidateQueries({ queryKey: ["admin-reviews-tagline"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Student Reviews Section Tagline</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <>
            <div className="space-y-2">
              <Label>Tagline shown above the reviews carousel</Label>
              <Input value={text} onChange={(e) => setText(e.target.value)} />
            </div>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};
