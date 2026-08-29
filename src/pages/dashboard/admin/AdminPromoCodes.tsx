import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Edit, Tag, X, Copy } from "lucide-react";
import { MultiSelect } from "@/components/ui/multi-select";
import { Badge } from "@/components/ui/badge";

const promoSchema = z.object({
  code: z.string().min(3, "Code must be at least 3 characters").toUpperCase().trim(),
  discount_amount: z.coerce.number().min(1, "Amount must be positive"),
  discount_type: z.enum(["flat", "percentage"]),
  course_ids: z.array(z.string()).default([]),
  usage_limit: z.coerce.number().optional().or(z.literal("")), // optional number
  is_active: z.boolean().default(true),
  special_discount_text: z.string().optional().or(z.literal("")),
  special_discount_deadline: z.string().optional().or(z.literal("")),
});

type PromoFormValues = z.infer<typeof promoSchema>;

const AdminPromoCodes = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Manage Promo Codes – Admin";
  }, []);

  const form = useForm<PromoFormValues>({
    resolver: zodResolver(promoSchema),
    defaultValues: {
      code: "",
      discount_amount: 0,
      discount_type: "flat",
      course_ids: [],
      usage_limit: "",
      is_active: true,
      special_discount_text: "",
      special_discount_deadline: "",
    },
  });

  const { data: promos, isLoading } = useQuery({
    queryKey: ["admin-promos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("promo_codes")
        .select("*, course:courses(name)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: courses } = useQuery({
    queryKey: ["admin-courses-list"],
    queryFn: async () => {
        const { data } = await supabase.from("courses").select("id, name");
        return data || [];
    }
  });

  const courseOptions = courses?.map(c => ({ label: c.name, value: c.id })) || [];

  const upsertMutation = useMutation({
    mutationFn: async (values: PromoFormValues) => {
      // Use first course_id for legacy column, rest in course_ids
      const firstCourseId = values.course_ids.length > 0 ? values.course_ids[0] : null;

      const payload: any = {
        code: values.code,
        discount_amount: values.discount_amount,
        discount_type: values.discount_type,
        course_id: firstCourseId,
        course_ids: values.course_ids,
        usage_limit: (values.usage_limit === "" || values.usage_limit === null || isNaN(Number(values.usage_limit))) ? null : Number(values.usage_limit),
        is_active: values.is_active,
        special_discount_text: values.special_discount_text || null,
        special_discount_deadline: values.special_discount_deadline || null,
      };

      if (editingId) {
        const { error } = await supabase
          .from("promo_codes")
          .update(payload)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("promo_codes")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: editingId ? "Promo code updated" : "Promo code created" });
      queryClient.invalidateQueries({ queryKey: ["admin-promos"] });
      setShowForm(false);
      form.reset();
      setEditingId(null);
    },
    onError: (error) => {
      const isDuplicateCode = (error as any)?.message?.includes("promo_codes_code_key") || (error as any)?.code === "23505";
      toast({
        title: "Error",
        description: isDuplicateCode
          ? "এই কোড আগে থেকেই ব্যবহৃত হয়েছে — অন্য একটা কোড লিখুন।"
          : error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("promo_codes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Promo code deleted" });
      queryClient.invalidateQueries({ queryKey: ["admin-promos"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: PromoFormValues) => {
    upsertMutation.mutate(values);
  };

  const handleEdit = (promo: any) => {
    setEditingId(promo.id);
    // Build course_ids from both legacy course_id and new course_ids
    let ids: string[] = [];
    if (promo.course_ids && Array.isArray(promo.course_ids) && promo.course_ids.length > 0) {
      ids = promo.course_ids;
    } else if (promo.course_id) {
      ids = [promo.course_id];
    }

    form.reset({
      code: promo.code,
      discount_amount: promo.discount_amount,
      discount_type: promo.discount_type,
      course_ids: ids,
      usage_limit: promo.usage_limit || "",
      is_active: promo.is_active,
      special_discount_text: promo.special_discount_text || "",
      special_discount_deadline: promo.special_discount_deadline
        ? new Date(promo.special_discount_deadline).toISOString().slice(0, 16)
        : "",
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleAddNew = () => {
    setEditingId(null);
    form.reset({
      code: "",
      discount_amount: 0,
      discount_type: "flat",
      course_ids: [],
      usage_limit: "",
      is_active: true,
      special_discount_text: "",
      special_discount_deadline: "",
    });
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getCourseName = (promo: any) => {
    const ids = promo.course_ids && Array.isArray(promo.course_ids) && promo.course_ids.length > 0
      ? promo.course_ids
      : (promo.course_id ? [promo.course_id] : []);

    if (ids.length === 0) return "All Courses";

    const names = ids.map((id: string) => courses?.find(c => c.id === id)?.name || id).slice(0, 2);
    const extra = ids.length - 2;
    return names.join(", ") + (extra > 0 ? ` +${extra} more` : "");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Promo Codes</h2>
          <p className="text-muted-foreground">Manage discount codes for courses.</p>
        </div>
        {!showForm && (
          <Button onClick={handleAddNew}>
            <Plus className="mr-2 h-4 w-4" /> Create Promo
          </Button>
        )}
      </div>

      {/* Inline Form */}
      {showForm && (
        <Card className="border-primary/30 border-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{editingId ? "Edit Promo Code" : "Create Promo Code"}</CardTitle>
                <CardDescription>Set up the discount details. Coupon codes are case-insensitive.</CardDescription>
              </div>
              <Button variant="ghost" size="icon" onClick={() => { setShowForm(false); setEditingId(null); form.reset(); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                    control={form.control}
                    name="code"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Code (e.g. DISCOUNT50)</FormLabel>
                        <FormControl>
                            <Input placeholder="SUMMER24" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={form.control}
                    name="course_ids"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Courses (Optional — leave empty for all)</FormLabel>
                        <FormControl>
                            <MultiSelect
                                options={courseOptions}
                                selected={field.value}
                                onChange={field.onChange}
                                placeholder="All Courses"
                            />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                    control={form.control}
                    name="discount_type"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                                <SelectItem value="flat">Flat Amount (৳)</SelectItem>
                                <SelectItem value="percentage">Percentage (%)</SelectItem>
                            </SelectContent>
                        </Select>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={form.control}
                    name="discount_amount"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Amount</FormLabel>
                        <FormControl>
                            <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                    <FormField
                    control={form.control}
                    name="usage_limit"
                    render={({ field }) => (
                        <FormItem>
                        <FormLabel>Usage Limit (Optional)</FormLabel>
                        <FormControl>
                            <Input type="number" placeholder="Unlimited" {...field} />
                        </FormControl>
                        <FormMessage />
                        </FormItem>
                    )}
                    />
                </div>

                {/* Special Discount Section */}
                <div className="border-t pt-4 mt-4">
                  <h4 className="text-sm font-semibold mb-3">Special Discount Banner (Optional)</h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    If set, this text will appear as a promotional banner on the Course Details page.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="special_discount_text"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Discount Banner Text</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. 🎉 Special 50% off! Use code SUMMER24" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="special_discount_deadline"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Deadline (BD Time)</FormLabel>
                          <FormControl>
                            <Input type="datetime-local" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4">
                    <FormField
                        control={form.control}
                        name="is_active"
                        render={({ field }) => (
                            <FormItem className="flex flex-row items-center gap-3">
                                <FormControl>
                                    <Switch
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                    />
                                </FormControl>
                                <FormLabel className="!mt-0">Active</FormLabel>
                            </FormItem>
                        )}
                    />
                    <div className="flex gap-2">
                      <Button type="button" variant="ghost" onClick={() => { setShowForm(false); setEditingId(null); form.reset(); }}>Cancel</Button>
                      <Button type="submit" disabled={upsertMutation.isPending}>
                        {upsertMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {editingId ? "Update Promo" : "Create Promo"}
                      </Button>
                    </div>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead>Courses</TableHead>
                <TableHead>Usage</TableHead>
                <TableHead>Special Offer</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : promos?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No promo codes found. Create one to get started.
                  </TableCell>
                </TableRow>
              ) : (
                promos?.map((promo) => (
                  <TableRow key={promo.id}>
                    <TableCell className="font-mono font-bold">
                        <div className="flex items-center gap-2">
                            <Tag className="h-3 w-3 text-muted-foreground" />
                            {promo.code}
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
                                navigator.clipboard.writeText(promo.code);
                                toast({ title: "Code copied!" });
                            }}>
                                <Copy className="h-3 w-3" />
                            </Button>
                        </div>
                    </TableCell>
                    <TableCell>
                        {promo.discount_type === 'flat' ? `৳${promo.discount_amount}` : `${promo.discount_amount}%`}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px]">
                        {getCourseName(promo)}
                    </TableCell>
                    <TableCell>
                        {promo.used_count} / {promo.usage_limit || "∞"}
                    </TableCell>
                    <TableCell className="text-xs max-w-[150px]">
                        {promo.special_discount_text ? (
                            <div>
                                <span className="text-primary font-medium truncate block">{promo.special_discount_text.substring(0, 30)}...</span>
                                {promo.special_discount_deadline && (
                                    <span className="text-muted-foreground">
                                        Until {new Date(promo.special_discount_deadline).toLocaleDateString('en-BD')}
                                    </span>
                                )}
                            </div>
                        ) : (
                            <span className="text-muted-foreground">—</span>
                        )}
                    </TableCell>
                    <TableCell>
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${promo.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                            {promo.is_active ? 'Active' : 'Inactive'}
                        </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(promo)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm("Are you sure you want to delete this promo code?")) {
                              deleteMutation.mutate(promo.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminPromoCodes;
