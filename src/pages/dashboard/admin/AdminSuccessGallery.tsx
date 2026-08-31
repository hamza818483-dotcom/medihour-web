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
import { useToast } from "@/hooks/use-toast";
import { ImageUploader } from "@/components/ui/image-uploader";
import { Loader2, Plus, Trash2, Edit } from "lucide-react";

const gallerySchema = z.object({
  image_url: z.string().url("Must be a valid URL"),
  caption: z.string().optional(),
  display_order: z.coerce.number().default(0),
});

type GalleryFormValues = z.infer<typeof gallerySchema>;

const AdminSuccessGallery = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    document.title = "Success Gallery – Admin";
  }, []);

  const form = useForm<GalleryFormValues>({
    resolver: zodResolver(gallerySchema),
    defaultValues: { image_url: "", caption: "", display_order: 0 },
  });

  const { data: photos, isLoading } = useQuery({
    queryKey: ["admin-success-gallery"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("success_gallery")
        .select("*")
        .order("display_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const upsertMutation = useMutation({
    mutationFn: async (values: GalleryFormValues) => {
      const payload = {
        image_url: values.image_url,
        caption: values.caption,
        display_order: values.display_order,
      };
      if (editingId) {
        const { error } = await supabase.from("success_gallery").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("success_gallery").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: editingId ? "Photo updated" : "Photo added" });
      queryClient.invalidateQueries({ queryKey: ["admin-success-gallery"] });
      queryClient.invalidateQueries({ queryKey: ["success-gallery-public"] });
      setIsDialogOpen(false);
      form.reset();
      setEditingId(null);
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("success_gallery").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Photo deleted" });
      queryClient.invalidateQueries({ queryKey: ["admin-success-gallery"] });
      queryClient.invalidateQueries({ queryKey: ["success-gallery-public"] });
    },
    onError: (error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const onSubmit = (values: GalleryFormValues) => upsertMutation.mutate(values);

  const handleEdit = (photo: any) => {
    setEditingId(photo.id);
    form.reset({
      image_url: photo.image_url || "",
      caption: photo.caption || "",
      display_order: photo.display_order || 0,
    });
    setIsDialogOpen(true);
  };

  const handleAddNew = () => {
    setEditingId(null);
    form.reset({ image_url: "", caption: "", display_order: 0 });
    setIsDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Success Gallery</h2>
          <p className="text-muted-foreground">Manage student achievement photos shown on the homepage.</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleAddNew}>
              <Plus className="mr-2 h-4 w-4" /> Add Photo
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{editingId ? "Edit Photo" : "Add Photo"}</DialogTitle>
              <DialogDescription>Upload a student success/achievement photo.</DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="image_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Photo</FormLabel>
                      <FormControl>
                        <ImageUploader value={field.value} onChange={field.onChange} placeholder="https://... or upload" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="caption"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Caption (optional)</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Medical Admission 2025" {...field} />
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
                      <FormLabel>Display Order</FormLabel>
                      <FormControl>
                        <Input type="number" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={upsertMutation.isPending}>
                  {upsertMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {editingId ? "Update Photo" : "Add Photo"}
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
                <TableHead>Photo</TableHead>
                <TableHead>Caption</TableHead>
                <TableHead className="text-right">Order</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8">
                    <Loader2 className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : photos?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No photos found. Add one to get started.
                  </TableCell>
                </TableRow>
              ) : (
                photos?.map((photo) => (
                  <TableRow key={photo.id}>
                    <TableCell>
                      <img src={photo.image_url} alt={photo.caption || ""} className="h-12 w-20 rounded object-cover" />
                    </TableCell>
                    <TableCell className="font-medium">{photo.caption || "—"}</TableCell>
                    <TableCell className="text-right">{photo.display_order}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" onClick={() => handleEdit(photo)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => {
                            if (confirm("Are you sure you want to delete this photo?")) {
                              deleteMutation.mutate(photo.id);
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

export default AdminSuccessGallery;
