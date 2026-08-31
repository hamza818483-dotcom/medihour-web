import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Mail, MessageCircle, Facebook, Users, Send, Youtube, Save } from "lucide-react";

const AdminOfficialLinks = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [facebookPage, setFacebookPage] = useState("");
  const [facebookGroup, setFacebookGroup] = useState("");
  const [telegram, setTelegram] = useState("");
  const [youtube, setYoutube] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["official-links"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("official_links")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (data) {
      setEmail(data.email || "");
      setWhatsapp(data.whatsapp || "");
      setFacebookPage(data.facebook_page || "");
      setFacebookGroup(data.facebook_group || "");
      setTelegram(data.telegram || "");
      setYoutube(data.youtube || "");
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("official_links")
        .upsert({
          id: 1,
          email,
          whatsapp,
          facebook_page: facebookPage,
          facebook_group: facebookGroup,
          telegram,
          youtube,
          updated_at: new Date().toISOString(),
        });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Official links updated" });
      queryClient.invalidateQueries({ queryKey: ["official-links"] });
    },
    onError: (err: any) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Official Links</h2>
        <p className="text-sm text-muted-foreground">Site-wide contact & social links (Footer, WhatsApp buttons, etc.)</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contact & Social</CardTitle>
          <CardDescription>These links appear across the site (Footer, help buttons).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2"><Mail className="h-4 w-4 text-primary" /> Official Gmail</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="official@gmail.com" />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-green-600" /> WhatsApp Number</Label>
            <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+8801XXXXXXXXX" />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2"><Facebook className="h-4 w-4 text-blue-600" /> Facebook Page</Label>
            <Input value={facebookPage} onChange={(e) => setFacebookPage(e.target.value)} placeholder="https://facebook.com/..." />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2"><Users className="h-4 w-4 text-blue-500" /> Facebook Group</Label>
            <Input value={facebookGroup} onChange={(e) => setFacebookGroup(e.target.value)} placeholder="https://facebook.com/share/g/..." />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2"><Send className="h-4 w-4 text-sky-500" /> Telegram</Label>
            <Input value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="https://t.me/..." />
          </div>
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2"><Youtube className="h-4 w-4 text-red-600" /> YouTube</Label>
            <Input value={youtube} onChange={(e) => setYoutube(e.target.value)} placeholder="https://youtube.com/@..." />
          </div>

          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="w-full">
            <Save className="h-4 w-4 mr-2" /> {saveMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminOfficialLinks;
