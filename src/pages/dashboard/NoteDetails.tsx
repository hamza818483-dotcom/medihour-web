
import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, FileText, Download, Calendar, BookOpen, Layers, Hash } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import remarkBreaks from "remark-breaks";
import "katex/dist/katex.min.css";
import { Badge } from "@/components/ui/badge";

const NoteDetails = () => {
  const { noteId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "View Note – Atlas";
  }, []);

  const { data: note, isLoading, isError } = useQuery({
    queryKey: ["note-details", noteId],
    queryFn: async () => {
      if (!noteId) return null;
      const { data, error } = await supabase
        .from("class_notes")
        .select("*, course:courses(name)")
        .eq("id", noteId)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: !!noteId
  });

  if (isLoading) {
      return (
          <div className="flex items-center justify-center min-h-[50vh]">
              <div className="animate-pulse text-muted-foreground">Loading note...</div>
          </div>
      );
  }

  if (isError || !note) {
      return (
          <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
              <p className="text-destructive font-medium">Note not found or you don't have permission.</p>
              <Button onClick={() => navigate(-1)}>Go Back</Button>
          </div>
      );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-20">
        <Button variant="ghost" onClick={() => navigate(-1)} className="pl-0 hover:bg-transparent hover:text-primary">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Notes
        </Button>

        <div className="space-y-4">
            <div className="space-y-2">
                <div className="flex flex-wrap gap-2 text-sm text-muted-foreground items-center">
                    <span className="font-semibold text-primary">{note.course?.name}</span>
                    {note.subject && (
                        <>
                            <span>•</span>
                            <span>{note.subject}</span>
                        </>
                    )}
                    <span>•</span>
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {new Date(note.created_at).toLocaleDateString()}</span>
                </div>
                <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">{note.title}</h1>
            </div>

            <div className="flex flex-wrap gap-2">
                {note.chapter && <Badge variant="secondary" className="gap-1"><Layers className="h-3 w-3" /> {note.chapter}</Badge>}
                {note.topic && <Badge variant="outline" className="gap-1"><Hash className="h-3 w-3" /> {note.topic}</Badge>}
            </div>
        </div>

        <Card className="min-h-[60vh] border-none shadow-sm bg-card/50">
            <CardContent className="p-6 md:p-10">
                {note.content ? (
                    <article className="prose prose-slate dark:prose-invert max-w-none prose-headings:scroll-m-20 prose-headings:tracking-tight prose-a:text-primary hover:prose-a:underline prose-img:rounded-xl">
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath, remarkBreaks]} rehypePlugins={[rehypeKatex]}>
                            {note.content}
                        </ReactMarkdown>
                    </article>
                ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-muted-foreground opacity-50">
                        <FileText className="h-16 w-16 mb-4" />
                        <p>This note has no text content.</p>
                    </div>
                )}
            </CardContent>
        </Card>

        {note.notes_url && (
            <div className="fixed bottom-6 right-6 z-10 md:static md:flex md:justify-end">
                <Button size="lg" className="shadow-lg rounded-full md:rounded-md" asChild>
                    <a href={note.notes_url} target="_blank" rel="noopener noreferrer">
                        <Download className="mr-2 h-4 w-4" /> Download PDF
                    </a>
                </Button>
            </div>
        )}
    </div>
  );
};

export default NoteDetails;
