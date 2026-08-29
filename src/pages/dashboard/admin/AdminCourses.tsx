import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { PostEditor } from "@/components/PostEditor";
import { supabase } from "@/integrations/supabase/client";
import { Course } from "@/types/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Trash2, Ticket, Copy, Plus, X, Eye, Edit2, ExternalLink, Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { MultiSelect, Option } from "@/components/ui/multi-select";
import { CoursePositionManagerDialog } from "@/components/admin/CoursePositionManagerDialog";
import { ImageUploader } from "@/components/ui/image-uploader";

const demoContentSchema = z.object({
  title: z.string().min(1, "Title required"),
  video_url: z.string().trim().optional().or(z.literal("")),
  note_url: z.string().trim().optional().or(z.literal("")),
  is_locked: z.boolean().default(false),
});

const courseSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Name is required").max(200),
  short_description: z.string().trim().max(300).optional().or(z.literal("")),
  full_description: z.string().trim().max(4000).optional().or(z.literal("")),
  price: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((val) => !val || !isNaN(Number(val)), { message: "Price must be a number" }),
  original_price: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((val) => !val || !isNaN(Number(val)), { message: "Original Price must be a number" }),
  what_you_get: z
    .string()
    .trim()
    .max(10000)
    .optional()
    .or(z.literal("")),
  demo_content: z.array(demoContentSchema).optional().default([]),
  image_url: z.string().trim().max(500).optional().or(z.literal("")),
  video_url: z.string().trim().optional().or(z.literal("")),
  routine_url: z.string().trim().optional().or(z.literal("")),
  bkash_number: z.string().trim().max(50).optional().or(z.literal("")),
  nagad_number: z.string().trim().max(50).optional().or(z.literal("")),
  contact_info: z.string().trim().max(500).optional().or(z.literal("")),
  is_active: z.boolean().optional().default(true),
  is_public: z.boolean().optional().default(true),
  is_hidden: z.boolean().optional().default(false),
  category: z.array(z.string()).default([]),
  sub_category: z.array(z.string()).default([]),
  priority: z.number().optional().default(0),
  linked_course_ids: z.array(z.string()).default([]),
  access_unlimited_practice: z.boolean().optional().default(false),
});

const PAGE_SIZE = 10;

