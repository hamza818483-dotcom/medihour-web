import React, { useEffect, useState } from "react";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import { Card, CardContent } from "@/components/ui/card";
import { Star } from "lucide-react";
import { MaleAvatar, FemaleAvatar } from "@/components/Avatars";
import { cn } from "@/lib/utils";

export interface Review {
  id: string | number;
  student_name: string;
  college_name: string;
  review_text: string;
  rating: number;
  gender: string;
  image_url?: string;
  post_image_url?: string;
}

interface StudentReviewsProps {
  reviews: Review[];
  id?: string;
}

export const StudentReviews = ({ reviews, id }: StudentReviewsProps) => {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!api) {
      return;
    }

    setCount(api.scrollSnapList().length);
    setCurrent(api.selectedScrollSnap() + 1);

    api.on("select", () => {
      setCurrent(api.selectedScrollSnap() + 1);
    });
  }, [api]);

  if (!reviews || reviews.length === 0) return null;

  return (
    <section id={id} className="space-y-8 w-[1px] min-w-full overflow-hidden">
      <h2 className="text-2xl font-semibold tracking-tight text-center">
        শিক্ষার্থীদের মতামত
      </h2>

      <div className="relative md:px-12">
        <Carousel
          setApi={setApi}
          opts={{
            align: "start",
            loop: true,
          }}
          className="w-full"
        >
          <CarouselContent className="-ml-4">
            {reviews.map((review) => (
              <CarouselItem
                key={review.id}
                className="pl-4 md:basis-1/2 lg:basis-1/3"
              >
                <div className="h-full p-1">
                  <Card className="h-full border-none shadow-md bg-card rounded-xl overflow-hidden">
                    <CardContent className="p-6 flex flex-col gap-4 h-full">
                      <div className="flex items-center gap-4">
                        <div className="flex-shrink-0">
                          {review.image_url ? (
                            <img
                              src={review.image_url}
                              alt={review.student_name}
                              className="h-14 w-14 rounded-full object-cover border-2 border-primary/10"
                            />
                          ) : review.gender === "female" ? (
                            <FemaleAvatar className="h-14 w-14" />
                          ) : (
                            <MaleAvatar className="h-14 w-14" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-base truncate">
                            {review.student_name}
                          </h3>
                          <p className="text-xs text-muted-foreground uppercase tracking-wide truncate">
                            {review.college_name}
                          </p>
                          <div className="flex items-center gap-0.5 text-yellow-500 mt-1">
                            {[...Array(5)].map((_, i) => (
                              <Star
                                key={i}
                                className={cn(
                                  "h-3 w-3",
                                  i < review.rating
                                    ? "fill-current"
                                    : "text-muted-foreground/30"
                                )}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-muted-foreground italic leading-relaxed line-clamp-4">
                        "{review.review_text}"
                      </p>
                      {review.post_image_url && (
                        <div className="mt-4 rounded-lg overflow-hidden border border-border/50">
                            <img src={review.post_image_url} alt="Review attachment" className="w-full h-48 object-cover hover:scale-105 transition-transform duration-500" />
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <CarouselPrevious className="hidden md:flex -left-4 lg:-left-12" />
          <CarouselNext className="hidden md:flex -right-4 lg:-right-12" />
        </Carousel>

        {/* Dots */}
        <div className="flex justify-center gap-2 mt-6">
          {Array.from({ length: count }).map((_, index) => (
            <button
              key={index}
              className={cn(
                "h-2 w-2 rounded-full transition-all duration-300",
                index + 1 === current
                  ? "bg-primary w-6"
                  : "bg-primary/20 hover:bg-primary/40"
              )}
              onClick={() => api?.scrollTo(index)}
              aria-label={`Go to slide ${index + 1}`}
            />
          ))}
        </div>
        
        <div className="mt-8 flex justify-center">
             <a 
                href="/reviews"
                className="inline-flex items-center justify-center whitespace-nowrap text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-primary/50 bg-transparent hover:bg-primary/5 text-primary h-10 px-8 py-2 w-full max-w-sm rounded-full"
             >
                 সব মতামত দেখুন
             </a>
        </div>
      </div>
    </section>
  );
};
