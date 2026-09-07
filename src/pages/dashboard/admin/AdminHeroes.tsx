import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ImageUploader } from "@/components/ui/image-uploader";
import { PromoVideoManager } from "@/components/admin/PromoVideoManager";
import { ReviewsTaglineManager } from "@/components/admin/ReviewsTaglineManager";
import { Loader2, Plus, Trash2, Edit, Image as ImageIcon } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const heroSchema = z.object({
  title: z.string().min(1, "Title is required"),
  subtitle: z.string().optional(),
  image_url: z.string().optional(),
  video_url: z.string().optional(),
  cta_text: z.string().optional(),
  cta_link: z.string().optional(),
  display_order: z.coerce.number().default(0),
  is_active: z.boolean().default(true),
  hero_type: z.enum(['image', 'countdown', 'announcement']).default('image'),
  countdown_target: z.string().optional(),
  markdown_content: z.string().optional(),
  background_config: z.any().optional(),
});

type HeroFormValues = z.infer<typeof heroSchema>;

const AdminHeroes = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Manage Site Heroes & Exams – Admin";
  }, []);

  const form = useForm<HeroFormValues>({
    resolver: zodResolver(heroSchema),
    defaultValues: {
      title: "",
      subtitle: "",
      image_url: "",
      video_url: "",
      cta_text: "শুরু করুন",
      cta_link: "/courses",
      display_order: 0,
      is_active: true,
      hero_type: "image",
      countdown_target: "",
      markdown_content: "",
    },
  });

  const { data: heroes, isLoading } = useQuery({
    queryKey: ["admin-heroes"],
    queryFn: async () => {
      // @ts-ignore
      const { data, error } = await (supabase as any)
        .from("heroes")
        .select("*")
        .order("display_order", { ascending: true });
      if (error) {
        if (error.code === '42P01') return [];
        throw error;
      };
      return data || [];
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (values: HeroFormValues) => {
      // Sanitize values: convert empty strings to null for optional database columns
      const sanitizedValues = {
          ...values,
          countdown_target: values.countdown_target || null,
          image_url: values.image_url || null,
          video_url: values.video_url || null,
          subtitle: values.subtitle || null,
          cta_text: values.cta_text || null,
          cta_link: values.cta_link || null,
          markdown_content: values.markdown_content || null,
      };

      if (editingId) {
        // @ts-ignore
        const { error } = await (supabase as any)
          .from("heroes")
          .update(sanitizedValues)
          .eq("id", editingId);
        if (error) throw error;
      } else {
        // @ts-ignore
        const { error } = await (supabase as any)
          .from("heroes")
          .insert(sanitizedValues);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: editingId ? "Hero updated" : "Hero created" });
      queryClient.invalidateQueries({ queryKey: ["admin-heroes"] });
      setIsDialogOpen(false);
      form.reset();
      setEditingId(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // @ts-ignore
      const { error } = await supabase.from("heroes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Hero deleted" });
      queryClient.invalidateQueries({ queryKey: ["admin-heroes"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (values: HeroFormValues) => {
    upsertMutation.mutate(values);
  };

  const handleEdit = (hero: any) => {
    setEditingId(hero.id);
    form.reset({
      title: hero.title,
      subtitle: hero.subtitle || "",
      image_url: hero.image_url || "",
      video_url: hero.video_url || "",
      cta_text: hero.cta_text || "",
      cta_link: hero.cta_link || "",
      display_order: hero.display_order,
      is_active: hero.is_active,
      hero_type: hero.hero_type || 'image',
      countdown_target: hero.countdown_target ? new Date(hero.countdown_target).toISOString().slice(0, 16) : "",
      markdown_content: hero.markdown_content || "",
      background_config: hero.background_config,
    });
    setIsDialogOpen(true);
  };

  const handleAddNew = () => {
    setEditingId(null);
    form.reset({
      title: "",
      subtitle: "",
      image_url: "",
      video_url: "",
      cta_text: "শুরু করুন",
      cta_link: "/courses",
      display_order: 0,
      is_active: true,
      hero_type: 'image',
      countdown_target: "",
      markdown_content: "",
      background_config: { type: 'gradient', from: '#064e3b', to: '#022c22' },
    });
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Manage Landing Page content</h2>
          <p className="text-muted-foreground">Manage the main banners.</p>
        </div>
      </div>

      <PromoVideoManager />

      <ReviewsTaglineManager />

      <div className="space-y-4">
          <div className="flex justify-end">
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
              <DialogTrigger asChild>
                <Button onClick={handleAddNew}>
                  <Plus className="mr-2 h-4 w-4" /> Add Hero
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editingId ? "Edit Hero" : "Add Hero Slide"}</DialogTitle>
                  <DialogDescription>
                    Configure the banner content.
                  </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

                    <FormField
                      control={form.control}
                      name="hero_type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Slide Type</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="image">Standard Image</SelectItem>
                              <SelectItem value="countdown">Exam Countdown</SelectItem>
                              <SelectItem value="announcement">Rich Announcement</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="image_url"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Image URL (Optional for special types)</FormLabel>
                          <FormControl>
                            <ImageUploader
                              value={field.value}
                              onChange={field.onChange}
                              placeholder="https://... or upload"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="video_url"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Video URL (YouTube — takes priority over Image, autoplays with sound)</FormLabel>
                          <FormControl>
                            <Input placeholder="https://youtube.com/watch?v=..." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {form.watch("hero_type") === 'countdown' && (
                      <FormField
                        control={form.control}
                        name="countdown_target"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Countdown Target Date</FormLabel>
                            <FormControl>
                              <Input type="datetime-local" {...field} />
                            </FormControl>
                            <FormDescription>The date and time to count down to.</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {(form.watch("hero_type") === 'countdown' || form.watch("hero_type") === 'announcement') && (
                      <FormField
                        control={form.control}
                        name="markdown_content"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Markdown Content</FormLabel>
                            <FormControl>
                              <Textarea 
                                placeholder="Write announcement details in markdown..." 
                                rows={6}
                                {...field} 
                              />
                            </FormControl>
                            <FormDescription>Supports **bold**, *italic*, [links](url), and Math formulas.</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    <div className="grid grid-cols-2 gap-4">
                        <FormField
                        control={form.control}
                        name="title"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Title</FormLabel>
                            <FormControl>
                                <Input placeholder="Welcome to..." {...field} />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                        <FormField
                        control={form.control}
                        name="display_order"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Order</FormLabel>
                            <FormControl>
                                <Input type="number" {...field} />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                    </div>

                    <FormField
                      control={form.control}
                      name="subtitle"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Subtitle (Optional)</FormLabel>
                          <FormControl>
                            <Textarea placeholder="Short description..." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-2 gap-4">
                        <FormField
                        control={form.control}
                        name="cta_text"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Button Text</FormLabel>
                            <FormControl>
                                <Input placeholder="Get Started" {...field} />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                        <FormField
                        control={form.control}
                        name="cta_link"
                        render={({ field }) => (
                            <FormItem>
                            <FormLabel>Button Link</FormLabel>
                            <FormControl>
                                <Input placeholder="/courses" {...field} />
                            </FormControl>
                            <FormMessage />
                            </FormItem>
                        )}
                        />
                    </div>

                    <FormField
                        control={form.control}
                        name="is_active"
                        render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 shadow-sm">
                                <div className="space-y-0.5">
                                    <FormLabel>Active Status</FormLabel>
                                    <div className="text-[0.8rem] text-muted-foreground">
                                        Show this slide on homepage.
                                    </div>
                                </div>
                                <FormControl>
                                    <Switch
                                        checked={field.value}
                                        onCheckedChange={field.onChange}
                                    />
                                </FormControl>
                            </FormItem>
                        )}
                    />

                    <Button type="submit" className="w-full" disabled={upsertMutation.isPending}>
                      {upsertMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {editingId ? "Update Hero" : "Create Hero"}
                    </Button>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>

          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Image</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8">
                        <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ) : heroes?.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No heroes found. Add one to customize homepage.
                      </TableCell>
                    </TableRow>
                  ) : (
                    heroes?.map((hero: any) => (
                      <TableRow key={hero.id}>
                        <TableCell>
                            {hero.image_url ? (
                                <img src={hero.image_url} alt="hero" className="h-12 w-20 object-cover rounded-md" />
                            ) : (
                                <div className="h-12 w-20 bg-muted rounded-md flex items-center justify-center">
                                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                                </div>
                            )}
                        </TableCell>
                        <TableCell className="font-medium">
                            {hero.title}
                            <div className="text-xs text-muted-foreground truncate max-w-[200px]">{hero.subtitle}</div>
                        </TableCell>
                        <TableCell>
                            {hero.display_order}
                        </TableCell>
                        <TableCell>
                            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${hero.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                                {hero.is_active ? 'Active' : 'Hidden'}
                            </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => handleEdit(hero)}>
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-destructive hover:text-destructive"
                              onClick={() => {
                                if (confirm("Delete this slide?")) {
                                  deleteMutation.mutate(hero.id);
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
    </div>
  );
};

export default AdminHeroes;
