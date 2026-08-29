import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Edit2, Trash2, Plus, Search, Loader2, ImagePlus, X, BookOpen } from "lucide-react";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css";

// Helper for image upload
const uploadImage = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('https://imagehost-sigma-five.vercel.app/api/upload', {
        method: 'POST',
        headers: {
            'Authorization': 'Bearer jm4rt3hbicI7u0cutBmdQYNC95PCXvzN'
        },
        body: formData
    });
    if (!res.ok) throw new Error("Upload failed");
    const data = await res.json();
    return data.direct_url;
};

const AdminRoutines = () => {
    const [page, setPage] = useState(0);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCourse, setSelectedCourse] = useState<string>("all");
    const { toast } = useToast();
    const queryClient = useQueryClient();

    const [viewMode, setViewMode] = useState<"list" | "create" | "edit">("list");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [editingRoutine, setEditingRoutine] = useState<any>(null);

    // Fetch Courses
    const { data: courses } = useQuery({
        queryKey: ["admin-courses-simple"],
        queryFn: async () => {
            const { data, error } = await supabase.from("courses").select("id, name");
            if (error) throw error;
            return data || [];
        }
    });

    // Fetch Routines
    const { data: routinesData, isLoading } = useQuery({
        queryKey: ["admin-routines", page, searchQuery, selectedCourse],
        queryFn: async () => {
            let query = supabase
                .from("routines")
                .select("*, course:courses(name)", { count: 'exact' })
                .order("created_at", { ascending: false })
                .range(page * 10, (page + 1) * 10 - 1);

            if (searchQuery) query = query.ilike("title", `%${searchQuery}%`);
            if (selectedCourse !== "all") {
                query = query.or(`course_id.eq.${selectedCourse},course_ids.cs.{${selectedCourse}}`);
            }

            const { data, count, error } = await query;
            if (error) throw error;
            return { data: data || [], count: count || 0 };
        }
    });

    const deleteRoutine = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from("routines").delete().eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            toast({ title: "Routine deleted" });
            queryClient.invalidateQueries({ queryKey: ["admin-routines"] });
        },
        onError: (err) => toast({ title: "Error deleting routine", description: err.message, variant: "destructive" })
    });

    const routines = routinesData?.data || [];
    const totalCount = routinesData?.count || 0;
    const totalPages = Math.ceil(totalCount / 10);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-xl font-bold tracking-tight">Routine Manager</h1>
                    <p className="text-muted-foreground">Create and manage daily routines and schedules for courses.</p>
                </div>
                {viewMode === "list" ? (
                    <Button onClick={() => { setEditingRoutine(null); setViewMode("create"); }}>
                        <Plus className="mr-2 h-4 w-4" /> Create Routine
                    </Button>
                ) : (
                    <Button variant="outline" onClick={() => setViewMode("list")}>
                        <X className="mr-2 h-4 w-4" /> Cancel
                    </Button>
                )}
            </div>

            {viewMode !== "list" ? (
                <div className="bg-card border rounded-xl p-4 md:p-6 shadow-sm mt-4">
                    <h2 className="text-lg font-semibold mb-4">{viewMode === "edit" ? "Edit Routine" : "Create New Routine"}</h2>
                    <RoutineForm
                        initialData={editingRoutine}
                        courses={courses || []}
                        onSuccess={() => {
                            setViewMode("list");
                            queryClient.invalidateQueries({ queryKey: ["admin-routines"] });
                        }}
                        onCancel={() => setViewMode("list")}
                    />
                </div>
            ) : (
            <Card>
                <CardHeader>
                    <CardTitle>Routines List</CardTitle>
                    <CardDescription>Manage all routines here.</CardDescription>
                    <div className="flex items-center gap-4 mt-4">
                        <div className="relative flex-1 min-w-0">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 h-9 sm:h-10 text-xs sm:text-sm"
                            />
                        </div>
                        <Select value={selectedCourse} onValueChange={setSelectedCourse}>
                            <SelectTrigger className="w-[140px] sm:w-[200px] h-9 sm:h-10 text-xs sm:text-sm">
                                <SelectValue placeholder="Course" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Courses</SelectItem>
                                {courses?.map(c => (
                                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
                    ) : routines.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">No routines found.</div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Title</TableHead>
                                    <TableHead>Course</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {routines.map((routine) => (
                                    <TableRow key={routine.id}>
                                        <TableCell className="font-medium">{routine.title}</TableCell>
                                         <TableCell>
                                            <div className="flex flex-wrap gap-1">
                                              {routine.course?.name && (
                                                <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded border border-primary/20">{routine.course.name}</span>
                                              )}
                                              {routine.course_ids && routine.course_ids.length > 1 && routine.course_ids.filter((id: string) => id !== routine.course_id).map((id: string) => {
                                                  const c = courses?.find(course => course.id === id);
                                                  return c ? (
                                                      <span key={id} className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded border">{c.name}</span>
                                                  ) : null;
                                              })}
                                            </div>
                                          </TableCell>
                                        <TableCell>{new Date(routine.created_at).toLocaleDateString()}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => {
                                                        setEditingRoutine(routine);
                                                        setViewMode("edit");
                                                    }}
                                                >
                                                    <Edit2 className="h-4 w-4" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                                    onClick={() => {
                                                        if (confirm("Are you sure you want to delete this routine?")) {
                                                            deleteRoutine.mutate(routine.id);
                                                        }
                                                    }}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}

                    {/* Pagination */}
                    <div className="flex items-center justify-end space-x-2 py-4">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                            disabled={page === 0}
                        >
                            Previous
                        </Button>
                        <span className="text-xs text-muted-foreground">
                            Page {page + 1} of {totalPages || 1}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPage(p => p + 1)}
                            disabled={page >= totalPages - 1}
                        >
                            Next
                        </Button>
                    </div>
                </CardContent>
            </Card>
            )}
        </div>
    );
};

