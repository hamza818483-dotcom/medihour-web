import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit2, Link as LinkIcon, Facebook, Send, Users, MessageCircle, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MultiSelect } from "@/components/ui/multi-select";

const AdminCommunity = () => {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [page, setPage] = useState(0);
    const [selectedCourse, setSelectedCourse] = useState<string>("all");
    const [platformFilter, setPlatformFilter] = useState<"all" | "facebook" | "telegram">("all");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [editingResource, setEditingResource] = useState<any>(null);
    const [showForm, setShowForm] = useState(false);

    // Fetch Courses
    const { data: courses } = useQuery({
        queryKey: ["admin-courses-simple"],
        queryFn: async () => {
            const { data, error } = await supabase.from("courses").select("id, name");
            if (error) throw error;
            return data || [];
        }
    });

    // Fetch Community Resources (Type: Link)
    const { data: resourcesData, isLoading } = useQuery({
        queryKey: ["admin-community-resources", page, selectedCourse],
        queryFn: async () => {
            let query = supabase
                .from("resources")
                .select("*, course:courses(name)", { count: 'exact' })
                .eq("resource_type", "Link"); // Focus on Links

            if (selectedCourse !== "all") {
                query = query.or(`course_id.eq.${selectedCourse},shared_course_ids.cs.{${selectedCourse}}`);
            }

            query = query
                .order("created_at", { ascending: false })
                .range(page * 10, (page + 1) * 10 - 1);

            const { data, count, error } = await query;
            if (error) throw error;
            return { data: data || [], count: count || 0 };
        }
    });

    // Fetch Telegram Support Cards (shown on Student Dashboard + Landing page), each with nested topics
    const { data: telegramSupportCards, isLoading: loadingTelegramCards } = useQuery({
        queryKey: ["admin-telegram-support-cards"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("telegram_support_cards")
                .select("*, topics:telegram_support_topics(*)")
                .order("sort_order", { ascending: true });
            if (error) throw error;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return (data || []).map((c: any) => ({
                ...c,
                topics: (c.topics || []).sort((a: any, b: any) => a.sort_order - b.sort_order),
            }));
        }
    });

    const [editingTgCard, setEditingTgCard] = useState<any>(null);
    const [showTgForm, setShowTgForm] = useState(false);

    const deleteTelegramCard = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from("telegram_support_cards").delete().eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            toast({ title: "Telegram Support card deleted" });
            queryClient.invalidateQueries({ queryKey: ["admin-telegram-support-cards"] });
        },
        onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" })
    });

    const deleteResource = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from("resources").delete().eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            toast({ title: "Community Link deleted" });
            queryClient.invalidateQueries({ queryKey: ["admin-community-resources"] });
        },
        onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" })
    });

    const resources = resourcesData?.data || [];
    const totalCount = resourcesData?.count || 0;

    const getPlatform = (url: string) => {
        if (url.includes("t.me")) return { name: "Telegram", icon: <Send className="h-3 w-3" />, color: "bg-blue-500" };
        if (url.includes("facebook") || url.includes("fb.me")) return { name: "Facebook", icon: <Facebook className="h-3 w-3" />, color: "bg-indigo-600" };
        if (url.includes("wa.me") || url.includes("whatsapp")) return { name: "WhatsApp", icon: <MessageCircle className="h-3 w-3" />, color: "bg-green-600" };
        return { name: "Link", icon: <LinkIcon className="h-3 w-3" />, color: "bg-gray-500" };
    };

    const filteredResources = resources.filter((res) => {
        if (platformFilter === "all") return true;
        if (platformFilter === "telegram") return res.url.includes("t.me");
        if (platformFilter === "facebook") return res.url.includes("facebook") || res.url.includes("fb.me");
        return true;
    });

    const handleEdit = (res: any) => {
        setEditingResource(res);
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleAddNew = () => {
        setEditingResource(null);
        setShowForm(true);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-xl font-bold tracking-tight">Community Manager</h1>
                    <p className="text-muted-foreground">Manage Telegram, Facebook, and other community links for your courses.</p>
                </div>
                {!showForm && (
                    <Button onClick={handleAddNew}>
                        <Plus className="mr-2 h-4 w-4" /> Add Community Link
                    </Button>
                )}
            </div>

            {/* Inline Form */}
            {showForm && (
                <Card className="border-primary/30 border-2">
                    <CardHeader>
                        <div className="flex items-center justify-between">
                            <div>
                                <CardTitle>{editingResource ? "Edit Community Link" : "Add Community Link"}</CardTitle>
                                <CardDescription>Add links to Telegram channels, Facebook groups, or other social platforms.</CardDescription>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => { setShowForm(false); setEditingResource(null); }}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <ResourceForm
                            initialData={editingResource}
                            courses={courses || []}
                            onSuccess={() => {
                                setShowForm(false);
                                setEditingResource(null);
                                queryClient.invalidateQueries({ queryKey: ["admin-community-resources"] });
                            }}
                            onCancel={() => { setShowForm(false); setEditingResource(null); }}
                        />
                    </CardContent>
                </Card>
            )}

            {/* Telegram Support Cards Manager */}
            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <div>
                            <CardTitle>Telegram Support</CardTitle>
                            <CardDescription>Shown on the student dashboard, 2 per row. Each card has a topic name and an embedded link.</CardDescription>
                        </div>
                        {!showTgForm && (
                            <Button onClick={() => { setEditingTgCard(null); setShowTgForm(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                                <Plus className="mr-2 h-4 w-4" /> Add Card
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {showTgForm && (
                        <Card className="border-primary/30 border-2">
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle className="text-base">{editingTgCard ? "Edit Card" : "Add Card"}</CardTitle>
                                    <Button variant="ghost" size="icon" onClick={() => { setShowTgForm(false); setEditingTgCard(null); }}>
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <TelegramSupportCardForm
                                    initialData={editingTgCard}
                                    onSuccess={() => {
                                        setShowTgForm(false);
                                        setEditingTgCard(null);
                                        queryClient.invalidateQueries({ queryKey: ["admin-telegram-support-cards"] });
                                    }}
                                    onCancel={() => { setShowTgForm(false); setEditingTgCard(null); }}
                                />
                            </CardContent>
                        </Card>
                    )}

                    {loadingTelegramCards ? (
                        <div className="text-center py-4 text-sm text-muted-foreground">Loading...</div>
                    ) : !telegramSupportCards || telegramSupportCards.length === 0 ? (
                        <div className="text-center py-6 text-sm text-muted-foreground">No Telegram Support cards added yet.</div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {telegramSupportCards.map((card) => (
                                <div key={card.id} className="rounded-lg border p-3 flex items-start justify-between gap-2">
                                    <div className="min-w-0 flex-1">
                                        <p className="font-medium text-sm truncate">{card.title}</p>
                                        {card.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{card.description}</p>}
                                        {card.topics && card.topics.length > 0 && (
                                            <div className="mt-2 space-y-1">
                                                {card.topics.map((topic: any) => (
                                                    <a key={topic.id} href={topic.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline block truncate">
                                                        • {topic.title}
                                                    </a>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex gap-1 shrink-0">
                                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditingTgCard(card); setShowTgForm(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
                                            <Edit2 className="h-3.5 w-3.5" />
                                        </Button>
                                        <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => { if (confirm("Delete this card and all its topics?")) deleteTelegramCard.mutate(card.id); }}>
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <CardTitle>Community Links</CardTitle>
                        <Select value={selectedCourse} onValueChange={setSelectedCourse}>
                            <SelectTrigger className="w-[200px]">
                                <SelectValue placeholder="Filter by Course" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Courses</SelectItem>
                                {courses?.map(c => (
                                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2 pt-2">
                        {([
                            { key: "all", label: "All" },
                            { key: "facebook", label: "Facebook" },
                            { key: "telegram", label: "Telegram" },
                        ] as const).map((p) => (
                            <button
                                key={p.key}
                                type="button"
                                onClick={() => setPlatformFilter(p.key)}
                                className={`px-3 py-1.5 rounded-full border text-xs font-bold uppercase tracking-wide transition-colors shrink-0 whitespace-nowrap ${platformFilter === p.key ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/70 hover:bg-secondary"}`}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="text-center py-4">Loading...</div>
                    ) : filteredResources.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">No community links found.</div>
                    ) : (
                        <div className="rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Platform</TableHead>
                                        <TableHead>Title</TableHead>
                                        <TableHead>Course</TableHead>
                                        <TableHead>URL</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredResources.map((res) => {
                                        const platform = getPlatform(res.url);
                                        const extraCount = res.shared_course_ids ? res.shared_course_ids.length : 0;
                                        return (
                                            <TableRow key={res.id}>
                                                <TableCell>
                                                    <Badge className={`${platform.color} hover:${platform.color} text-white gap-1`}>
                                                        {platform.icon} {platform.name}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="font-medium">
                                                    {res.title}
                                                </TableCell>
                                                <TableCell>
                                                    {res.course?.name || "All Courses"}
                                                    {extraCount > 0 && <span className="text-xs text-muted-foreground ml-1">(+{extraCount} others)</span>}
                                                </TableCell>
                                                <TableCell className="max-w-[200px] truncate text-muted-foreground">
                                                    <a href={res.url} target="_blank" rel="noreferrer" className="hover:underline hover:text-primary">
                                                        {res.url}
                                                    </a>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <Button variant="ghost" size="icon" onClick={() => handleEdit(res)}>
                                                            <Edit2 className="h-4 w-4" />
                                                        </Button>
                                                        <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => { if(confirm("Delete this link?")) deleteResource.mutate(res.id); }}>
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ResourceForm = ({ initialData, courses, onSuccess, onCancel }: { initialData: any, courses: any[], onSuccess: () => void, onCancel: () => void }) => {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [title, setTitle] = useState(initialData?.title || "");
    const [url, setUrl] = useState(initialData?.url || "");
    const [courseIds, setCourseIds] = useState<string[]>([]);
    const [description, setDescription] = useState(initialData?.description || "");

    useEffect(() => {
        const ids = [];
        if (initialData?.course_id) ids.push(initialData.course_id);
        if (initialData?.shared_course_ids && Array.isArray(initialData.shared_course_ids)) {
            ids.push(...initialData.shared_course_ids);
        }
        // Remove duplicates
        setCourseIds([...new Set(ids)]);
    }, [initialData]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const mainCourseId = courseIds.length > 0 ? courseIds[0] : null;
        const sharedIds = courseIds.length > 1 ? courseIds.slice(1) : [];

        const payload = {
            title,
            url,
            course_id: mainCourseId,
            shared_course_ids: sharedIds,
            description,
            resource_type: "Link", // Always Link for Community Manager
            subject: "Community" // Tagging it as Community
        };

        try {
            if (initialData?.id) {
                const { error } = await supabase.from("resources").update(payload).eq("id", initialData.id);
                if (error) throw error;
                toast({ title: "Updated successfully" });
            } else {
                const { error } = await supabase.from("resources").insert(payload);
                if (error) throw error;
                toast({ title: "Created successfully" });
            }
            onSuccess();
        } catch (err) {
            console.error(err);
            toast({ title: "Error", description: "Failed to save.", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    const courseOptions = courses.map(c => ({ label: c.name, value: c.id }));

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium">Title</label>
                    <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Official Telegram Channel" required />
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium">URL</label>
                    <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://t.me/..." required />
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <label className="text-sm font-medium">Courses (Optional)</label>
                    <MultiSelect
                        options={courseOptions}
                        selected={courseIds}
                        onChange={setCourseIds}
                        placeholder="Select Courses..."
                    />
                    <p className="text-xs text-muted-foreground">Select one or more courses. Leave empty for All Courses (Public).</p>
                </div>
                <div className="space-y-2">
                    <label className="text-sm font-medium">Description (Optional)</label>
                    <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Short description..." />
                </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
                <Button type="submit" disabled={loading}>{loading ? "Saving..." : "Save"}</Button>
            </div>
        </form>
    );
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const TelegramSupportCardForm = ({ initialData, onSuccess, onCancel }: { initialData: any, onSuccess: () => void, onCancel: () => void }) => {
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [title, setTitle] = useState(initialData?.title || "");
    const [description, setDescription] = useState(initialData?.description || "");
    const [topics, setTopics] = useState<{ id?: string; title: string; url: string }[]>(
        initialData?.topics && initialData.topics.length > 0
            ? initialData.topics.map((t: any) => ({ id: t.id, title: t.title, url: t.url }))
            : [{ title: "", url: "" }]
    );

    const updateTopic = (index: number, field: "title" | "url", value: string) => {
        setTopics((prev) => prev.map((t, i) => (i === index ? { ...t, [field]: value } : t)));
    };

    const addTopic = () => setTopics((prev) => [...prev, { title: "", url: "" }]);
    const removeTopic = (index: number) => setTopics((prev) => prev.filter((_, i) => i !== index));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const validTopics = topics.filter((t) => t.title.trim() && t.url.trim());
        if (validTopics.length === 0) {
            toast({ title: "Error", description: "Add at least one topic with a link.", variant: "destructive" });
            return;
        }
        setLoading(true);

        try {
            let cardId = initialData?.id;
            if (cardId) {
                const { error } = await supabase.from("telegram_support_cards").update({ title, description }).eq("id", cardId);
                if (error) throw error;
                // Replace all topics for this card
                const { error: delErr } = await supabase.from("telegram_support_topics").delete().eq("card_id", cardId);
                if (delErr) throw delErr;
            } else {
                const { data, error } = await supabase.from("telegram_support_cards").insert({ title, description }).select().single();
                if (error) throw error;
                cardId = data.id;
            }

            const { error: topicsErr } = await supabase.from("telegram_support_topics").insert(
                validTopics.map((t, i) => ({ card_id: cardId, title: t.title, url: t.url, sort_order: i }))
            );
            if (topicsErr) throw topicsErr;

            toast({ title: initialData?.id ? "Updated successfully" : "Created successfully" });
            onSuccess();
        } catch (err: any) {
            console.error(err);
            toast({ title: "Error", description: err?.message || "Failed to save.", variant: "destructive" });
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
                <label className="text-sm font-medium">Card Title</label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. HSC 27 Support" required />
            </div>
            <div className="space-y-2">
                <label className="text-sm font-medium">Description (Optional)</label>
                <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Short description shown on the card..." />
            </div>
            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">Topics / Subtopics</label>
                    <Button type="button" variant="outline" size="sm" onClick={addTopic}>
                        <Plus className="h-3.5 w-3.5 mr-1" /> Add Topic
                    </Button>
                </div>
                <div className="space-y-2">
                    {topics.map((topic, i) => (
                        <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                            <Input value={topic.title} onChange={e => updateTopic(i, "title", e.target.value)} placeholder="Topic name" />
                            <Input value={topic.url} onChange={e => updateTopic(i, "url", e.target.value)} placeholder="https://t.me/..." />
                            <Button type="button" variant="ghost" size="icon" className="h-9 w-9 text-red-500" onClick={() => removeTopic(i)} disabled={topics.length === 1}>
                                <X className="h-4 w-4" />
                            </Button>
                        </div>
                    ))}
                </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
                <Button type="submit" disabled={loading}>{loading ? "Saving..." : "Save"}</Button>
            </div>
        </form>
    );
};

export default AdminCommunity;
