import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import PublicHeader from "@/components/PublicHeader";
import Footer from "@/components/Footer";
import { BookOpen, FileText } from "lucide-react";

const FreeClass = () => {
  const { data: notes, isLoading } = useQuery({
    queryKey: ["public-free-classes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("class_notes")
        .select("*")
        .is("course_id", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-[110px]">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">ফ্রি ক্লাস</h1>
          <p className="mt-2 text-sm text-muted-foreground">সবার জন্য উন্মুক্ত ক্লাস নোট ও রিসোর্স</p>
        </div>

        {isLoading ? (
          <p className="text-center text-sm text-muted-foreground">লোড হচ্ছে...</p>
        ) : !notes || notes.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">এই মুহূর্তে কোনো ফ্রি ক্লাস নেই।</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {notes.map((note: any) => (
              <a
                key={note.id}
                href={note.notes_url || "#"}
                target="_blank"
                rel="noreferrer"
                className="group flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="line-clamp-2 font-bold leading-snug">{note.title}</h3>
                  {note.subject && <p className="mt-1 text-xs text-muted-foreground">{note.subject}{note.chapter ? ` • ${note.chapter}` : ""}</p>}
                </div>
                {note.notes_url && (
                  <span className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-primary">
                    <FileText className="h-3.5 w-3.5" /> দেখুন
                  </span>
                )}
              </a>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default FreeClass;