// Form Component
const RoutineForm = ({ initialData, courses, onSuccess, onCancel }: { initialData: any, courses: any[], onSuccess: () => void, onCancel: () => void }) => {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [title, setTitle] = useState(initialData?.title || "");
    const [courseId, setCourseId] = useState(initialData?.course_id || "");
    // Multi-course: store array of additional course IDs
    const [selectedCourseIds, setSelectedCourseIds] = useState<string[]>(initialData?.course_ids || []);
    const [content, setContent] = useState(initialData?.content || "");
    const [mediaUrls, setMediaUrls] = useState<string[]>(initialData?.media_urls || []);
    const [uploading, setUploading] = useState(false);

    const toggleCourse = (id: string) => {
        setSelectedCourseIds(prev =>
            prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
        );
    };

    const allSelectedIds = Array.from(new Set([...(courseId ? [courseId] : []), ...selectedCourseIds]));

    const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;

        setUploading(true);
        try {
            const newUrls = [];
            for (let i = 0; i < files.length; i++) {
                const url = await uploadImage(files[i]);
                if (url) newUrls.push(url);
            }
            setMediaUrls(prev => [...prev, ...newUrls]);
            toast({ title: "Images uploaded successfully" });
        } catch (err) {
            console.error(err);
            toast({ title: "Upload failed", variant: "destructive" });
        } finally {
            setUploading(false);
            e.target.value = ""; // Reset input
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title || !courseId) {
            toast({ title: "Required", description: "Title and at least one Course are required.", variant: "destructive" });
            return;
        }

        setLoading(true);
        try {
            const payload = {
                title,
                course_id: courseId,
                course_ids: allSelectedIds,
                content,
                media_urls: mediaUrls,
                is_visible: true
            };

            if (initialData?.id) {
                const { error } = await supabase.from("routines").update(payload).eq("id", initialData.id);
                if (error) throw error;
                toast({ title: "Routine updated" });
            } else {
                const { error } = await supabase.from("routines").insert(payload);
                if (error) throw error;
                toast({ title: "Routine created" });
            }
            onSuccess();
        } catch (err) {
            console.error(err);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            toast({ title: "Error", description: (err as any).message, variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    const modules = {
        toolbar: [
            [{ 'header': [1, 2, false] }],
            ['bold', 'italic', 'underline', 'strike', 'blockquote'],
            [{'list': 'ordered'}, {'list': 'bullet'}, {'indent': '-1'}, {'indent': '+1'}],
            ['link'],
            ['clean']
        ],
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium">Title</label>
                    <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="E.g., Weekly Schedule - March Week 1" required />
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium">Primary Course <span className="text-xs text-muted-foreground">(required)</span></label>
                    <Select value={courseId} onValueChange={setCourseId} required>
                        <SelectTrigger>
                            <SelectValue placeholder="Select Primary Course" />
                        </SelectTrigger>
                        <SelectContent>
                            {courses.map(c => (
                                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Multi-course selector */}
            <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                    Also share with other courses
                    <span className="text-xs text-muted-foreground font-normal">(optional — this routine will appear in all selected courses)</span>
                </label>
                <div className="border rounded-lg p-3 max-h-[200px] overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {courses.filter(c => c.id !== courseId).map(c => (
                        <div key={c.id} className="flex items-center gap-2">
                            <Checkbox
                                id={`course-${c.id}`}
                                checked={selectedCourseIds.includes(c.id)}
                                onCheckedChange={() => toggleCourse(c.id)}
                            />
                            <label htmlFor={`course-${c.id}`} className="text-sm cursor-pointer">{c.name}</label>
                        </div>
                    ))}
                    {courses.filter(c => c.id !== courseId).length === 0 && (
                        <p className="text-xs text-muted-foreground col-span-2 text-center py-2">No other courses available</p>
                    )}
                </div>
                {allSelectedIds.length > 1 && (
                    <p className="text-xs text-primary">This routine will appear in {allSelectedIds.length} courses.</p>
                )}
            </div>

            <div className="space-y-2">
                <label className="text-sm font-medium">Content (Optional description)</label>
                <div className="bg-white text-black rounded-md">
                     <ReactQuill theme="snow" value={content} onChange={setContent} modules={modules} className="h-40 mb-12" />
                </div>
            </div>

            <div className="space-y-2 pt-4">
                <label className="text-sm font-medium block">Attached Images (Routine Schedules)</label>
                <div className="flex flex-wrap gap-4 mb-2">
                    {mediaUrls.map((url, idx) => (
                        <div key={idx} className="relative group w-32 h-32 rounded-lg border overflow-hidden">
                            <img src={url} alt="Routine" className="w-full h-full object-cover" />
                            <button
                                type="button"
                                className="absolute top-1 right-1 bg-black/50 hover:bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => setMediaUrls(prev => prev.filter((_, i) => i !== idx))}
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </div>
                    ))}
                    <label className="w-32 h-32 flex flex-col items-center justify-center border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors">
                        {uploading ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : <ImagePlus className="h-6 w-6 text-muted-foreground" />}
                        <span className="text-xs text-muted-foreground mt-2">Add Image</span>
                        <input type="file" className="hidden" accept="image/*" multiple onChange={handleImageUpload} disabled={uploading} />
                    </label>
                </div>
                <p className="text-xs text-muted-foreground">Upload images of the routine here. You can upload multiple images in sequence.</p>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
                <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
                <Button type="submit" disabled={loading || uploading}>
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {initialData ? "Update Routine" : "Publish Routine"}
                </Button>
            </div>
        </form>
    );
};

export default AdminRoutines;
