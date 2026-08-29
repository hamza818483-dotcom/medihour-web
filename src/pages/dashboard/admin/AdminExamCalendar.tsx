import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Plus, Trash2, Edit, Calendar as CalendarIcon, Loader2, Save, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { format } from "date-fns";

const AdminExamCalendar = () => {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    
    const [form, setForm] = useState({
        subject_name: "",
        paper_name: "",
        exam_date: "",
        category_name: "এইচএসসি ২০২৬",
    });

    const { data: schedules, isLoading } = useQuery({
        queryKey: ["admin-exam-schedules"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("exam_schedules")
                .select("*")
                .order("category_name")
                .order("exam_date", { ascending: true });
            if (error) throw error;
            return data || [];
        }
    });

    const upsertMutation = useMutation({
        mutationFn: async (values: typeof form) => {
            if (editingId) {
                const { error } = await supabase
                    .from("exam_schedules")
                    .update({
                        subject_name: values.subject_name,
                        paper_name: values.paper_name,
                        exam_date: new Date(values.exam_date).toISOString(),
                        category_name: values.category_name,
                    })
                    .eq("id", editingId);
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from("exam_schedules")
                    .insert([{
                        subject_name: values.subject_name,
                        paper_name: values.paper_name,
                        exam_date: new Date(values.exam_date).toISOString(),
                        category_name: values.category_name,
                    }]);
                if (error) throw error;
            }
        },
        onSuccess: () => {
            toast({ title: editingId ? "Updated successfully" : "Created successfully" });
            queryClient.invalidateQueries({ queryKey: ["admin-exam-schedules"] });
            queryClient.invalidateQueries({ queryKey: ["public-exam-schedules"] });
            setIsDialogOpen(false);
            resetForm();
        },
        onError: (err: any) => {
            toast({ title: "Error", description: err.message, variant: "destructive" });
        }
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await supabase.from("exam_schedules").delete().eq("id", id);
            if (error) throw error;
        },
        onSuccess: () => {
            toast({ title: "Deleted successfully" });
            queryClient.invalidateQueries({ queryKey: ["admin-exam-schedules"] });
            queryClient.invalidateQueries({ queryKey: ["public-exam-schedules"] });
        }
    });

    const resetForm = () => {
        setForm({ subject_name: "", paper_name: "", exam_date: "", category_name: "এইচএসসি ২০২৬" });
        setEditingId(null);
    };

    const handleEdit = (schedule: any) => {
        setEditingId(schedule.id);
        setForm({
            subject_name: schedule.subject_name,
            paper_name: schedule.paper_name || "",
            exam_date: format(new Date(schedule.exam_date), "yyyy-MM-dd'T'HH:mm"),
            category_name: schedule.category_name || "এইচএসসি ২০২৬",
        });
        setIsDialogOpen(true);
    };

    const handleDelete = (id: string) => {
        if (confirm("Are you sure you want to delete this routine entry?")) {
            deleteMutation.mutate(id);
        }
    };

    const groupedSchedules = schedules?.reduce((acc: any, schedule) => {
        const category = schedule.category_name || "Uncategorized";
        if (!acc[category]) acc[category] = [];
        acc[category].push(schedule);
        return acc;
    }, {});

    return (
        <div className="container mx-auto py-6 space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Manage Exam Routine</h1>
                    <p className="text-muted-foreground text-sm">Add or edit exam schedules for students.</p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) resetForm(); }}>
                    <DialogTrigger asChild>
                        <Button onClick={() => { resetForm(); setIsDialogOpen(true); }}>
                            <Plus className="mr-2 h-4 w-4" /> Add Routine Entry
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>{editingId ? "Edit Routine" : "Add New Routine"}</DialogTitle>
                            <DialogDescription>Fill in the exam details below.</DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 pt-4">
                            <div className="space-y-2">
                                <Label>Category / Section Name</Label>
                                <Input 
                                    placeholder="e.g. এইচএসসি ২০২৬ বা মেডিকেল এডমিশন" 
                                    value={form.category_name}
                                    onChange={e => setForm(prev => ({ ...prev, category_name: e.target.value }))}
                                />
                                <p className="text-[10px] text-muted-foreground">Exams with the same category name will be grouped together.</p>
                            </div>
                            <div className="space-y-2">
                                <Label>Subject Name</Label>
                                <Input 
                                    placeholder="e.g. বাংলা" 
                                    value={form.subject_name}
                                    onChange={e => setForm(prev => ({ ...prev, subject_name: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Paper (Optional)</Label>
                                <Input 
                                    placeholder="e.g. ১ম পত্র" 
                                    value={form.paper_name}
                                    onChange={e => setForm(prev => ({ ...prev, paper_name: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Exam Date & Time</Label>
                                <Input 
                                    type="datetime-local" 
                                    value={form.exam_date}
                                    onChange={e => setForm(prev => ({ ...prev, exam_date: e.target.value }))}
                                />
                            </div>
                            <Button 
                                className="w-full" 
                                onClick={() => upsertMutation.mutate(form)}
                                disabled={upsertMutation.isPending}
                            >
                                {upsertMutation.isPending ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                                {editingId ? "Update Entry" : "Create Entry"}
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            <div className="space-y-8">
                {isLoading ? (
                    <div className="py-20 text-center"><Loader2 className="animate-spin h-10 w-10 mx-auto text-primary/50" /></div>
                ) : !schedules || schedules.length === 0 ? (
                    <div className="py-20 text-center text-muted-foreground border-2 border-dashed rounded-xl">No entries found. Add your first routine entry.</div>
                ) : Object.keys(groupedSchedules).map((category) => (
                    <div key={category} className="space-y-4">
                        <h2 className="text-lg font-bold border-l-4 border-primary pl-3">{category}</h2>
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                            {groupedSchedules[category].map((s: any) => (
                                <Card key={s.id} className="relative group">
                                    <CardHeader className="pb-3">
                                        <div className="flex justify-between items-start">
                                            <CardTitle className="text-lg">{s.subject_name}</CardTitle>
                                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEdit(s)}><Edit className="h-4 w-4" /></Button>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDelete(s.id)}><Trash2 className="h-4 w-4" /></Button>
                                            </div>
                                        </div>
                                        {s.paper_name && <CardDescription>{s.paper_name}</CardDescription>}
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                            <CalendarIcon className="h-4 w-4" />
                                            {format(new Date(s.exam_date), "PPP p")}
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default AdminExamCalendar;
