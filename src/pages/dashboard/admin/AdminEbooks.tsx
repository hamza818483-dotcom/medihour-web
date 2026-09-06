import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { ImageUploader } from "@/components/ui/image-uploader";
import { Loader2, Plus, Trash2, Edit } from "lucide-react";

const ebookSchema = z.object({
  name: z.string().min(1, "Name is required"),
  image_url: z.string().optional(),
  download_url: z.string().optional(),
  original_price: z.coerce.number().min(0).optional(),
  discount_price: z.coerce.number().min(0).optional(),
  display_order: z.coerce.number().default(0),
  is_active: z.boolean().default(true),
});

type EbookFormValues = z.infer<typeof ebookSchema>;

const AdminEbooks = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Manage E-Books – Admin";
  }, []);

  const form = useForm<EbookFormValues>({
    resolver: zodResolver(ebookSchema),
    defaultValues: {
      name: "",
      image_url: "",
      download_url: "",
      original_price: undefined,
      discount_price: undefined,
      display_order: 0,
      is_active: true,
    },
  });

  const { data: ebooks, isLoading } = useQuery({
    queryKey: ["admin-ebooks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ebooks")
        .select("*")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (values: EbookFormValues) => {
      const payload = {
        name: values.name,
        image_url: values.image_url || null,
        download_url: values.download_url || null,
        original_price: values.original_price ?? null,
        discount_price: values.discount_price ?? null,
        display_order: values.display_order,
        is_active: values.is_active,
      };

      if (editingId) {
        const { error } = await supabase.from("ebooks").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ebooks").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: editingId ? "E-Book updated" : "E-Book added" });
      queryClient.invalidateQueries({ queryKey: ["admin-ebooks"] });
      queryClient.invalidateQueries({ queryKey: ["public-ebooks"] });
      setIsDialogOpen(false);
      form.reset();
      setEditingId(null);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ebooks").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "E-Book deleted" });
      queryClient.invalidateQueries({ queryKey: ["admin-ebooks"] });
      queryClient.invalidateQueries({ queryKey: ["public-ebooks"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (values: EbookFormValues) => {
    upsertMutation.mutate(values);
  };

  const handleEdit = (ebook: any) => {
    setEditingId(ebook.id);
    form.reset({
      name: ebook.name,
      image_url: ebook.image_url || "",
      download_url: ebook.download_url || "",
      original_price: ebook.original_price ?? undefined,
      discount_price: ebook.discount_price ?? undefined,
      display_order: ebook.display_order || 0,
      is_active: ebook.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleAddNew = () => {
    setEditingId(null);
    form.reset({
      name: "",
      image_url: "",
      download_url: "",
      original_price: undefined,
      discount_price: undefined,
      display_order: 0,
      is_active: true,
    });
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">E-Books</h2>
          <p className="text-muted-foreground">Manage downloadable e-books shown on the public E-Books page.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleAddNew}>
              <Plus className="mr-2 h-4 w-4" /> Add E-Book
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit E-Book" : "Add E-Book"}</DialogTitle>
              <DialogDescription>Enter the details for the e-book card.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Book Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Book title" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="image_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Book Cover Photo</FormLabel>
                      <FormControl>
                        <ImageUploader value={field.value} onChange={field.onChange} placeholder="https://... or upload" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="download_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Download Link</FormLabel>
                      <FormControl>
                        <Input placeholder="https://..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="original_price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Original Price (৳)</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="discount_price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Discount Price (৳)</FormLabel>
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
                  name="display_order"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Order</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="is_active"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <FormLabel className="!mt-0">Active (visible on public page)</FormLabel>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={upsertMutation.isPending}>
                  {upsertMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingId ? "Update E-Book" : "Add E-Book"}
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
                <TableHead>Cover</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Price</TableHead>
                <TableHead className="text-right">Order</TableHead>
                <TableHead className="text-right">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : ebooks?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No e-books found. Add one to get started.
                  </TableCell>
                </TableRow>
              ) : (
                ebooks?.map((ebook: any) => (
                  <TableRow key={ebook.id}>
                    <TableCell>
                      {ebook.image_url ? (
                        <img src={ebook.image_url} alt={ebook.name} className="h-12 w-9 rounded object-cover" />
                      ) : (
                        <div className="h-12 w-9 rounded bg-secondary" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium">{ebook.name}</TableCell>
                    <TableCell>
                      {ebook.discount_price != null && ebook.original_price != null && ebook.discount_price < ebook.original_price ? (
                        <span>
                          <span className="line-through text-muted-foreground mr-1">৳{ebook.original_price}</span>
                          ৳{ebook.discount_price}
                        </span>
                      ) : ebook.original_price != null ? (
                        <span>৳{ebook.original_price}</span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                    <TableCell className="text-right">{ebook.display_order}</TableCell>
                    <TableCell className="text-right">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ebook.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>
                        {ebook.is_active ? 'Active' : 'Hidden'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(ebook)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm("Are you sure you want to delete this e-book?")) {
                              deleteMutation.mutate(ebook.id);
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

export default AdminEbooks;