const AdminCourses = () => {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<z.infer<typeof courseSchema>>({
    name: "",
    short_description: "",
    full_description: "",
    price: "",
    original_price: "",
    what_you_get: "",
    demo_content: [],
    image_url: "",
    video_url: "",
    routine_url: "",
    bkash_number: "",
    nagad_number: "",
    contact_info: "",
    is_active: true,
    is_public: true,
    is_hidden: false,
    category: [],
    sub_category: [],
    priority: 0,
    linked_course_ids: [],
    access_unlimited_practice: false,
  });
  const [page, setPage] = useState(0);
  const [isCouponDialogOpen, setIsCouponDialogOpen] = useState(false);
  const [selectedCourseForCoupon, setSelectedCourseForCoupon] = useState<Course | null>(null);
  const [couponCode, setCouponCode] = useState("");
  const [activeTab, setActiveTab] = useState("basic");
  const [listStatusFilter, setListStatusFilter] = useState<"active" | "inactive" | "hidden">("active");
  const [listCategoryFilter, setListCategoryFilter] = useState<string>("all");
  const [listSubCategoryFilter, setListSubCategoryFilter] = useState<string>("all");
  const [showPositionManager, setShowPositionManager] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Local state for dropdown options (will be populated from DB)
  const [existingCategories, setExistingCategories] = useState<Option[]>([]);
  const [existingSubCategories, setExistingSubCategories] = useState<Option[]>([]);

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
      const timer = setTimeout(() => {
          setDebouncedSearch(searchQuery);
          if (searchQuery !== debouncedSearch) setPage(0);
      }, 500);
      return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    document.title = "Admin – Courses – Atlas";
  }, []);

  const { data: coursesData, isLoading } = useQuery({
    queryKey: ["admin-courses", page, debouncedSearch, listStatusFilter, listCategoryFilter, listSubCategoryFilter],
    queryFn: async () => {
      let query = (supabase as any)
        .from("courses")
        .select("*", { count: 'exact' });

      if (listStatusFilter === "hidden") {
          query = query.eq("is_hidden", true);
      } else if (listStatusFilter === "inactive") {
          query = query.eq("is_active", false).eq("is_hidden", false);
      } else {
          // active
          query = query.eq("is_active", true).eq("is_hidden", false);
      }

      if (debouncedSearch) {
          query = query.ilike("name", `%${debouncedSearch}%`);
      }

      if (listCategoryFilter !== "all") {
          query = query.contains("category", [listCategoryFilter]);
      }
      if (listSubCategoryFilter !== "all") {
          query = query.contains("sub_category", [listSubCategoryFilter]);
      }

      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      return { data: data || [], count: count || 0 };
    },
  });

  // Fetch all courses for the linked courses dropdown
  const { data: allCoursesList } = useQuery({
      queryKey: ["admin-all-courses-list"],
      queryFn: async () => {
          const { data } = await supabase.from("courses").select("id, name");
          return data?.map(c => ({ label: c.name, value: c.id })) || [];
      }
  });

  // Fetch unique categories and subcategories for the filters
  const { data: tagsData } = useQuery({
    queryKey: ["admin-course-tags"],
    queryFn: async () => {
        const { data, error } = await supabase
            .from("courses")
            .select("category, sub_category");
        if (error) return null;

        const cats = new Set<string>();
        const subs = new Set<string>();

        data?.forEach((row: any) => {
            if (Array.isArray(row.category)) row.category.forEach((c: string) => cats.add(c));
            // Handle legacy single string values if migration missed them or for safety
            else if (typeof row.category === 'string') cats.add(row.category);

            if (Array.isArray(row.sub_category)) row.sub_category.forEach((s: string) => subs.add(s));
             else if (typeof row.sub_category === 'string') subs.add(row.sub_category);
        });

        return { cats: Array.from(cats), subs: Array.from(subs) };
    }
  });

  useEffect(() => {
     if (tagsData) {
         setExistingCategories(tagsData.cats.map(c => ({ label: c, value: c })));
         setExistingSubCategories(tagsData.subs.map(s => ({ label: s, value: s })));
     }
  }, [tagsData]);


  // Fetch classes for the current editing course to display in Syllabus tab
  const { data: linkedClasses } = useQuery({
    queryKey: ["admin-course-classes", form.id],
    queryFn: async () => {
        if (!form.id) return [];
        const { data, error } = await supabase
            .from("classes")
            .select("id, title, class_type, start_at")
            .eq("course_id", form.id)
            .order("sort_order", { ascending: false })
            .order("start_at", { ascending: true });
        if (error) throw error;
        return data;
    },
    enabled: !!form.id
  });

  const courses = coursesData?.data || [];
  const totalCount = coursesData?.count || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const resetForm = () => {
    setForm({
      name: "",
      short_description: "",
      full_description: "",
      price: "",
      original_price: "",
      what_you_get: "",
      demo_content: [],
      image_url: "",
      bkash_number: "",
      nagad_number: "",
      contact_info: "",
      is_active: true,
      is_public: true,
      is_hidden: false,
      category: [],
      sub_category: [],
      priority: 0,
      linked_course_ids: [],
      access_unlimited_practice: false,
    });
    setActiveTab("basic");
  };

  const upsertMutation = useMutation({
    mutationFn: async (values: z.infer<typeof courseSchema>) => {
      const parsed = courseSchema.parse(values);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: any = {
        name: parsed.name,
        short_description: parsed.short_description || null,
        full_description: parsed.full_description || null,
        price: parsed.price ? Number(parsed.price) : null,
        original_price: parsed.original_price ? Number(parsed.original_price) : null,
        what_you_get: parsed.what_you_get
          ? [parsed.what_you_get]
          : null,
        demo_content: parsed.demo_content,
        image_url: parsed.image_url || null,
        video_url: parsed.video_url || null,
        routine_url: parsed.routine_url || null,
        bkash_number: parsed.bkash_number || null,
        nagad_number: parsed.nagad_number || null,
        contact_info: parsed.contact_info || null,
        is_active: parsed.is_active ?? true,
        is_public: parsed.is_public ?? true,
        is_hidden: parsed.is_hidden ?? false,
        category: parsed.category,
        sub_category: parsed.sub_category,
        priority: parsed.priority ?? 0,
        linked_course_ids: parsed.linked_course_ids,
        access_unlimited_practice: parsed.access_unlimited_practice ?? false,
      };

      if (parsed.id) {
        const { error } = await supabase
          .from("courses")
          .update(payload)
          .eq("id", parsed.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("courses").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: "Course saved" });
      queryClient.invalidateQueries({ queryKey: ["admin-courses"] });
      queryClient.invalidateQueries({ queryKey: ["admin-course-tags"] }); // Refresh tags
      resetForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Error saving course",
        description: error.message ?? "Please try again",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("courses").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Course deleted" });
      queryClient.invalidateQueries({ queryKey: ["admin-courses"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error deleting course",
        description: error.message ?? "Please try again",
        variant: "destructive",
      });
    },
  });

  const handleEdit = (course: Course) => {
    setShowForm(true);
    // Handle array or string for category/sub_category legacy compatibility
    const cats = Array.isArray(course.category)
        ? course.category
        : (typeof course.category === 'string' ? [course.category] : []);

    const subs = Array.isArray(course.sub_category)
        ? course.sub_category
        : (typeof course.sub_category === 'string' ? [course.sub_category] : []);

    setForm({
      id: course.id,
      name: course.name ?? "",
      short_description: course.short_description ?? "",
      full_description: course.full_description ?? "",
      price: course.price != null ? String(course.price) : "",
      original_price: course.original_price != null ? String(course.original_price) : "",
      what_you_get: Array.isArray(course.what_you_get) ? course.what_you_get.join("\n") : "",
      demo_content: course.demo_content ?? [],
      image_url: course.image_url ?? "",
      video_url: course.video_url ?? "",
      routine_url: (course as any).routine_url ?? "",
      bkash_number: course.bkash_number ?? "",
      nagad_number: course.nagad_number ?? "",
      contact_info: course.contact_info ?? "",
      is_active: course.is_active ?? true,
      is_public: course.is_public ?? true,
      // @ts-ignore
      is_hidden: course.is_hidden ?? false,
      category: cats,
      sub_category: subs,
      priority: course.priority ?? 0,
      // @ts-ignore
      linked_course_ids: course.linked_course_ids || [],
      access_unlimited_practice: course.access_unlimited_practice ?? false,
    });
    // Scroll to top to see the form
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    upsertMutation.mutate(form);
  };

  const generateCouponMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCourseForCoupon) return;
      const code = couponCode || `${selectedCourseForCoupon.name?.substring(0, 3).toUpperCase()}-FREE-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

      const { error } = await (supabase as any).from("promo_codes").insert({
        code: code,
        discount_type: "percentage",
        discount_amount: 100,
        course_id: selectedCourseForCoupon.id,
        is_active: true,
        usage_limit: 1 // Default to 1 use for safety, user can change in promo page
      });

      if (error) throw error;
      return code;
    },
    onSuccess: (code) => {
      toast({
        title: "Free Coupon Created",
        description: `Code: ${code} (100% Off, Single Use)`
      });
      setIsCouponDialogOpen(false);
      setCouponCode("");
      setSelectedCourseForCoupon(null);
    },
    onError: (error) => {
      toast({
        title: "Error creating coupon",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const openCouponDialog = (course: Course, e: React.MouseEvent) => {
      e.stopPropagation();
      setSelectedCourseForCoupon(course);
      const randomCode = `${course.name?.replace(/\s+/g, '').substring(0, 4).toUpperCase()}-FREE-${Math.floor(1000 + Math.random() * 9000)}`;
      setCouponCode(randomCode);
      setIsCouponDialogOpen(true);
  };

  const handleCreateCategory = (val: string) => {
      if (!existingCategories.find(c => c.value === val)) {
          setExistingCategories(prev => [...prev, { label: val, value: val }]);
      }
      setForm(prev => ({ ...prev, category: [...prev.category, val] }));
  };

  const handleCreateSubCategory = (val: string) => {
      if (!existingSubCategories.find(c => c.value === val)) {
          setExistingSubCategories(prev => [...prev, { label: val, value: val }]);
      }
      setForm(prev => ({ ...prev, sub_category: [...prev.sub_category, val] }));
  };


  return (
    <section className="space-y-8 pb-12">
      {showPositionManager ? (
        <CoursePositionManagerDialog onClose={() => setShowPositionManager(false)} />
      ) : (
      <>
      <Dialog open={isCouponDialogOpen} onOpenChange={setIsCouponDialogOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Generate Free Coupon</DialogTitle>
                <DialogDescription>
                    Create a 100% off coupon for <strong>{selectedCourseForCoupon?.name}</strong>.
                    <br/>This will create a single-use promo code.
                </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
                <div className="space-y-2">
                    <Label>Coupon Code</Label>
                    <div className="flex gap-2">
                        <Input
                            value={couponCode}
                            onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                            placeholder="ENTER-CODE"
                        />
                        <Button size="icon" variant="outline" onClick={() => {
                             navigator.clipboard.writeText(couponCode);
                             toast({ title: "Copied to clipboard" });
                        }}>
                            <Copy className="h-4 w-4" />
                        </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Default: 100% discount, 1 usage limit. You can edit this later in "Promo Codes" page.
                    </p>
                </div>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsCouponDialogOpen(false)}>Cancel</Button>
                <Button onClick={() => generateCouponMutation.mutate()} disabled={generateCouponMutation.isPending}>
                    {generateCouponMutation.isPending ? "Creating..." : "Create Coupon"}
                </Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Courses</h1>
          <p className="text-muted-foreground">
            Create and manage courses shown on the public site and dashboard.
          </p>
        </div>
        <div className="flex gap-2">
          {!showForm && (
            <Button onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create New Course
            </Button>
          )}
        </div>
      </header>

      {/* Main Form Section - Removed Card Wrapper */}
      {showForm && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
             <h2 className="text-lg font-semibold">
                {form.id ? "Edit Course" : "Create New Course"}
             </h2>
             <Button variant="ghost" size="sm" onClick={() => {
                 setForm({
                    name: "",
                    short_description: "",
                    full_description: "",
                    price: "",
                    original_price: "",
                    image_url: "",
                    bkash_number: "",
                    nagad_number: "",
                    contact_info: "",
                    is_active: false,
                    is_public: true,
                    is_hidden: false,
                    priority: 0,
                    category: [],
                    sub_category: [],
                    demo_content: [],
                    linked_course_ids: [],
                    access_unlimited_practice: false,
                 });
                 setShowForm(false);
             }}>
                 <X className="h-4 w-4 mr-2" /> Cancel
             </Button>
          </div>

          <form onSubmit={handleSubmit}>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <div className="mb-6 w-full overflow-x-auto no-scrollbar pb-2 sm:flex sm:justify-center">
                  <TabsList className="inline-flex h-11 items-center justify-start sm:justify-center rounded-lg bg-muted p-1 text-muted-foreground w-max shadow-sm">
                    <TabsTrigger value="basic" className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-6 py-2 text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">Basic Info</TabsTrigger>
                    <TabsTrigger value="description" className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-6 py-2 text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">Description</TabsTrigger>
                    <TabsTrigger value="content" className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-6 py-2 text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">Curriculum Info</TabsTrigger>
                    <TabsTrigger value="demos" className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-6 py-2 text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">Demo Content</TabsTrigger>
                    {form.id && (
                      <TabsTrigger value="promo" className="inline-flex items-center justify-center whitespace-nowrap rounded-md px-6 py-2 text-sm font-medium transition-all data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm">Promo Code</TabsTrigger>
                    )}
                  </TabsList>
              </div>

              <div className="min-h-[40vh]">
                <TabsContent value="basic" className="mt-0 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">

                    <div className="grid gap-6 md:grid-cols-2">

                    {/* General Info */}
                    <Card className="md:col-span-2 shadow-sm border-muted">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-lg">Core Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <div className="space-y-2">
                                <Label htmlFor="name" className="text-sm font-semibold">Course Name</Label>
                                <Input
                                id="name"
                                value={form.name}
                                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                                className="text-base h-11 bg-background"
                                placeholder="e.g. Engineering Admission 2024"
                                />
                            </div>

                            <div className="grid grid-cols-2 sm:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="price" className="text-sm font-semibold">Price (৳)</Label>
                                    <Input
                                    id="price"
                                    value={form.price}
                                    onChange={(e) => setForm((prev) => ({ ...prev, price: e.target.value }))}
                                    placeholder="3000"
                                    className="bg-background"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="original_price" className="text-sm font-semibold">Original Price (৳)</Label>
                                    <Input
                                    id="original_price"
                                    value={form.original_price}
                                    onChange={(e) => setForm((prev) => ({ ...prev, original_price: e.target.value }))}
                                    placeholder="5000"
                                    className="bg-background !line-through text-muted-foreground"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Media */}
                    <Card className="md:col-span-2 shadow-sm border-muted">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-lg">Media & Content</CardTitle>
                        </CardHeader>
                        <CardContent className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-2">
                                <Label htmlFor="image_url" className="text-sm font-semibold">Course Image</Label>
                                <ImageUploader
                                    value={form.image_url || ""}
                                    onChange={(val) => setForm((prev) => ({ ...prev, image_url: val }))}
                                    placeholder="Thumbnail URL or upload"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="video_url" className="text-sm font-semibold">Intro Video URL (YouTube)</Label>
                                <Input
                                    id="video_url"
                                    value={form.video_url}
                                    onChange={(e) => setForm((prev) => ({ ...prev, video_url: e.target.value }))}
                                    placeholder="https://youtu.be/..."
                                    className="bg-background"
                                />
                                <p className="text-[11px] text-muted-foreground mt-1">Appears at the top of the course details page.</p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Links & Payment Details */}
                    <Card className="md:col-span-2 shadow-sm border-muted">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-lg">Payment & Contact Settings</CardTitle>
                        </CardHeader>
                        <CardContent className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <div className="space-y-2 lg:col-span-1 border md:border-0 rounded p-3 md:p-0 bg-muted/10 md:bg-transparent">
                                <Label htmlFor="routine_url" className="text-sm font-semibold">Course Routine Link</Label>
                                <Input
                                id="routine_url"
                                value={form.routine_url}
                                onChange={(e) => setForm((prev) => ({ ...prev, routine_url: e.target.value }))}
                                placeholder="https://drive.google.com/..."
                                className="bg-background"
                                />
                            </div>

                            <div className="space-y-2 border md:border-0 rounded p-3 md:p-0 bg-pink-50/50 md:bg-transparent dark:bg-pink-950/10 dark:md:bg-transparent border-pink-100 dark:border-pink-900 border-dashed md:border-solid">
                                <Label htmlFor="bkash_number" className="text-sm font-semibold text-pink-700 dark:text-pink-400">bKash Number</Label>
                                <Input
                                id="bkash_number"
                                value={form.bkash_number}
                                onChange={(e) => setForm((prev) => ({ ...prev, bkash_number: e.target.value }))}
                                placeholder="01XXXXXXXXX"
                                className="bg-background"
                                />
                            </div>

                            <div className="space-y-2 border md:border-0 rounded p-3 md:p-0 bg-orange-50/50 md:bg-transparent dark:bg-orange-950/10 dark:md:bg-transparent border-orange-100 dark:border-orange-900 border-dashed md:border-solid">
                                <Label htmlFor="nagad_number" className="text-sm font-semibold text-orange-700 dark:text-orange-400">Nagad Number</Label>
                                <Input
                                id="nagad_number"
                                value={form.nagad_number}
                                onChange={(e) => setForm((prev) => ({ ...prev, nagad_number: e.target.value }))}
                                placeholder="01XXXXXXXXX"
                                className="bg-background"
                                />
                            </div>

                            <div className="space-y-2 border md:border-0 rounded p-3 md:p-0 bg-blue-50/50 md:bg-transparent dark:bg-blue-950/10 dark:md:bg-transparent border-blue-100 dark:border-blue-900 border-dashed md:border-solid">
                                <Label htmlFor="contact_info" className="text-sm font-semibold text-blue-700 dark:text-blue-400">Support Number</Label>
                                <Input
                                id="contact_info"
                                value={form.contact_info}
                                onChange={(e) => setForm((prev) => ({ ...prev, contact_info: e.target.value }))}
                                placeholder="01XXXXXXXXX"
                                className="bg-background"
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Settings & Categorization */}
                    <Card className="md:col-span-2 shadow-sm border-muted">
                        <CardHeader className="pb-4">
                            <CardTitle className="text-lg">Visibility & Taxonomy</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid md:grid-cols-2 gap-6 mb-6">
                                <div className="space-y-2">
                                    <Label htmlFor="category" className="text-sm font-semibold">Batch Categories</Label>
                                    <MultiSelect
                                        options={existingCategories}
                                        selected={form.category}
                                        onChange={(val) => setForm(prev => ({ ...prev, category: val }))}
                                        onCreate={handleCreateCategory}
                                        placeholder="Select batches..."
                                    />
                                    <p className="text-[10px] text-muted-foreground mt-0.5">Helps users filter by target exam (e.g. HSC 25).</p>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="sub_category" className="text-sm font-semibold">Program Types</Label>
                                    <MultiSelect
                                        options={existingSubCategories}
                                        selected={form.sub_category}
                                        onChange={(val) => setForm(prev => ({ ...prev, sub_category: val }))}
                                        onCreate={handleCreateSubCategory}
                                        placeholder="Select types..."
                                    />
                                    <p className="text-[10px] text-muted-foreground mt-0.5">Further grouping (e.g. Model Test, Academic).</p>
                                </div>

                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold">Included / Bonus Courses</Label>
                                    <MultiSelect
                                        options={allCoursesList?.filter(c => c.value !== form.id) || []}
                                        selected={form.linked_course_ids}
                                        onChange={(val) => setForm(prev => ({ ...prev, linked_course_ids: val }))}
                                        placeholder="Select courses..."
                                    />
                                     <p className="text-[10px] text-muted-foreground mt-0.5">Students get access to archives & exams for these.</p>
                                </div>

                                <div className="space-y-2">
                                    <Label htmlFor="priority" className="text-sm font-semibold">Sort Priority</Label>
                                    <Input
                                    id="priority"
                                    type="number"
                                    value={form.priority}
                                    onChange={(e) => setForm((prev) => ({ ...prev, priority: parseInt(e.target.value) || 0 }))}
                                    placeholder="0"
                                    className="bg-background"
                                    />
                                    <p className="text-[10px] text-muted-foreground mt-0.5">Higher numbers appear first.</p>
                                </div>
                            </div>

                            <div className="pt-4 border-t border-muted">
                                <h4 className="text-xs font-semibold uppercase text-muted-foreground tracking-wider mb-4">Toggle Toggles</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    <div className="flex items-start gap-3 p-3 rounded bg-muted/20 border">
                                        <Switch
                                        id="is_active"
                                        checked={form.is_active}
                                        onCheckedChange={(checked) =>
                                            setForm((prev) => ({ ...prev, is_active: checked }))
                                        }
                                        />
                                        <div className="grid gap-0.5">
                                            <Label htmlFor="is_active" className="text-sm font-semibold cursor-pointer">Active</Label>
                                            <span className="text-[10px] leading-tight text-muted-foreground">Accepting payments</span>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3 p-3 rounded bg-muted/20 border">
                                        <Switch
                                        id="is_public"
                                        checked={form.is_public}
                                        onCheckedChange={(checked) =>
                                            setForm((prev) => ({ ...prev, is_public: checked }))
                                        }
                                        />
                                        <div className="grid gap-0.5">
                                            <Label htmlFor="is_public" className="text-sm font-semibold cursor-pointer">Public</Label>
                                            <span className="text-[10px] leading-tight text-muted-foreground">Visible in UI lists</span>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3 p-3 rounded bg-muted/20 border">
                                        <Switch
                                        id="is_hidden"
                                        checked={form.is_hidden}
                                        onCheckedChange={(checked) =>
                                            setForm((prev) => ({ ...prev, is_hidden: checked }))
                                        }
                                        />
                                        <div className="grid gap-0.5">
                                            <Label htmlFor="is_hidden" className="text-sm font-semibold cursor-pointer">Hidden App</Label>
                                            <span className="text-[10px] leading-tight text-muted-foreground">Absolute shadow hide</span>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3 p-3 rounded bg-muted/20 border">
                                        <Switch
                                        id="access_unlimited_practice"
                                        checked={form.access_unlimited_practice}
                                        onCheckedChange={(checked) =>
                                            setForm((prev) => ({ ...prev, access_unlimited_practice: checked }))
                                        }
                                        />
                                        <div className="grid gap-0.5">
                                            <Label htmlFor="access_unlimited_practice" className="text-sm font-semibold cursor-pointer">Unlimited Practice</Label>
                                            <span className="text-[10px] leading-tight text-muted-foreground">Unlimited portal access</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    </div>
                </TabsContent>

                <TabsContent value="description" className="mt-0 space-y-4">
                    <div className="space-y-2">
                    <Label htmlFor="short_description">Short description</Label>
                    <Textarea
                        id="short_description"
                        rows={3}
                        value={form.short_description}
                        onChange={(e) => setForm((prev) => ({ ...prev, short_description: e.target.value }))}
                        placeholder="A brief overview shown on course cards..."
                    />
                    </div>

                    <div className="space-y-2">
                        <Label htmlFor="full_description">Full description</Label>
                        <PostEditor
                            key={form.id || 'desc-new'}
                            initialValue={form.full_description}
                            onChange={(val) => setForm((prev) => ({ ...prev, full_description: val }))}
                        />
                    </div>
                </TabsContent>

                <TabsContent value="content" className="mt-0 space-y-4">
                    <div className="flex justify-between items-center mb-2">
                        <Label htmlFor="what_you_get">
                            "What you get" Section
                        </Label>
                    </div>

                    <PostEditor
                        key={form.id || 'wyg-new'}
                        initialValue={form.what_you_get}
                        onChange={(val) => setForm((prev) => ({ ...prev, what_you_get: val }))}
                    />
                </TabsContent>

                <TabsContent value="demos" className="mt-0 space-y-4">
                    <div className="flex justify-between items-center mb-4">
                        <div className="space-y-1">
                             <h4 className="text-sm font-semibold">Demo / Preview Content</h4>
                             <p className="text-xs text-muted-foreground">Add demo classes with video and/or note links.</p>
                        </div>
                        <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                                const newContent = [
                                    ...(form.demo_content || []),
                                    { title: "", video_url: "", note_url: "", is_locked: false }
                                ];
                                setForm({ ...form, demo_content: newContent });
                            }}
                        >
                            <Plus className="w-4 h-4 mr-1" /> Add Class
                        </Button>
                    </div>

                    {form.demo_content?.length === 0 && (
                         <div className="text-center py-12 border-2 border-dashed rounded-lg text-muted-foreground text-sm">
                             No demo content added yet.
                         </div>
                    )}

                    <div className="grid gap-4">
                        {form.demo_content?.map((item, idx) => (
                            <div key={idx} className="border rounded-md p-4 flex gap-4 flex-col md:flex-row md:items-start">
                                <div className="flex-1 space-y-3">
                                    <div>
                                        <Label className="text-xs text-muted-foreground mb-1 block">Title</Label>
                                        <Input
                                            value={item.title}
                                            onChange={(e) => {
                                                const updated = [...(form.demo_content || [])];
                                                updated[idx] = { ...updated[idx], title: e.target.value };
                                                setForm({ ...form, demo_content: updated });
                                            }}
                                            className="h-8"
                                            placeholder="e.g. Introduction Class"
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label className="text-xs text-muted-foreground mb-1 block">Video URL</Label>
                                            <Input
                                                value={item.video_url || ""}
                                                onChange={(e) => {
                                                    const updated = [...(form.demo_content || [])];
                                                    updated[idx] = { ...updated[idx], video_url: e.target.value };
                                                    setForm({ ...form, demo_content: updated });
                                                }}
                                                className="h-8 font-mono text-xs"
                                                placeholder="https://youtube.com..."
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs text-muted-foreground mb-1 block">Note/PDF URL</Label>
                                            <Input
                                                value={item.note_url || ""}
                                                onChange={(e) => {
                                                    const updated = [...(form.demo_content || [])];
                                                    updated[idx] = { ...updated[idx], note_url: e.target.value };
                                                    setForm({ ...form, demo_content: updated });
                                                }}
                                                className="h-8 font-mono text-xs"
                                                placeholder="https://drive.google.com..."
                                            />
                                        </div>
                                    </div>
                                </div>
                                <div className="flex md:flex-col justify-end gap-2 mt-2 md:mt-0">
                                        <Button
                                        type="button"
                                        size="sm"
                                        variant="destructive"
                                        className="h-8 w-full md:w-auto"
                                        onClick={() => {
                                                const updated = form.demo_content?.filter((_, i) => i !== idx);
                                                setForm({ ...form, demo_content: updated });
                                        }}
                                    >
                                        <Trash2 className="w-4 h-4 md:mr-2" />
                                        <span className="md:inline hidden">Remove</span>
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </TabsContent>

                {form.id && (
                  <TabsContent value="promo" className="mt-0 space-y-4">
                    <CoursePromoCodesPanel courseId={form.id} courseName={form.name} />
                  </TabsContent>
                )}
              </div>

              <div className="flex items-center gap-4 pt-6 mt-6 border-t">
                <Button type="submit" disabled={upsertMutation.isPending} className="min-w-[150px]">
                  {upsertMutation.isPending ? "Saving..." : form.id ? "Update Course" : "Create Course"}
                </Button>
                {form.id && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={resetForm}
                    disabled={upsertMutation.isPending}
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </Tabs>
          </form>
        </div>
      )}

      {/* Courses List Section - Removed Card Wrapper */}
      <div className="space-y-4 pt-8 border-t">
        <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">All Courses</h2>
            <div className="relative flex-1 max-w-[180px] sm:max-w-96 ml-auto">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-9 sm:h-10 text-xs sm:text-sm"
                />
            </div>
        </div>

        <Tabs value={listStatusFilter} onValueChange={(v) => { setListStatusFilter(v as any); setPage(0); }} className="w-full">
            <TabsList className="grid w-full max-w-sm grid-cols-3">
                <TabsTrigger value="active">Active</TabsTrigger>
                <TabsTrigger value="inactive">Inactive</TabsTrigger>
                <TabsTrigger value="hidden">Hidden</TabsTrigger>
            </TabsList>
        </Tabs>

        <div>
          <Button type="button" variant="outline" size="sm" onClick={() => setShowPositionManager(true)}>
            Manage Course Position
          </Button>
        </div>

        {tagsData?.cats && tagsData.cats.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={listCategoryFilter === "all" ? "default" : "outline"}
              onClick={() => { setListCategoryFilter("all"); setListSubCategoryFilter("all"); setPage(0); }}
            >
              সব ক্যাটাগরি
            </Button>
            {tagsData.cats.map((cat) => (
              <Button
                key={cat}
                type="button"
                size="sm"
                variant={listCategoryFilter === cat ? "default" : "outline"}
                onClick={() => { setListCategoryFilter(cat); setListSubCategoryFilter("all"); setPage(0); }}
              >
                {cat}
              </Button>
            ))}
          </div>
        )}

        {tagsData?.subs && tagsData.subs.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={listSubCategoryFilter === "all" ? "secondary" : "outline"}
              onClick={() => { setListSubCategoryFilter("all"); setPage(0); }}
            >
              সব কোর্স টাইপ
            </Button>
            {tagsData.subs.map((sub) => (
              <Button
                key={sub}
                type="button"
                size="sm"
                variant={listSubCategoryFilter === sub ? "secondary" : "outline"}
                onClick={() => { setListSubCategoryFilter(sub); setPage(0); }}
              >
                {sub}
              </Button>
            ))}
          </div>
        )}

        {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading courses...</div>
          ) : !courses || courses.length === 0 ? (
            <div className="text-sm text-muted-foreground">No courses defined yet.</div>
          ) : (
            <>
            <div className="rounded-md border overflow-x-auto bg-background">
                <Table>
                <TableHeader>
                    <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Public</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {courses.map((course: any) => (
                    <TableRow key={course.id} className="hover:bg-muted/50 cursor-pointer" onClick={() => navigate(`/admin/course-dashboard/${course.id}`)}>
                        <TableCell className="font-medium whitespace-nowrap">{course.name}</TableCell>
                        <TableCell>
                        {course.price != null ? `৳${course.price}` : <span className="text-xs text-muted-foreground">Not set</span>}
                        </TableCell>
                        <TableCell>
                        {course.is_public !== false ? "Yes" : <span className="text-xs text-muted-foreground">No</span>}
                        </TableCell>
                        <TableCell>
                        {course.is_active ? (
                            <Badge variant="default" className="text-[10px] bg-green-600 hover:bg-green-700">Active</Badge>
                        ) : (
                            <Badge variant="secondary" className="text-[10px]">Inactive</Badge>
                        )}
                        </TableCell>
                        <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                onClick={(e) => { e.stopPropagation(); handleEdit(course); }}
                                title="Edit Course"
                            >
                                <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                title="Generate Free Coupon"
                                onClick={(e) => openCouponDialog(course, e)}
                            >
                                <Ticket className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="hover:bg-destructive/10"
                                onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm("Delete this course? This cannot be undone.")) {
                                    deleteMutation.mutate(course.id);
                                }
                                }}
                            >
                                <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                        </div>
                        </TableCell>
                    </TableRow>
                    ))}
                </TableBody>
                </Table>
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between pt-4">
                 <div className="text-xs text-muted-foreground">
                     Page {page + 1} of {totalPages || 1} ({totalCount} items)
                 </div>
                 <div className="flex gap-2">
                     <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => Math.max(0, p - 1))}
                        disabled={page === 0}
                     >
                         <ChevronLeft className="h-4 w-4" />
                         Previous
                     </Button>
                     <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPage(p => p + 1)}
                        disabled={page >= totalPages - 1}
                     >
                         Next
                         <ChevronRight className="h-4 w-4" />
                     </Button>
                 </div>
            </div>
            </>
          )}
      </div>
      </>
      )}
    </section>
  );
};

// ── Per-course Promo Code panel: lets an admin manage promo codes scoped to
// THIS course directly from inside the course edit form, without needing to
// go to the separate global Promo Codes page. Reuses the same promo_codes
// table (course_ids text[] column), just pre-filtered/pre-filled to this course.
function CoursePromoCodesPanel({ courseId, courseName }: { courseId: string; courseName?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingPromoId, setEditingPromoId] = useState<string | null>(null);
  const [pCode, setPCode] = useState("");
  const [pType, setPType] = useState<"flat" | "percentage">("percentage");
  const [pAmount, setPAmount] = useState("");
  const [pDeadline, setPDeadline] = useState("");
  const [pUsageLimit, setPUsageLimit] = useState("");
  const [pActive, setPActive] = useState(true);
  const [pBannerText, setPBannerText] = useState("");

  const { data: promos, isLoading } = useQuery({
    queryKey: ["course-promo-codes", courseId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("promo_codes")
        .select("*")
        .or(`course_id.eq.${courseId},course_ids.cs.{${courseId}}`)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const resetForm = () => {
    setEditingPromoId(null);
    setPCode("");
    setPType("percentage");
    setPAmount("");
    setPDeadline("");
    setPUsageLimit("");
    setPActive(true);
    setPBannerText("");
  };

  const startEdit = (promo: any) => {
    setEditingPromoId(promo.id);
    setPCode(promo.code || "");
    setPType(promo.discount_type || "percentage");
    setPAmount(String(promo.discount_amount ?? ""));
    setPDeadline(promo.special_discount_deadline ? promo.special_discount_deadline.slice(0, 16) : "");
    setPUsageLimit(promo.usage_limit != null ? String(promo.usage_limit) : "");
    setPActive(promo.is_active ?? true);
    setPBannerText(promo.special_discount_text || "");
  };

  const upsertPromo = useMutation({
    mutationFn: async () => {
      const payload: any = {
        code: pCode.trim().toUpperCase(),
        discount_type: pType,
        discount_amount: Number(pAmount) || 0,
        course_id: courseId,
        course_ids: [courseId],
        special_discount_deadline: pDeadline ? new Date(pDeadline).toISOString() : null,
        usage_limit: pUsageLimit ? Number(pUsageLimit) : null,
        is_active: pActive,
        special_discount_text: pBannerText.trim() || null,
      };
      if (editingPromoId) {
        const { error } = await (supabase as any).from("promo_codes").update(payload).eq("id", editingPromoId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("promo_codes").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: editingPromoId ? "প্রোমো কোড আপডেট হয়েছে" : "প্রোমো কোড তৈরি হয়েছে" });
      queryClient.invalidateQueries({ queryKey: ["course-promo-codes", courseId] });
      resetForm();
    },
    onError: (error: any) => {
      const isDuplicateCode = error?.message?.includes("promo_codes_code_key") || error?.code === "23505";
      toast({
        title: "Error",
        description: isDuplicateCode ? "এই কোড আগে থেকেই ব্যবহৃত হয়েছে — অন্য একটা কোড লিখুন।" : error.message,
        variant: "destructive",
      });
    },
  });

  const deletePromo = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("promo_codes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "প্রোমো কোড মুছে ফেলা হয়েছে" });
      queryClient.invalidateQueries({ queryKey: ["course-promo-codes", courseId] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{courseName ? `"${courseName}"-এর প্রোমো কোড` : "প্রোমো কোড"}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 border rounded-lg">
          <div className="space-y-2">
            <Label>কোড</Label>
            <Input value={pCode} onChange={(e) => setPCode(e.target.value.toUpperCase())} placeholder="EX: SAVE20" />
          </div>
          <div className="space-y-2">
            <Label>ধরন</Label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={pType === "percentage" ? "default" : "outline"} onClick={() => setPType("percentage")}>%</Button>
              <Button type="button" size="sm" variant={pType === "flat" ? "default" : "outline"} onClick={() => setPType("flat")}>৳ ফ্ল্যাট</Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{pType === "percentage" ? "কত % ছাড়" : "কত টাকা ছাড়"}</Label>
            <Input type="number" value={pAmount} onChange={(e) => setPAmount(e.target.value)} placeholder={pType === "percentage" ? "20" : "500"} />
          </div>
          <div className="space-y-2">
            <Label>শেষ হওয়ার তারিখ/সময় (ঐচ্ছিক)</Label>
            <Input type="datetime-local" value={pDeadline} onChange={(e) => setPDeadline(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>ব্যবহারের সীমা (ঐচ্ছিক)</Label>
            <Input type="number" value={pUsageLimit} onChange={(e) => setPUsageLimit(e.target.value)} placeholder="ফাঁকা রাখলে unlimited" />
          </div>
          <div className="space-y-2 flex items-center gap-3 pt-6">
            <Switch checked={pActive} onCheckedChange={setPActive} />
            <Label>সক্রিয়</Label>
          </div>
          <div className="sm:col-span-2 space-y-2 border-t pt-4 mt-2">
            <Label>ডিসকাউন্ট ব্যানার টেক্সট (ঐচ্ছিক)</Label>
            <p className="text-xs text-muted-foreground">সেট করলে এই টেক্সট কোর্স ডিটেইলস পেজে প্রোমোশনাল ব্যানার হিসেবে দেখাবে (উপরের Deadline countdown সহ)।</p>
            <Input value={pBannerText} onChange={(e) => setPBannerText(e.target.value)} placeholder="যেমন: 🎉 বিশেষ ৫০% ছাড়! কোড ব্যবহার করুন SUMMER24" />
          </div>
          <div className="sm:col-span-2 flex gap-2">
            <Button
              type="button"
              disabled={!pCode.trim() || !pAmount || upsertPromo.isPending}
              onClick={() => upsertPromo.mutate()}
            >
              {upsertPromo.isPending ? "সেভ হচ্ছে..." : editingPromoId ? "আপডেট করো" : "প্রোমো কোড যোগ করো"}
            </Button>
            {editingPromoId && (
              <Button type="button" variant="outline" onClick={resetForm}>বাতিল</Button>
            )}
          </div>
        </div>

        <div className="space-y-2">
          {isLoading && <p className="text-sm text-muted-foreground">লোড হচ্ছে...</p>}
          {!isLoading && (!promos || promos.length === 0) && (
            <p className="text-sm text-muted-foreground">এই কোর্সের জন্য এখনো কোনো প্রোমো কোড নেই।</p>
          )}
          {promos?.map((promo: any) => (
            <div key={promo.id} className="flex items-center justify-between gap-3 p-3 border rounded-lg">
              <div className="flex flex-col">
                <span className="font-mono font-semibold">{promo.code}</span>
                <span className="text-xs text-muted-foreground">
                  {promo.discount_type === "flat" ? `৳${promo.discount_amount} ছাড়` : `${promo.discount_amount}% ছাড়`}
                  {promo.special_discount_deadline ? ` • শেষ: ${new Date(promo.special_discount_deadline).toLocaleString("bn-BD")}` : ""}
                  {promo.usage_limit != null ? ` • সীমা: ${promo.used_count ?? 0}/${promo.usage_limit}` : ""}
                  {!promo.is_active ? " • নিষ্ক্রিয়" : ""}
                </span>
                {promo.special_discount_text && (
                  <span className="text-xs text-primary mt-0.5">ব্যানার: {promo.special_discount_text}</span>
                )}
              </div>
              <div className="flex gap-2">
                <Button type="button" size="icon" variant="outline" onClick={() => startEdit(promo)}><Edit2 className="h-4 w-4" /></Button>
                <Button type="button" size="icon" variant="outline" onClick={() => deletePromo.mutate(promo.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default AdminCourses;
