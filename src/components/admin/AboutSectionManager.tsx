import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ImageUploader } from "@/components/ui/image-uploader";
import { Loader2, Plus, Trash2 } from "lucide-react";

const ABOUT_KEY = "about_us_section";

interface AboutStat {
  label: string;
  value: string;
}

interface AboutData {
  badge?: string;
  heading_prefix?: string;
  heading_highlight?: string;
  paragraph?: string;
  image_url?: string;
  stats?: AboutStat[];
}

const DEFAULT_ABOUT: AboutData = {
  badge: "🎯 স্বপ্ন ছোঁয়ার প্রস্তুতি",
  heading_prefix: 'স্বপ্ন ছোঁয়ার আশা থাকলে সেই স্বপ্নের ভিত তৈরিতে সাথে আছে',
  heading_highlight: '"MediHour"',
  paragraph: "",
  image_url: "",
  stats: [
    { label: "সফল শিক্ষার্থী", value: "৩৫০+" },
    { label: "অভিজ্ঞ মেন্টর", value: "১০+" },
    { label: "সন্তুষ্টি হার", value: "৯৮%" },
  ],
};

export const AboutSectionManager = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<AboutData>(DEFAULT_ABOUT);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-about-us-section"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", ABOUT_KEY).maybeSingle();
      return (data?.value as AboutData | null) || null;
    },
  });

  useEffect(() => {
    if (data) setForm({ ...DEFAULT_ABOUT, ...data, stats: data.stats?.length ? data.stats : DEFAULT_ABOUT.stats });
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("app_settings").upsert({ key: ABOUT_KEY, value: form }, { onConflict: "key" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Saved", description: "About Us section updated." });
      queryClient.invalidateQueries({ queryKey: ["about-us-section"] });
      queryClient.invalidateQueries({ queryKey: ["admin-about-us-section"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateStat = (idx: number, field: keyof AboutStat, value: string) => {
    const stats = [...(form.stats || [])];
    stats[idx] = { ...stats[idx], [field]: value };
    setForm({ ...form, stats });
  };

  const addStat = () => setForm({ ...form, stats: [...(form.stats || []), { label: "", value: "" }] });
  const removeStat = (idx: number) => setForm({ ...form, stats: (form.stats || []).filter((_, i) => i !== idx) });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Homepage "আমাদের সম্পর্কে" (About Us) Section</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <>
            <div className="space-y-2">
              <Label>Photo</Label>
              <ImageUploader value={form.image_url} onChange={(v) => setForm({ ...form, image_url: v })} placeholder="https://... or upload" />
            </div>
            <div className="space-y-2">
              <Label>Badge Text (small pill above heading)</Label>
              <Input value={form.badge} onChange={(e) => setForm({ ...form, badge: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Heading (normal part)</Label>
                <Input value={form.heading_prefix} onChange={(e) => setForm({ ...form, heading_prefix: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Heading (highlighted part)</Label>
                <Input value={form.heading_highlight} onChange={(e) => setForm({ ...form, heading_highlight: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Paragraph</Label>
              <Textarea rows={5} value={form.paragraph} onChange={(e) => setForm({ ...form, paragraph: e.target.value })} />
            </div>

            <div className="space-y-2">
              <Label>Stats (3 small boxes)</Label>
              {(form.stats || []).map((stat, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <Input placeholder="Value e.g. ৩৫০+" value={stat.value} onChange={(e) => updateStat(idx, "value", e.target.value)} />
                  <Input placeholder="Label e.g. সফল শিক্ষার্থী" value={stat.label} onChange={(e) => updateStat(idx, "label", e.target.value)} />
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeStat(idx)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addStat}>
                <Plus className="mr-2 h-4 w-4" /> Add Stat
              </Button>
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
