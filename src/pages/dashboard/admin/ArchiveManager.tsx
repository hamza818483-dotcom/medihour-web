import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { MultiSelect } from "@/components/ui/multi-select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Save, Video, Trophy, Plus, Edit, Trash2, MoreHorizontal, Search, X, ArrowRight, ArrowLeft, Globe, Lock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClassForm } from "@/components/admin/ClassForm";
import { ExamForm } from "@/components/admin/ExamForm";

const PAGE_SIZE = 12; // Adjusted for card grid

const ArchiveManager = () => {
    useEffect(() => {
        document.title = "Archive Manager – Atlas";
    }, []);

    return (
        <div className="w-full px-[5px] py-4 space-y-6">
            <header className="flex flex-col gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-primary">Archive Manager</h1>
                <p className="text-muted-foreground text-sm">
                    Bridge content across courses. Manage supplementary material visibility.
                </p>
            </header>

            <Tabs defaultValue="classes" className="space-y-4">
                <TabsList className="w-full justify-start bg-muted/20 h-auto p-1 gap-1">
                    <TabsTrigger 
                        value="classes" 
                        className="flex-1 sm:flex-none py-2 px-4 gap-2 rounded-md transition-all"
                    >
                        <Video className="h-4 w-4" /> Classes
                    </TabsTrigger>
                    <TabsTrigger 
                        value="exams" 
                        className="flex-1 sm:flex-none py-2 px-4 gap-2 rounded-md transition-all"
                    >
                        <Trophy className="h-4 w-4" /> Exams
                    </TabsTrigger>
                </TabsList>
                
                <TabsContent value="classes" className="mt-0 outline-none">
                    <ContentArchiveManager type="classes" />
                </TabsContent>
                <TabsContent value="exams" className="mt-0 outline-none">
                    <ContentArchiveManager type="exams" />
                </TabsContent>
            </Tabs>
        </div>
    );
};

