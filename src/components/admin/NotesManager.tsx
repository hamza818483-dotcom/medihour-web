
import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2, Plus, Pencil, Trash2, ArrowLeft } from "lucide-react";
import { PostEditor } from "@/components/PostEditor";
import { SUBJECTS } from "@/lib/constants";
import { CreatableSelect } from "@/components/ui/creatable-select";
import { MultiSelect } from "@/components/ui/multi-select";
import { useSearchParams } from "react-router-dom";
import { Switch } from "@/components/ui/switch";

interface NotesManagerProps {
  isFreeMode?: boolean;
}

const NotesManager = ({ isFreeMode = false }: NotesManagerProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editingNote, setEditingNote] = useState<any>(null);
  const { isAdmin } = useAuth();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get("editId");

  const [courseFilter, setCourseFilter] = useState("all");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
        setDebouncedSearch(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: courses } = useQuery({
    queryKey: ["admin-courses-list"],
    queryFn: async () => {
      const { data } = await supabase.from("courses").select("id, name, is_public");
      return data || [];
    },
    enabled: !isFreeMode // Don't fetch courses in free mode if not needed, but form might need them if we allowed switching? No.
  });

  // List state
  const { data: notes, isLoading } = useQuery({
    queryKey: ["admin-notes", isFreeMode, courseFilter, subjectFilter, debouncedSearch],
    queryFn: async () => {
      let query = supabase
        .from("class_notes")
        .select("*, courses(name)")
        .order("created_at", { ascending: false });

      if (isFreeMode) {
          query = query.is("course_id", null);
      } else {
          if (courseFilter !== "all") query = query.eq("course_id", courseFilter);
      }

      if (subjectFilter !== "all") query = query.eq("subject", subjectFilter);
      if (debouncedSearch) query = query.ilike("title", `%${debouncedSearch}%`);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    }
  });

  useEffect(() => {
    if (editId && notes?.length) {
        const note = notes.find((n: any) => n.id === editId);
        if (note) {
            setEditingNote(note);
            setIsEditing(true);
        }
    }
  }, [editId, notes]);

  if (isEditing) {
    return (
      <NoteForm
        note={editingNote}
        isFreeMode={isFreeMode}
        onClose={() => { setIsEditing(false); setEditingNote(null); }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <h1 className="text-xl font-bold tracking-tight">
            {isFreeMode ? "Manage Free Classes (Notes)" : "Manage Notes"}
        </h1>
        <Button onClick={() => setIsEditing(true)}>
          <Plus className="mr-2 h-4 w-4" /> Create Note
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
          {!isFreeMode && (
              <Select value={courseFilter} onValueChange={setCourseFilter}>
                  <SelectTrigger className="w-full sm:w-[200px]">
                      <SelectValue placeholder="All Courses" />
                  </SelectTrigger>
                  <SelectContent>
                      <SelectItem value="all">All Courses</SelectItem>
                      {courses?.map((c: any) => (
                          <SelectItem key={c.id} value={c.id}>
                              {c.name}
                          </SelectItem>
                      ))}
                  </SelectContent>
              </Select>
          )}

          <Select value={subjectFilter} onValueChange={setSubjectFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="All Subjects" />
              </SelectTrigger>
              <SelectContent>
                  <SelectItem value="all">All Subjects</SelectItem>
                  {SUBJECTS.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
              </SelectContent>
          </Select>

          <Input
              placeholder="Search Title..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full sm:w-[300px]"
          />
      </div>

      <div className="grid gap-4">
        {isLoading ? (
          <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>
        ) : notes?.length === 0 ? (
          <div className="text-center p-8 border rounded-lg text-muted-foreground">
            No notes found. Create one to get started.
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
             <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                    <tr>
                        <th className="p-3 text-left font-medium">Title</th>
                        <th className="p-3 text-left font-medium">Subject</th>
                        <th className="p-3 text-left font-medium hidden md:table-cell">Chapter</th>
                        {!isFreeMode && <th className="p-3 text-left font-medium hidden md:table-cell">Course</th>}
                        <th className="p-3 text-right font-medium">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y">
                    {notes?.map((note: any) => (
                        <tr key={note.id} className="hover:bg-muted/10">
                            <td className="p-3 font-medium">{note.title}</td>
                            <td className="p-3">{note.subject || "-"}</td>
                            <td className="p-3 hidden md:table-cell">{note.chapter || "-"}</td>
                            {!isFreeMode && <td className="p-3 hidden md:table-cell">{note.courses?.name}</td>}
                            <td className="p-3 text-right">
                                <div className="flex justify-end gap-2">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => { setEditingNote(note); setIsEditing(true); }}
                                        title="Edit Note"
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </Button>
                                    {isAdmin && <DeleteNoteButton noteId={note.id} />}
                                </div>
                            </td>
                        </tr>
                    ))}
                </tbody>
             </table>
          </div>
        )}
      </div>
    </div>
  );
};

const DeleteNoteButton = ({ noteId }: { noteId: string }) => {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [deleting, setDeleting] = useState(false);

    const handleDelete = async () => {
        if (!confirm("Delete this note?")) return;
        setDeleting(true);
        try {
            const { error } = await supabase.from("class_notes").delete().eq("id", noteId);
            if (error) throw error;
            toast({ title: "Note deleted" });
            await queryClient.invalidateQueries({ queryKey: ["admin-notes"] });
            await queryClient.invalidateQueries({ queryKey: ["public-free-notes-metadata"] });
        } catch (err: any) {
            console.error(err);
            toast({ title: "Error deleting note", description: err.message, variant: "destructive" });
        } finally {
            setDeleting(false);
        }
    };

    return (
        <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:bg-destructive/10"
            onClick={handleDelete}
            disabled={deleting}
        >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        </Button>
    );
};

const NoteForm = ({ note, onClose, isFreeMode }: { note?: any, onClose: () => void, isFreeMode: boolean }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);

  const [formData, setFormData] = useState({
    title: note?.title || "",
    content: note?.content || "",
    subject: note?.subject || "",
    chapter: note?.chapter || "",
    topic: note?.topic || "",
    course_id: note?.course_id || (isFreeMode ? null : ""),
    // @ts-ignore
    shared_course_ids: note?.shared_course_ids || [],
    notes_url: note?.notes_url || "",
    // is_free removed as we rely on course_id=null
  });

  const { data: courses } = useQuery({
    queryKey: ["admin-courses-list"],
    queryFn: async () => {
      const { data } = await supabase.from("courses").select("id, name, is_public");
      return data || [];
    },
    enabled: !isFreeMode
  });

  const { data: distinctMetadata } = useQuery({
    queryKey: ["admin-notes-metadata"],
    queryFn: async () => {
       const { data } = await supabase.from("class_notes").select("subject, chapter, topic");

       const subjects = new Set<string>();
       const chapters = new Set<string>();
       const topics = new Set<string>();

       data?.forEach(item => {
           if (item.subject) subjects.add(item.subject);
           if (item.chapter) chapters.add(item.chapter);
           if (item.topic) topics.add(item.topic);
       });

       SUBJECTS.forEach(s => subjects.add(s));

       return {
           subjects: Array.from(subjects).sort().map(s => ({ label: s, value: s })),
           chapters: Array.from(chapters).sort().map(c => ({ label: c, value: c })),
           topics: Array.from(topics).sort().map(t => ({ label: t, value: t }))
       };
    }
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation: Require Title. Require Course only if NOT free mode.
    if (!formData.title) {
        toast({ title: "Required", description: "Title is required.", variant: "destructive" });
        return;
    }
    if (!isFreeMode && !formData.course_id) {
        toast({ title: "Required", description: "Course is required.", variant: "destructive" });
        return;
    }

    setLoading(true);

    try {
        const payload = {
            ...formData,
            course_id: isFreeMode ? null : formData.course_id,
            // @ts-ignore
            shared_course_ids: formData.shared_course_ids,
            notes_url: formData.notes_url || null // Handle empty string
        };

        if (note?.id) {
            const { error } = await supabase.from("class_notes").update(payload).eq("id", note.id);
            if (error) throw error;
            toast({ title: "Updated", description: "Note updated successfully." });
        } else {
            const { error } = await supabase.from("class_notes").insert([payload]);
            if (error) throw error;
            toast({ title: "Created", description: "Note created successfully." });
        }
        await queryClient.invalidateQueries({ queryKey: ["admin-notes"] });
        await queryClient.invalidateQueries({ queryKey: ["public-free-notes-metadata"] });
        onClose();
    } catch (err: any) {
        toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
        setLoading(false);
    }
  };

  const handleDelete = async () => {
      if (!confirm("Are you sure?")) return;
      setLoading(true);
      try {
        const { error } = await supabase.from("class_notes").delete().eq("id", note.id);
        if (error) throw error;
        toast({ title: "Deleted", description: "Note deleted." });
        await queryClient.invalidateQueries({ queryKey: ["admin-notes"] });
        await queryClient.invalidateQueries({ queryKey: ["public-free-notes-metadata"] });
        onClose();
      } catch (err: any) {
        toast({ title: "Error", description: err.message, variant: "destructive" });
        setLoading(false);
      }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-10">
        <div className="flex items-center justify-between">
            <Button variant="ghost" onClick={onClose}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back
            </Button>
            <h2 className="text-xl font-bold">{note ? "Edit Note" : "Create Note"}</h2>
            {note && isAdmin && (
                <Button variant="destructive" size="sm" onClick={handleDelete} disabled={loading}>
                    <Trash2 className="h-4 w-4 mr-2" /> Delete
                </Button>
            )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
            <Card>
                <CardHeader><CardTitle>Details</CardTitle></CardHeader>
                <CardContent className="grid gap-4 grid-cols-1 md:grid-cols-2">
                    {!isFreeMode && (
                        <>
                            <div className="space-y-2">
                                <Label>Course *</Label>
                                <Select value={formData.course_id || ""} onValueChange={v => setFormData({...formData, course_id: v})}>
                                    <SelectTrigger><SelectValue placeholder="Select Course" /></SelectTrigger>
                                    <SelectContent>
                                        {courses?.map((c: any) => (
                                            <SelectItem key={c.id} value={c.id}>
                                                {c.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            {formData.course_id && (
                                <div className="space-y-2">
                                    <Label>Also Share With (Optional)</Label>
                                    <MultiSelect
                                        options={courses?.map((c: any) => ({ label: c.name, value: c.id })) || []}
                                        // @ts-ignore
                                        selected={formData.shared_course_ids}
                                        // @ts-ignore
                                        onChange={(vals) => setFormData({...formData, shared_course_ids: vals})}
                                        placeholder="Select additional courses..."
                                    />
                                </div>
                            )}
                        </>
                    )}
                    <div className="space-y-2">
                        <Label>Title *</Label>
                        <Input value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="Note Title" />
                    </div>
                    <div className="space-y-2">
                        <Label>Subject</Label>
                        <CreatableSelect
                            options={distinctMetadata?.subjects || []}
                            value={formData.subject}
                            onChange={(val) => setFormData({...formData, subject: val})}
                            onCreate={(val) => setFormData({...formData, subject: val})}
                            placeholder="Select or Create Subject"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Chapter</Label>
                        <CreatableSelect
                            options={distinctMetadata?.chapters || []}
                            value={formData.chapter}
                            onChange={(val) => setFormData({...formData, chapter: val})}
                            onCreate={(val) => setFormData({...formData, chapter: val})}
                            placeholder="Select or Create Chapter"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>Topic</Label>
                        <CreatableSelect
                            options={distinctMetadata?.topics || []}
                            value={formData.topic}
                            onChange={(val) => setFormData({...formData, topic: val})}
                            onCreate={(val) => setFormData({...formData, topic: val})}
                            placeholder="Select or Create Topic"
                        />
                    </div>
                    <div className="space-y-2">
                        <Label>PDF URL (Optional)</Label>
                        <Input value={formData.notes_url} onChange={e => setFormData({...formData, notes_url: e.target.value})} placeholder="https://..." />
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader><CardTitle>Content</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                    <PostEditor
                        initialValue={formData.content}
                        onChange={(val) => setFormData({...formData, content: val})}
                    />
                </CardContent>
            </Card>

            <div className="flex justify-end gap-4">
                <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                <Button type="submit" disabled={loading}>
                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save Note
                </Button>
            </div>
        </form>
    </div>
  );
};

export default NotesManager;
