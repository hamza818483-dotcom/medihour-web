import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import PublicHeader from "@/components/PublicHeader";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { Star } from "lucide-react";
import { MaleAvatar, FemaleAvatar } from "@/components/Avatars";
import { cn } from "@/lib/utils";

const Reviews = () => {
  const { data: reviews, isLoading } = useQuery({
    queryKey: ["all-public-reviews"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("reviews")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <PublicHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-16 pt-[110px]">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-black tracking-tight sm:text-3xl">শিক্ষার্থীদের মতামত</h1>
          <p className="mt-2 text-sm text-muted-foreground">আমাদের শিক্ষার্থীদের অভিজ্ঞতা</p>
        </div>

        {isLoading ? (
          <p className="text-center text-sm text-muted-foreground">লোড হচ্ছে...</p>
        ) : !reviews || reviews.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">এখনো কোনো মতামত যোগ করা হয়নি।</p>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 md:grid-cols-3">
            {reviews.map((review: any) => (
              <Card key={review.id} className="h-full overflow-hidden rounded-xl border-none bg-card shadow-md">
                <CardContent className="flex h-full flex-col gap-4 p-6">
                  <div className="flex items-center gap-4">
                    <div className="flex-shrink-0">
                      {review.image_url ? (
                        <img
                          src={review.image_url}
                          alt={review.student_name}
                          className="h-14 w-14 rounded-full border-2 border-primary/10 object-cover"
                        />
                      ) : review.gender === "female" ? (
                        <FemaleAvatar className="h-14 w-14" />
                      ) : (
                        <MaleAvatar className="h-14 w-14" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-base font-bold">{review.student_name}</h3>
                      <p className="truncate text-xs uppercase tracking-wide text-muted-foreground">{review.college_name}</p>
                      <div className="mt-1 flex items-center gap-0.5 text-yellow-500">
                        {[...Array(5)].map((_, i) => (
                          <Star key={i} className={cn("h-3 w-3", i < review.rating ? "fill-current" : "text-muted-foreground/30")} />
                        ))}
                      </div>
                    </div>
                  </div>
                  <p className="text-sm italic leading-relaxed text-muted-foreground">"{review.review_text}"</p>
                  {review.post_image_url && (
                    <div className="mt-2 overflow-hidden rounded-lg border border-border/50">
                      <img src={review.post_image_url} alt="Review attachment" className="h-48 w-full object-cover transition-transform duration-500 hover:scale-105" />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default Reviews;
