import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ImageUploader, MultiImageUploader } from "@/components/ui/image-uploader";
import { useToast } from "@/hooks/use-toast";
import { Trash2, Plus, Star } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  courseId: string;
}

export function CourseMentorsReviewsManager({ courseId }: Props) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ---------- Mentors ----------
  const [selectedMentorId, setSelectedMentorId] = useState("");
  const [experienceYears, setExperienceYears] = useState("");
  const [showNewMentorForm, setShowNewMentorForm] = useState(false);
  const [newMentor, setNewMentor] = useState({ name: "", role: "", description: "", image_url: "" });

  const { data: allMentors } = useQuery({
    queryKey: ["all-mentors"],
    queryFn: async () => {
      const { data, error } = await supabase.from("mentors").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: courseMentors, isLoading: loadingMentors } = useQuery({
    queryKey: ["course-mentors", courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("course_mentors")
        .select("*, mentors(*)")
        .eq("course_id", courseId)
        .order("display_order");
      if (error) throw error;
      return data;
    },
    enabled: !!courseId,
  });

  const addMentorMutation = useMutation({
    mutationFn: async () => {
      if (!selectedMentorId) throw new Error("Select a mentor");
      const { error } = await supabase.from("course_mentors").insert({
        course_id: courseId,
        mentor_id: selectedMentorId,
        experience_years: experienceYears || null,
        display_order: courseMentors?.length || 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Mentor added to course" });
      queryClient.invalidateQueries({ queryKey: ["course-mentors", courseId] });
      setSelectedMentorId("");
      setExperienceYears("");
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const createMentorMutation = useMutation({
    mutationFn: async () => {
      if (!newMentor.name.trim()) throw new Error("Mentor name is required");
      const { data: mentor, error } = await supabase
        .from("mentors")
        .insert({
          name: newMentor.name,
          role: newMentor.role || null,
          description: newMentor.description || null,
          image_url: newMentor.image_url || null,
        })
        .select()
        .single();
      if (error) throw error;
      const { error: linkError } = await supabase.from("course_mentors").insert({
        course_id: courseId,
        mentor_id: mentor.id,
        experience_years: experienceYears || null,
        display_order: courseMentors?.length || 0,
      });
      if (linkError) throw linkError;
    },
    onSuccess: () => {
      toast({ title: "Mentor created and added to course" });
      queryClient.invalidateQueries({ queryKey: ["course-mentors", courseId] });
      queryClient.invalidateQueries({ queryKey: ["all-mentors"] });
      setNewMentor({ name: "", role: "", description: "", image_url: "" });
      setExperienceYears("");
      setShowNewMentorForm(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const removeMentorMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("course_mentors").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Mentor removed" });
      queryClient.invalidateQueries({ queryKey: ["course-mentors", courseId] });
    },
  });

  // ---------- Reviews ----------
  const [reviewForm, setReviewForm] = useState({
    student_name: "",
    college_name: "",
    review_text: "",
    rating: 5,
    image_url: "",
    post_image_url: "",
    images: [] as string[],
  });

  const { data: courseReviews, isLoading: loadingReviews } = useQuery({
    queryKey: ["course-reviews", courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("*")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!courseId,
  });

  const addReviewMutation = useMutation({
    mutationFn: async () => {
      if (!reviewForm.image_url.trim() && !reviewForm.post_image_url.trim() && reviewForm.images.length === 0) {
        throw new Error("At least one image is required");
      }
      const { error } = await supabase.from("reviews").insert({
        course_id: courseId,
        student_name: reviewForm.student_name || null,
        college_name: reviewForm.college_name || null,
        review_text: reviewForm.review_text || null,
        rating: reviewForm.rating || null,
        image_url: reviewForm.image_url || null,
        post_image_url: reviewForm.post_image_url || null,
        images: reviewForm.images.length > 0 ? reviewForm.images : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Review added" });
      queryClient.invalidateQueries({ queryKey: ["course-reviews", courseId] });
      setReviewForm({ student_name: "", college_name: "", review_text: "", rating: 5, image_url: "", post_image_url: "", images: [] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteReviewMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("reviews").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Review deleted" });
      queryClient.invalidateQueries({ queryKey: ["course-reviews", courseId] });
    },
  });

  const availableMentors = (allMentors || []).filter(
    (m) => !courseMentors?.some((cm) => cm.mentor_id === m.id)
  );

  return (
    <div className="space-y-6">
      {/* Mentors */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Course Mentors</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <Select value={selectedMentorId} onValueChange={setSelectedMentorId}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select a mentor" />
              </SelectTrigger>
              <SelectContent>
                {availableMentors.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} {m.role ? `— ${m.role}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Experience (e.g. 5+ years)"
              value={experienceYears}
              onChange={(e) => setExperienceYears(e.target.value)}
              className="sm:w-56"
            />
            <Button onClick={() => addMentorMutation.mutate()} disabled={!selectedMentorId || addMentorMutation.isPending}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>

          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setShowNewMentorForm((v) => !v)}>
              <Plus className="h-4 w-4 mr-1" /> {showNewMentorForm ? "Cancel New Mentor" : "Create New Mentor"}
            </Button>
          </div>

          {showNewMentorForm && (
            <div className="grid sm:grid-cols-2 gap-3 border rounded-lg p-4">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input value={newMentor.name} onChange={(e) => setNewMentor({ ...newMentor, name: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Porichoy (Role)</Label>
                <Input value={newMentor.role} onChange={(e) => setNewMentor({ ...newMentor, role: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Detail (Description)</Label>
                <Textarea value={newMentor.description} onChange={(e) => setNewMentor({ ...newMentor, description: e.target.value })} rows={3} />
              </div>
              <div className="space-y-1.5">
                <Label>Photo</Label>
                <ImageUploader value={newMentor.image_url} onChange={(url) => setNewMentor({ ...newMentor, image_url: url })} />
              </div>
              <div className="space-y-1.5">
                <Label>Experience (e.g. 5+ years)</Label>
                <Input value={experienceYears} onChange={(e) => setExperienceYears(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Button onClick={() => createMentorMutation.mutate()} disabled={createMentorMutation.isPending}>
                  <Plus className="h-4 w-4 mr-1" /> Create & Add Mentor
                </Button>
              </div>
            </div>
          )}

          {loadingMentors ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : courseMentors && courseMentors.length > 0 ? (
            <div className="space-y-2">
              {courseMentors.map((cm: any) => (
                <div key={cm.id} className="flex items-center justify-between border rounded-lg p-3">
                  <div className="flex items-center gap-3">
                    {cm.mentors?.image_url && (
                      <img src={cm.mentors.image_url} alt={cm.mentors.name} className="h-10 w-10 rounded-full object-cover" />
                    )}
                    <div>
                      <p className="font-medium text-sm">{cm.mentors?.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {cm.mentors?.role} {cm.experience_years ? `• ${cm.experience_years} exp` : ""}
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeMentorMutation.mutate(cm.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No mentors linked yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Reviews */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Course Reviews</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3 border rounded-lg p-4">
            <div className="space-y-1.5">
              <Label>Student Name</Label>
              <Input value={reviewForm.student_name} onChange={(e) => setReviewForm({ ...reviewForm, student_name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>College Name</Label>
              <Input value={reviewForm.college_name} onChange={(e) => setReviewForm({ ...reviewForm, college_name: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Review Text</Label>
              <Textarea value={reviewForm.review_text} onChange={(e) => setReviewForm({ ...reviewForm, review_text: e.target.value })} rows={3} />
            </div>
            <div className="space-y-1.5">
              <Label>Rating (1-5)</Label>
              <Input
                type="number"
                min={1}
                max={5}
                value={reviewForm.rating}
                onChange={(e) => setReviewForm({ ...reviewForm, rating: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Student Photo</Label>
              <ImageUploader value={reviewForm.image_url} onChange={(url) => setReviewForm({ ...reviewForm, image_url: url })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Review Screenshot / Post Image (optional)</Label>
              <ImageUploader value={reviewForm.post_image_url} onChange={(url) => setReviewForm({ ...reviewForm, post_image_url: url })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Additional Images (optional, select multiple)</Label>
              <MultiImageUploader values={reviewForm.images} onChange={(images) => setReviewForm({ ...reviewForm, images })} />
            </div>
            <div className="sm:col-span-2">
              <Button onClick={() => addReviewMutation.mutate()} disabled={addReviewMutation.isPending}>
                <Plus className="h-4 w-4 mr-1" /> Add Review
              </Button>
            </div>
          </div>

          {loadingReviews ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : courseReviews && courseReviews.length > 0 ? (
            <div className="space-y-2">
              {courseReviews.map((r: any) => (
                <div key={r.id} className="flex items-start justify-between border rounded-lg p-3">
                  <div className="flex items-start gap-3">
                    {r.image_url && <img src={r.image_url} alt={r.student_name} className="h-10 w-10 rounded-full object-cover" />}
                    <div>
                      <p className="font-medium text-sm flex items-center gap-1">
                        {r.student_name}
                        <span className="flex items-center text-amber-500 text-xs ml-1">
                          {r.rating} <Star className="h-3 w-3 fill-current ml-0.5" />
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">{r.college_name}</p>
                      <p className="text-xs mt-1 line-clamp-2 max-w-md">{r.review_text}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => deleteReviewMutation.mutate(r.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No reviews added yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