const ContentArchiveManager = ({ type }: { type: "classes" | "exams" }) => {
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<any>(null);
    const { toast } = useToast();
    const queryClient = useQueryClient();
    
    // Filters
    const [searchQuery, setSearchQuery] = useState("");
    const [originalCourseFilter, setOriginalCourseFilter] = useState<string>("all");
    const [archiveTargetFilter, setArchiveTargetFilter] = useState<string>("all");
    const [page, setPage] = useState(0);

    // Selection
    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [targetCourses, setTargetCourses] = useState<string[]>([]);
    const [isApplying, setIsApplying] = useState(false);

    // Fetch Courses
    const { data: courses } = useQuery({
        queryKey: ["admin-courses-list-archive"],
        queryFn: async () => {
            const { data } = await supabase.from("courses").select("id, name").order("name");
            return data || [];
        }
    });

    const courseOptions = courses?.map(c => ({ label: c.name, value: c.id })) || [];

    // Fetch Content
    const { data, isLoading } = useQuery({
        queryKey: ["admin-archive-items", type, searchQuery, originalCourseFilter, archiveTargetFilter, page],
        queryFn: async () => {
            let query = supabase
                .from(type)
                .select("*, course:courses(id, name)", { count: "exact" })
                .order("created_at", { ascending: false })
                .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

            if (searchQuery) query = query.ilike("title", `%${searchQuery}%`);
            if (originalCourseFilter !== "all") {
                if (originalCourseFilter === "null") query = query.is("course_id", null);
                else query = query.eq("course_id", originalCourseFilter);
            }
            if (archiveTargetFilter !== "all") query = query.contains("archive_course_ids", [archiveTargetFilter]);

            const { data, error, count } = await query;
            if (error) throw error;
            return { items: data, total: count || 0 };
        }
    });

    const items = data?.items || [];
    const totalItems = data?.total || 0;
    const totalPages = Math.ceil(totalItems / PAGE_SIZE);

    const handleApply = async (mode: "add" | "remove") => {
        if (selectedItems.length === 0 || targetCourses.length === 0) {
            toast({ title: "Selection missing", description: "Select items and target courses.", variant: "destructive" });
            return;
        }

        setIsApplying(true);
        try {
            const { data: currentData } = await supabase
                .from(type)
                .select("id, archive_course_ids")
                .in("id", selectedItems);

            const updates = currentData?.map(item => {
                const current = item.archive_course_ids || [];
                let updated: string[];
                if (mode === "add") updated = Array.from(new Set([...current, ...targetCourses]));
                else updated = current.filter(id => !targetCourses.includes(id));

                return { id: item.id, archive_course_ids: updated };
            }) || [];

            await Promise.all(updates.map(u =>
                supabase.from(type).update({ archive_course_ids: u.archive_course_ids, is_archive: true }).eq("id", u.id)
            ));

            toast({ title: mode === "add" ? "Added" : "Removed", description: `Updated ${updates.length} items.` });
            setSelectedItems([]);
            queryClient.invalidateQueries({ queryKey: ["admin-archive-items"] });
        } catch (err: any) {
            toast({ title: "Error", description: err.message, variant: "destructive" });
        } finally {
            setIsApplying(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this item permanently?")) return;
        try {
            if (type === 'exams') {
                 await supabase.from("exam_questions").delete().eq("exam_id", id);
                 await supabase.from("exam_attempts").delete().eq("exam_id", id);
            }
            await supabase.from(type).delete().eq("id", id);
            toast({ title: "Deleted" });
            queryClient.invalidateQueries({ queryKey: ["admin-archive-items"] });
        } catch (err: any) {
            toast({ title: "Error", description: err.message, variant: "destructive" });
        }
    };

    const handleToggleArchive = async (id: string, checked: boolean) => {
        try {
            // @ts-ignore
            await supabase.from(type).update({ is_archive: checked }).eq("id", id);
            toast({ title: "Updated", description: `Marked as ${checked ? "Archive" : "Normal"}.` });
            queryClient.invalidateQueries({ queryKey: ["admin-archive-items"] });
        } catch (err: any) {
             toast({ title: "Error", description: err.message, variant: "destructive" });
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <Card className="border-none shadow-none bg-muted/20">
                <CardContent className="p-3 space-y-4">
                    <div className="flex flex-wrap gap-2">
                        <div className="flex-1 min-w-[240px] relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by title..."
                                value={searchQuery}
                                onChange={e => { setSearchQuery(e.target.value); setPage(0); }}
                                className="pl-9 h-10"
                            />
                        </div>
                        <Select value={originalCourseFilter} onValueChange={(val) => { setOriginalCourseFilter(val); setPage(0); }}>
                            <SelectTrigger className="w-[180px] h-10">
                                <SelectValue placeholder="Original" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Original</SelectItem>
                                <SelectItem value="null">Global</SelectItem>
                                {courses?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Select value={archiveTargetFilter} onValueChange={(val) => { setArchiveTargetFilter(val); setPage(0); }}>
                            <SelectTrigger className="w-[180px] h-10">
                                <SelectValue placeholder="Targets" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Any Target</SelectItem>
                                {courses?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            <div className="flex flex-col lg:flex-row gap-6 items-start">
                <div className="flex-1 w-full space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Checkbox
                                checked={items.length > 0 && selectedItems.length === items.length}
                                onCheckedChange={(checked) => {
                                    if (checked) setSelectedItems(items.map(i => i.id));
                                    else setSelectedItems([]);
                                }}
                            />
                            <span className="text-sm font-medium">Select All</span>
                            <Badge variant="secondary" className="ml-2">{totalItems} Total</Badge>
                        </div>
                        <Button onClick={() => setIsCreateOpen(!isCreateOpen)} size="sm">
                            {isCreateOpen ? <X className="h-4 w-4 mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                            {isCreateOpen ? "Close" : `Add ${type === 'classes' ? 'Class' : 'Exam'}`}
                        </Button>
                    </div>

                    {isCreateOpen && (
                        <div className="animate-in fade-in slide-in-from-top-4 duration-300">
                            {type === 'classes' ? (
                                <ClassForm onSuccess={() => { setIsCreateOpen(false); queryClient.invalidateQueries({ queryKey: ["admin-archive-items"] }); }} isArchiveMode={true} />
                            ) : (
                                <ExamForm onSuccess={() => { setIsCreateOpen(false); queryClient.invalidateQueries({ queryKey: ["admin-archive-items"] }); }} isArchiveMode={true} />
                            )}
                        </div>
                    )}

                    {isLoading ? (
                        <div className="flex justify-center p-20"><Loader2 className="h-8 w-8 animate-spin text-primary/50" /></div>
                    ) : items.length === 0 ? (
                        <div className="p-12 text-center text-muted-foreground border-2 border-dashed rounded-xl">No content found.</div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {items.map((item: any) => (
                                <Card key={item.id} className={`relative overflow-hidden transition-all hover:shadow-md ${selectedItems.includes(item.id) ? 'border-primary ring-1 ring-primary/20' : 'border-border/50'}`}>
                                    <div className="absolute top-3 left-3 z-10">
                                        <Checkbox
                                            checked={selectedItems.includes(item.id)}
                                            onCheckedChange={(checked) => {
                                                if (checked) setSelectedItems(prev => [...prev, item.id]);
                                                else setSelectedItems(prev => prev.filter(id => id !== item.id));
                                            }}
                                        />
                                    </div>
                                    <CardHeader className="pl-10 pb-2 space-y-2">
                                        <div className="flex justify-between items-start gap-2">
                                            <CardTitle className="text-base font-semibold leading-tight line-clamp-2">{item.title}</CardTitle>
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7 -mt-1">
                                                        <MoreHorizontal className="h-4 w-4" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end">
                                                    <DropdownMenuItem onClick={() => setEditingItem(item)}><Edit className="h-4 w-4 mr-2" /> Edit</DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => handleDelete(item.id)} className="text-destructive"><Trash2 className="h-4 w-4 mr-2" /> Delete</DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {item.course ? (
                                                <Badge variant="outline" className="text-[10px] font-normal py-0">{item.course.name}</Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-[10px] font-normal py-0 border-dashed text-muted-foreground"><Globe className="h-3 w-3 mr-1" /> Global</Badge>
                                            )}
                                            <div className="flex items-center gap-1.5 ml-auto">
                                                <Switch
                                                    checked={!!item.is_archive}
                                                    onCheckedChange={(checked) => handleToggleArchive(item.id, checked)}
                                                    className="scale-75"
                                                />
                                                <span className={`text-[9px] font-bold uppercase ${item.is_archive ? 'text-purple-600' : 'text-muted-foreground'}`}>
                                                    {item.is_archive ? 'Archive' : 'Normal'}
                                                </span>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="pb-3 pt-0 space-y-3">
                                        {item.subject && (
                                            <div className="flex flex-wrap gap-1">
                                                {(Array.isArray(item.subject) ? item.subject : [item.subject]).map((s: string) => (
                                                    <span key={s} className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">{s}</span>
                                                ))}
                                            </div>
                                        )}
                                        <div className="space-y-1.5">
                                            <Label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider flex items-center gap-1">
                                                Archived For: <span className="normal-case font-normal">({item.archive_course_ids?.length || 0})</span>
                                            </Label>
                                            <div className="flex flex-wrap gap-1 max-h-[80px] overflow-y-auto pr-1">
                                                {item.archive_course_ids?.length > 0 ? (
                                                    item.archive_course_ids.map((courseId: string) => (
                                                        <Badge key={courseId} variant="secondary" className="text-[10px] font-normal px-1.5 py-0 bg-primary/5 text-primary border-primary/10">
                                                            {courses?.find(c => c.id === courseId)?.name || "Unknown"}
                                                        </Badge>
                                                    ))
                                                ) : (
                                                    <span className="text-[11px] italic text-muted-foreground">Not assigned yet.</span>
                                                )}
                                            </div>
                                        </div>
                                    </CardContent>
                                    <CardFooter className="pt-0 pb-3 block">
                                        <div className="text-[9px] text-muted-foreground font-mono flex items-center justify-between">
                                            <span>ID: {item.id.split('-')[0]}...</span>
                                            <span>{new Date(item.created_at).toLocaleDateString()}</span>
                                        </div>
                                    </CardFooter>
                                </Card>
                            ))}
                        </div>
                    )}
                    
                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 pt-4">
                            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}><ArrowLeft className="h-4 w-4" /></Button>
                            <span className="text-sm font-medium">{page + 1} / {totalPages}</span>
                            <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}><ArrowRight className="h-4 w-4" /></Button>
                        </div>
                    )}
                </div>

                <div className="w-full lg:w-[320px] shrink-0 lg:sticky lg:top-6">
                    <Card className="border-primary/20 shadow-lg overflow-hidden">
                        <div className="h-1 bg-primary w-full" />
                        <CardHeader className="pb-4 pt-4">
                            <CardTitle className="text-base flex items-center gap-2"><Save className="h-4 w-4 text-primary" /> Bulk Actions</CardTitle>
                            <CardDescription className="text-xs">Update selected {selectedItems.length} items.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label className="text-xs font-semibold">Select Target Courses</Label>
                                <MultiSelect
                                    options={courseOptions}
                                    selected={targetCourses}
                                    onChange={setTargetCourses}
                                    placeholder="Choose courses..."
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-2 pt-2">
                                <Button 
                                    onClick={() => handleApply("add")} 
                                    disabled={isApplying || selectedItems.length === 0 || targetCourses.length === 0}
                                    className="h-9 text-xs"
                                >
                                    {isApplying ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />} Add
                                </Button>
                                <Button 
                                    onClick={() => handleApply("remove")} 
                                    disabled={isApplying || selectedItems.length === 0 || targetCourses.length === 0}
                                    variant="outline"
                                    className="h-9 text-xs border-destructive/20 text-destructive hover:bg-destructive/5"
                                >
                                    {isApplying ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Trash2 className="h-3 w-3 mr-1" />} Remove
                                </Button>
                            </div>

                            {selectedItems.length > 0 && (
                                <Button variant="ghost" size="sm" onClick={() => setSelectedItems([])} className="w-full text-[11px] h-8">Clear Selection</Button>
                            )}
                        </CardContent>
                    </Card>
                    <div className="mt-4 p-3 rounded-lg bg-primary/5 border border-primary/10">
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                            <strong className="text-foreground font-bold">Tip:</strong> Items marked as Archive are only visible to students in the Archive section.
                        </p>
                    </div>
                </div>
            </div>

            <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
                <DialogContent className="max-w-3xl max-h-[95vh] overflow-y-auto p-0">
                    <div className="p-2 sm:p-4 bg-muted/20 border-b flex justify-between items-center">
                        <div>
                            <DialogTitle className="text-lg font-bold">Edit Content</DialogTitle>
                            <DialogDescription className="text-xs">Update details for {editingItem?.title}</DialogDescription>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => setEditingItem(null)}><X className="h-4 w-4" /></Button>
                    </div>
                    <div className="p-1 sm:p-2">
                        {editingItem && (
                            type === 'classes' ? (
                                <ClassForm
                                    classItem={editingItem}
                                    onSuccess={() => { setEditingItem(null); queryClient.invalidateQueries({ queryKey: ["admin-archive-items"] }); }}
                                    isArchiveMode={true}
                                />
                            ) : (
                                <ExamForm
                                    exam={editingItem}
                                    onSuccess={() => { setEditingItem(null); queryClient.invalidateQueries({ queryKey: ["admin-archive-items"] }); }}
                                    isArchiveMode={true}
                                />
                            )
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default ArchiveManager;
