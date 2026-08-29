import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Star, Edit2 } from "lucide-react";

// Review Interface matching DB
interface Review {
    id: string | number;
    student_name: string;
    college_name: string;
    review_text: string;
    rating: number;
    gender: string;
    image_url?: string;
    post_image_url?: string;
    category?: string;
    images?: string[];
}

const AdminReviews = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | number | null>(null);

  const [form, setForm] = useState<Partial<Review>>({
      student_name: "",
      college_name: "",
      review_text: "",
      rating: 5,
      gender: "male",
      image_url: "",
      post_image_url: "",
      category: "classes",
      images: []
  });

  const { data: reviews, isLoading } = useQuery({
      queryKey: ["admin-reviews"],
      queryFn: async () => {
          // @ts-ignore

          const { data, error } = await supabase.from("reviews").select("*").order("created_at", { ascending: false });
          if (error) throw error;
          return data as unknown as Review[];
      }
  });

  const upsertMutation = useMutation({
      mutationFn: async (values: Partial<Review>) => {
          if (editingId) {
              // @ts-ignore
              const { error } = await supabase.from("reviews").update(values).eq("id", editingId);
              if (error) throw error;
          } else {
              // @ts-ignore
              const { error } = await supabase.from("reviews").insert(values);
              if (error) throw error;
          }
      },
      onSuccess: () => {
          toast({ title: editingId ? "Review updated" : "Review added" });
          setForm({
              student_name: "",
              college_name: "",
              review_text: "",
              rating: 5,
              gender: "male",
              image_url: "",
              post_image_url: "",
              category: "classes",
              images: []
          });
          setEditingId(null);
          queryClient.invalidateQueries({ queryKey: ["admin-reviews"] });
          queryClient.invalidateQueries({ queryKey: ["public-reviews"] });
      },
      onError: (err) => {
          toast({ title: "Error", description: err.message, variant: "destructive" });
      }
  });

  const deleteMutation = useMutation({
      mutationFn: async (id: string | number) => {
          // @ts-ignore
          const { error } = await supabase.from("reviews").delete().eq("id", id);
          if (error) throw error;
      },
      onSuccess: () => {
          toast({ title: "Review deleted" });
          queryClient.invalidateQueries({ queryKey: ["admin-reviews"] });
          queryClient.invalidateQueries({ queryKey: ["public-reviews"] });
      }
  });

  const handleEdit = (review: Review) => {
      setEditingId(review.id);
      setForm(review);
      window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
      <div className="space-y-6">
          <header className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">Admin: Reviews</h1>
            <p className="text-sm text-muted-foreground">Manage student reviews displayed on the homepage.</p>
          </header>

          <Card>
              <CardHeader>
                  <CardTitle>{editingId ? "Edit Review" : "Add New Review"}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                          <Label>Student Name</Label>
                          <Input value={form.student_name} onChange={e => setForm({...form, student_name: e.target.value})} />
                      </div>
                      <div className="space-y-2">
                          <Label>College Name</Label>
                          <Input value={form.college_name} onChange={e => setForm({...form, college_name: e.target.value})} />
                      </div>
                      <div className="space-y-2">
                          <Label>Gender</Label>
                          <select
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                              value={form.gender}
                              onChange={e => setForm({...form, gender: e.target.value})}
                          >
                              <option value="male">Male</option>
                              <option value="female">Female</option>
                          </select>
                      </div>
                      <div className="space-y-2">
                          <Label>Rating (1-5)</Label>
                          <Input
                              type="number"
                              min="1"
                              max="5"
                              value={form.rating}
                              onChange={e => setForm({...form, rating: parseInt(e.target.value)})}
                          />
                      </div>
                      <div className="space-y-2">
                          <Label>Profile Image URL (Avatar)</Label>
                          <Input
                              value={form.image_url || ""}
                              onChange={e => setForm({...form, image_url: e.target.value})}
                              placeholder="https://..."
                          />
                      </div>
                      <div className="space-y-2">
                          <Label>Category</Label>
                          <select
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                              value={form.category || "classes"}
                              onChange={e => setForm({...form, category: e.target.value})}
                          >
                              <option value="classes">Class Reviews</option>
                              <option value="website">Platform Experience</option>
                              <option value="exams">Exam System</option>
                          </select>
                      </div>
                      <div className="col-span-1 md:col-span-2 space-y-2">
                          <Label>Album Images (One URL per line)</Label>
                          <Textarea
                              className="h-24"
                              value={form.images?.join('\n') || form.post_image_url || ""}
                              onChange={e => {
                                  const lines = e.target.value.split('\n').map(l => l.trim()).filter(Boolean);
                                  setForm({...form, images: lines, post_image_url: lines.length > 0 ? lines[0] : ""});
                              }}
                              placeholder="https://image1.jpg&#10;https://image2.jpg"
                          />
                          <p className="text-[10px] text-muted-foreground">Add multiple image URLs here to create an album. One on each line.</p>
                      </div>
                      <div className="col-span-1 md:col-span-2 space-y-2">
                          <Label>Review Text</Label>
                          <Textarea
                              value={form.review_text || ""}
                              onChange={e => setForm({...form, review_text: e.target.value})}
                          />
                      </div>
                  </div>
                  <div className="flex gap-2">
                      <Button onClick={() => upsertMutation.mutate(form)} disabled={upsertMutation.isPending}>
                          {upsertMutation.isPending ? "Saving..." : editingId ? "Update Review" : "Add Review"}
                      </Button>
                      {editingId && (
                          <Button variant="outline" onClick={() => { setEditingId(null); setForm({ rating: 5, gender: "male" }); }}>
                              Cancel
                          </Button>
                      )}
                  </div>
              </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {reviews?.map(review => (
                  <Card key={review.id} className="relative">
                      <CardContent className="pt-6">
                          <div className="absolute top-2 right-2 flex gap-1">
                              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => handleEdit(review)}>
                                  <Edit2 className="h-3 w-3" />
                              </Button>
                              <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => { if(confirm("Delete?")) deleteMutation.mutate(review.id) }}>
                                  <Trash2 className="h-3 w-3" />
                              </Button>
                          </div>
                          <div className="flex items-center gap-3 mb-2">
                              {review.image_url ? (
                                  <img src={review.image_url} alt={review.student_name} className="h-10 w-10 rounded-full object-cover" />
                              ) : (
                                  <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center text-xs font-bold">
                                      {review.student_name.charAt(0)}
                                  </div>
                              )}
                              <div>
                                  <h4 className="font-bold text-sm">{review.student_name}</h4>
                                  <p className="text-xs text-muted-foreground">{review.college_name}</p>
                              </div>
                          </div>
                          <div className="flex text-yellow-500 mb-2">
                              {[...Array(5)].map((_, i) => (
                                  <Star key={i} className={`h-3 w-3 ${i < review.rating ? "fill-current" : "text-muted-foreground/30"}`} />
                              ))}
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-3 mb-2">"{review.review_text}"</p>
                          <div className="flex gap-1 overflow-x-auto mt-2 pb-2">
                              {review.images && review.images.length > 0 ? (
                                  review.images.map((img, idx) => (
                                      <img key={idx} src={img} alt={`Post ${idx}`} className="h-16 w-16 object-cover rounded-md flex-shrink-0 border" />
                                  ))
                              ) : review.post_image_url ? (
                                  <img src={review.post_image_url} alt="Post" className="h-16 w-16 object-cover rounded-md flex-shrink-0 border" />
                              ) : null}
                          </div>
                      </CardContent>
                  </Card>
              ))}
          </div>
      </div>
  );
};

export default AdminReviews;
