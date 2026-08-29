import { useState, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MessageCircle, Trash2, Send, Radio } from "lucide-react";

type CommentRow = {
  id: string;
  class_id: string;
  user_id: string;
  parent_id: string | null;
  comment_text: string;
  created_at: string;
  profiles?: { full_name: string | null; avatar_url: string | null } | null;
};

const timeAgo = (iso: string) => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "এইমাত্র";
  if (mins < 60) return `${mins}মি`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}ঘ`;
  const days = Math.floor(hrs / 24);
  return `${days}দি`;
};

const AVATAR_COLORS = [
  "bg-red-500", "bg-orange-500", "bg-amber-500", "bg-emerald-500",
  "bg-teal-500", "bg-cyan-500", "bg-blue-500", "bg-violet-500", "bg-pink-500",
];
const colorForName = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

const ClassComments = ({ classId, isLive = false }: { classId: string; isLive?: boolean }) => {
  const { user, isAdmin } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newComment, setNewComment] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shouldAutoScroll = useRef(true);

  const { data: comments, isLoading } = useQuery({
    queryKey: ["class-comments", classId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_comments")
        .select("*, profiles:profiles(full_name, avatar_url)")
        .eq("class_id", classId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []) as CommentRow[];
    },
    enabled: !!classId,
  });

  useEffect(() => {
    if (!classId) return;
    const channel = supabase
      .channel(`class-comments-${classId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "class_comments", filter: `class_id=eq.${classId}` },
        async (payload) => {
          const row = payload.new as CommentRow;
          const { data: prof } = await supabase
            .from("profiles")
            .select("full_name, avatar_url")
            .eq("id", row.user_id)
            .single();
          queryClient.setQueryData<CommentRow[]>(["class-comments", classId], (old) => {
            if (!old) return [{ ...row, profiles: prof || null }];
            if (old.some((c) => c.id === row.id)) return old;
            return [...old, { ...row, profiles: prof || null }];
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "class_comments", filter: `class_id=eq.${classId}` },
        (payload) => {
          const oldRow = payload.old as { id: string };
          queryClient.setQueryData<CommentRow[]>(["class-comments", classId], (old) =>
            old ? old.filter((c) => c.id !== oldRow.id) : old
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [classId, queryClient]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (shouldAutoScroll.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [comments?.length]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoScroll.current = distanceFromBottom < 80;
  };

  const sendComment = async () => {
    if (!user || !newComment.trim() || sending) return;
    setSending(true);
    const text = newComment.trim();
    setNewComment("");
    shouldAutoScroll.current = true;
    const { error } = await supabase.from("class_comments").insert({
      class_id: classId,
      user_id: user.id,
      parent_id: null,
      comment_text: text,
    });
    setSending(false);
    if (error) {
      toast({ title: "কমেন্ট করা যায়নি", description: error.message, variant: "destructive" });
      setNewComment(text);
    }
  };

  const deleteComment = async (id: string) => {
    const { error } = await supabase.from("class_comments").delete().eq("id", id);
    if (error) toast({ title: "ডিলিট করা যায়নি", description: error.message, variant: "destructive" });
  };

  return (
    <div className="flex flex-col h-full rounded-xl border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b shrink-0">
        {isLive ? (
          <span className="flex items-center gap-1 text-xs font-bold text-red-600">
            <Radio className="h-3.5 w-3.5 animate-pulse" /> LIVE CHAT
          </span>
        ) : (
          <span className="flex items-center gap-1 text-sm font-semibold">
            <MessageCircle className="h-4 w-4" /> Comments
          </span>
        )}
        {comments && comments.length > 0 && (
          <span className="text-xs text-muted-foreground">({comments.length})</span>
        )}
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-[300px]"
      >
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !comments || comments.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">
            {isLive ? "লাইভ চ্যাট শুরু হয়নি — প্রথম কমেন্টটি করুন!" : "এখনো কোনো কমেন্ট নেই।"}
          </p>
        ) : (
          comments.map((c) => {
            const name = c.profiles?.full_name || "User";
            const canDelete = user && (c.user_id === user.id || isAdmin);
            return (
              <div key={c.id} className="group flex items-start gap-2 animate-in fade-in slide-in-from-bottom-1 duration-200">
                <div className={`h-6 w-6 rounded-full ${colorForName(name)} text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5 overflow-hidden`}>
                  {c.profiles?.avatar_url ? (
                    <img src={c.profiles.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    name.charAt(0).toUpperCase()
                  )}
                </div>
                <div className="flex-1 min-w-0 text-sm leading-snug">
                  <span className="font-semibold mr-1.5">{name}</span>
                  <span className="text-[10px] text-muted-foreground mr-1.5">{timeAgo(c.created_at)}</span>
                  <span className="break-words">{c.comment_text}</span>
                </div>
                {canDelete && (
                  <button
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => {
                      if (confirm("এই কমেন্ট ডিলিট করবেন?")) deleteComment(c.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-center gap-2 px-3 py-2.5 border-t shrink-0">
        {user ? (
          <>
            <Input
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendComment();
                }
              }}
              placeholder={isLive ? "লাইভ চ্যাটে বার্তা লিখুন..." : "একটি কমেন্ট লিখুন..."}
              className="h-9 rounded-full text-sm"
            />
            <Button
              size="icon"
              className="h-9 w-9 rounded-full shrink-0"
              disabled={!newComment.trim() || sending}
              onClick={sendComment}
            >
              <Send className="h-4 w-4" />
            </Button>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">চ্যাট করতে লগইন করুন।</p>
        )}
      </div>
    </div>
  );
};

export default ClassComments;
