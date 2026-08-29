import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Send } from "lucide-react";

interface TelegramChannel {
  id: string;
  name: string;
  chat_id: string;
  is_active: boolean;
}

const AdminTelegramChannels = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newName, setNewName] = useState("");
  const [newChatId, setNewChatId] = useState("");

  const { data: channels, isLoading } = useQuery({
    queryKey: ["telegram-channels"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("telegram_channels")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as TelegramChannel[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("telegram_channels")
        .insert({ name: newName.trim(), chat_id: newChatId.trim(), is_active: true });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["telegram-channels"] });
      setNewName("");
      setNewChatId("");
      toast({ title: "Channel added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("telegram_channels").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["telegram-channels"] }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("telegram_channels").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["telegram-channels"] });
      toast({ title: "Channel removed" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Send className="h-6 w-6" /> Telegram Channels
        </h1>
        <p className="text-muted-foreground">Live exam notify korar jonno channel add/manage koro</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add New Channel</CardTitle>
          <CardDescription>Bot ke oi channel e admin banate hobe age (post permission soho)</CardDescription>
        </CardHeader>
        <CardContent className="flex gap-2 flex-wrap">
          <Input
            placeholder="Channel name (e.g. Main Channel)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="max-w-xs"
          />
          <Input
            placeholder="Chat ID (e.g. -1001234567890)"
            value={newChatId}
            onChange={(e) => setNewChatId(e.target.value)}
            className="max-w-xs"
          />
          <Button
            onClick={() => addMutation.mutate()}
            disabled={!newName.trim() || !newChatId.trim() || addMutation.isPending}
          >
            {addMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
            Add
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Channels</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Chat ID</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {channels?.map((ch) => (
                  <TableRow key={ch.id}>
                    <TableCell>{ch.name}</TableCell>
                    <TableCell className="font-mono text-sm">{ch.chat_id}</TableCell>
                    <TableCell>
                      <Switch
                        checked={ch.is_active}
                        onCheckedChange={(checked) => toggleMutation.mutate({ id: ch.id, is_active: checked })}
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          if (confirm(`Delete channel "${ch.name}"?`)) deleteMutation.mutate(ch.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminTelegramChannels;
