
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEnrollments } from "@/hooks/useEnrollments";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FileText, BookOpen, Star, ExternalLink } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { useNavigate } from "react-router-dom";

const ClassNotes = () => {
  const [selectedCourse, setSelectedCourse] = useState<string>("all");
  const [selectedSubject, setSelectedSubject] = useState<string>("all");
  const [selectedChapter, setSelectedChapter] = useState<string>("all");
  const [selectedTopic, setSelectedTopic] = useState<string>("all");

  const { data: enrollments } = useEnrollments();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Class Notes – Atlas";
  }, []);

  // Fetch Notes & User Interactions
  const { data: notesData, isLoading } = useQuery({
    queryKey: ["class-notes-enhanced", selectedCourse, selectedSubject, selectedChapter, selectedTopic, user?.id],
    queryFn: async () => {
        // 1. Fetch Notes
        let query = supabase
            .from("class_notes")
            .select("*, course:courses(name)");

        if (selectedCourse !== "all") {
            query = query.eq("course_id", selectedCourse);
        }
        if (selectedSubject !== "all") {
            query = query.eq("subject", selectedSubject);
        }
        if (selectedChapter !== "all") {
            query = query.eq("chapter", selectedChapter);
        }
        if (selectedTopic !== "all") {
            // Search in both title and topic
            query = query.or(`title.ilike.%${selectedTopic}%,topic.ilike.%${selectedTopic}%`);
        }

        const { data: notes, error: notesError } = await query;
        if (notesError) throw notesError;

        if (!user) return notes?.map(n => ({ ...n, is_bookmarked: false, sort_order: 0 })) || [];

        // 2. Fetch User States
        const { data: userStates, error: statesError } = await supabase
            .from("user_note_states")
            .select("note_id, is_bookmarked, sort_order")
            .eq("profile_id", user.id);

        if (statesError) throw statesError;

        // 3. Merge
        const merged = notes?.map(note => {
            const state = userStates?.find(s => s.note_id === note.id);
            return {
                ...note,
                is_bookmarked: state?.is_bookmarked || false,
                sort_order: state?.sort_order || 0
            };
        });

        // 4. Sort: Favorites first, then by sort_order (if set) or created_at
        return merged?.sort((a, b) => {
            if (a.is_bookmarked !== b.is_bookmarked) return b.is_bookmarked ? 1 : -1;
            // if (a.sort_order !== b.sort_order) return (a.sort_order || 0) - (b.sort_order || 0); // User order logic can be complex
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        }) || [];
    },
    enabled: !!user
  });

  const enrolledCourseIds = enrollments?.map(e => e.course_id) || [];
  const accessibleNotes = notesData?.filter(n => enrolledCourseIds.includes(n.course_id)) || [];

  const favorites = accessibleNotes.filter(n => n.is_bookmarked);
  const otherNotes = accessibleNotes.filter(n => !n.is_bookmarked);

  // Handlers
  const toggleBookmark = async (noteId: string, currentStatus: boolean) => {
      // Optimistic update
      queryClient.setQueryData(
          ["class-notes-enhanced", selectedCourse, selectedSubject, selectedChapter, selectedTopic, user?.id],
          (old: any[]) => {
              if (!old) return old;
              return old.map(n => n.id === noteId ? { ...n, is_bookmarked: !currentStatus } : n);
          }
      );

      if (user) {
          const { error } = await supabase.from("user_note_states").upsert({
              profile_id: user.id,
              note_id: noteId,
              is_bookmarked: !currentStatus
          }, { onConflict: 'profile_id, note_id' });

          if (error) {
              console.error(error);
              queryClient.invalidateQueries({ queryKey: ["class-notes-enhanced"] });
          }
      }
  };

  return (
    <div className="space-y-6 pb-20">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Class Notes</h1>
        <p className="text-sm text-muted-foreground">Access and organize your study materials.</p>
      </header>

      <div className="flex flex-col gap-4 bg-muted/30 p-4 rounded-lg border">
        <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground whitespace-nowrap hidden sm:block">Course</div>
                <Select value={selectedCourse} onValueChange={setSelectedCourse}>
                <SelectTrigger className="w-full sm:w-[200px] bg-background">
                    <SelectValue placeholder="All Courses" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Courses</SelectItem>
                    {enrollments?.map((enrollment) => (
                    <SelectItem key={enrollment.course_id} value={enrollment.course_id}>
                        {enrollment.course.name}
                    </SelectItem>
                    ))}
                </SelectContent>
                </Select>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground whitespace-nowrap hidden sm:block">Subject</div>
                <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                <SelectTrigger className="w-full sm:w-[150px] bg-background">
                    <SelectValue placeholder="All Subjects" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Subjects</SelectItem>
                    {/* Ideally fetch unique subjects from DB or use constants */}
                    {["Physics", "Chemistry", "Math", "Biology", "English", "Bangla", "ICT"].map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                </SelectContent>
                </Select>
            </div>

             <div className="flex items-center gap-2 w-full sm:w-auto">
                <div className="text-xs uppercase tracking-[0.25em] text-muted-foreground whitespace-nowrap hidden sm:block">Chapter</div>
                <Select value={selectedChapter} onValueChange={setSelectedChapter}>
                <SelectTrigger className="w-full sm:w-[150px] bg-background">
                    <SelectValue placeholder="All Chapters" />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="all">All Chapters</SelectItem>
                    {/* Ideally dynamically populated based on selected subject/course */}
                    {Array.from(new Set(notesData?.map((n: any) => n.chapter).filter(Boolean))).map((c: any) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                </SelectContent>
                </Select>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto flex-1">
                <Input
                    placeholder="Search by topic..."
                    value={selectedTopic === "all" ? "" : selectedTopic}
                    onChange={(e) => setSelectedTopic(e.target.value || "all")}
                    className="bg-background w-full"
                />
            </div>
        </div>
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground animate-pulse">Loading notes...</div>
      ) : accessibleNotes.length === 0 ? (
        <div className="text-center py-12 rounded-xl border-2 border-dashed border-muted-foreground/20">
            <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <p className="text-muted-foreground">No notes available yet.</p>
        </div>
      ) : (
        <div className="space-y-8">
            {/* Favorites Section */}
            {favorites.length > 0 && (
                <div className="space-y-4">
                    <h2 className="text-lg font-bold flex items-center gap-2 text-yellow-600 dark:text-yellow-500">
                        <Star className="h-5 w-5 fill-current" /> Favorites
                    </h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {favorites.map((note) => (
                            <NoteCard
                                key={note.id}
                                note={note}
                                onBookmark={() => toggleBookmark(note.id, note.is_bookmarked)}
                                onOpen={() => navigate(`/dashboard/class-notes/${note.id}`)}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Other Notes */}
            <div className="space-y-4">
                <h2 className="text-lg font-bold flex items-center gap-2 text-muted-foreground">
                    <BookOpen className="h-5 w-5" /> All Notes
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {otherNotes.map((note) => (
                        <NoteCard
                            key={note.id}
                            note={note}
                            onBookmark={() => toggleBookmark(note.id, note.is_bookmarked)}
                            onOpen={() => navigate(`/dashboard/class-notes/${note.id}`)}
                        />
                    ))}
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

const NoteCard = ({ note, onBookmark, onOpen }: { note: any, onBookmark: () => void, onOpen: () => void }) => {
    return (
        <Card className="border border-emerald-100 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-900 rounded-2xl shadow-md hover:shadow-lg transition-all h-full flex flex-col cursor-pointer" onClick={onOpen}>
            <CardHeader className="space-y-1">
                <div className="flex justify-between items-start gap-2">
                    <p className="text-xs font-mono uppercase text-muted-foreground truncate">
                        {note.course?.name}
                    </p>
                    <div className="flex items-center gap-1">
                        {note.subject && (
                            <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition-colors border-emerald-200 bg-emerald-100/50 text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-900/40 dark:text-emerald-100 dark:border-emerald-800">
                                {note.subject}
                            </span>
                        )}
                        <Button
                            variant="ghost"
                            size="icon"
                            className={`h-6 w-6 -mr-2 ${note.is_bookmarked ? 'text-yellow-500' : 'text-muted-foreground hover:text-yellow-500'}`}
                            onClick={(e) => { e.stopPropagation(); onBookmark(); }}
                        >
                            <Star className={`h-4 w-4 ${note.is_bookmarked ? 'fill-current' : ''}`} />
                        </Button>
                    </div>
                </div>
                <CardTitle className="text-base break-words line-clamp-2 leading-tight" title={note.title}>
                    {note.title}
                </CardTitle>
                <CardDescription className="text-xs">
                    {note.chapter ? `Ch: ${note.chapter}` : new Date(note.created_at).toLocaleDateString()}
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 flex-1">
                {note.content ? (
                    <div className="prose prose-sm dark:prose-invert line-clamp-3 text-muted-foreground/80 pointer-events-none text-xs">
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                            {note.content}
                        </ReactMarkdown>
                    </div>
                ) : (
                    <p className="text-xs text-muted-foreground/50 italic">No preview available</p>
                )}

                <div className="pt-2 mt-auto">
                    <Button size="sm" className="w-full h-8 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white border-none" onClick={(e) => { e.stopPropagation(); onOpen(); }}>
                        Note
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};

export default ClassNotes;
