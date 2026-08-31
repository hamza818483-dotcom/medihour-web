import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Users, CheckCircle2, Star } from "lucide-react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";

const CourseDetails = () => {
  const { courseId } = useParams<{ courseId: string }>();

  const { data: course, isLoading, isError } = useQuery({
    queryKey: ["public-course-details", courseId],
    queryFn: async () => {
      if (!courseId) return null;
      const { data, error } = await supabase
        .from("courses")
        .select(
          "id, name, full_description, short_description, price, original_price, image_url, video_url, what_you_get, is_active, is_public"
        )
        .or(`slug.eq.${courseId},id.eq.${courseId}`)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!courseId,
    staleTime: 3 * 60 * 1000,
  });

  const { data: enrollmentCount } = useQuery({
    queryKey: ["course-enrollment-count", course?.id],
    queryFn: async () => {
      if (!course?.id) return 0;
      const { count, error } = await supabase
        .from("enrollments")
        .select("id", { count: "exact", head: true })
        .eq("course_id", course.id);
      if (error) return 0;
      return count || 0;
    },
    enabled: !!course?.id,
  });

  // Fetch mentors linked to this course
  const { data: courseMentors } = useQuery({
    queryKey: ["public-course-mentors", course?.id],
    queryFn: async () => {
      if (!course?.id) return [];
      const { data, error } = await supabase
        .from("course_mentors")
        .select("*, mentors(*)")
        .eq("course_id", course.id)
        .order("display_order");
      if (error) return [];
      return data || [];
    },
    enabled: !!course?.id,
  });

  // Fetch reviews linked to this course
  const { data: courseReviews } = useQuery({
    queryKey: ["public-course-reviews", course?.id],
    queryFn: async () => {
      if (!course?.id) return [];
      const { data, error } = await supabase
        .from("reviews")
        .select("*")
        .eq("course_id", course.id)
        .order("created_at", { ascending: false });
      if (error) return [];
      return data || [];
    },
    enabled: !!course?.id,
  });

  const [reviewEmblaRef] = useEmblaCarousel({ loop: true, align: "start" }, [
    Autoplay({ delay: 2500, stopOnInteraction: false }),
  ]);

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">লোড হচ্ছে...</p>
      </div>
    );
  }

  if (isError || !course) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-lg font-bold">কোর্সটি খুঁজে পাওয়া যায়নি</p>
        <Link to="/" className="text-sm text-primary underline">
          হোমে ফিরে যান
        </Link>
      </div>
    );
  }

  const whatYouGet: string[] = Array.isArray(course.what_you_get)
    ? (course.what_you_get as string[])
    : [];

  const discountPct =
    course.original_price && Number(course.original_price) > Number(course.price)
      ? Math.round(
          ((Number(course.original_price) - Number(course.price)) /
            Number(course.original_price)) *
            100
        )
      : 0;

  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-6">
      <Link
        to="/"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> ফিরে যান
      </Link>

      {course.image_url && (
        <div className="mb-5 overflow-hidden rounded-2xl border">
          <img
            src={course.image_url}
            alt={course.name}
            className="w-full object-cover"
          />
        </div>
      )}

      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-extrabold sm:text-3xl">{course.name}</h1>
        {discountPct > 0 && (
          <Badge className="bg-[#e93482] hover:bg-[#e93482]">{discountPct}% ছাড়</Badge>
        )}
      </div>

      <div className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Users className="h-4 w-4 text-green-500" />
        {(enrollmentCount || 0).toLocaleString("en-BD")} জন ভর্তি হয়েছে
      </div>

      {course.short_description && (
        <p className="mb-4 text-muted-foreground">{course.short_description}</p>
      )}

      {course.full_description && (
        <div className="mb-6 whitespace-pre-wrap text-sm leading-relaxed">
          {course.full_description}
        </div>
      )}

      {whatYouGet.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-lg font-bold">যা যা পাবে</h2>
          <ul className="space-y-2">
            {whatYouGet.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {courseMentors && courseMentors.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-lg font-bold">এই কোর্সের মেন্টরবৃন্দ</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6">
            {courseMentors.map((cm: any) => (
              <div key={cm.id} className="flex flex-col items-center text-center space-y-2">
                <div className="h-24 w-24 rounded-full overflow-hidden border-2 border-primary shadow-md">
                  {cm.mentors?.image_url ? (
                    <img src={cm.mentors.image_url} alt={cm.mentors?.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full bg-secondary" />
                  )}
                </div>
                <div>
                  <p className="font-semibold text-sm">{cm.mentors?.name}</p>
                  {cm.mentors?.role && (
                    <p className="text-xs text-primary font-medium">{cm.mentors.role}</p>
                  )}
                  {cm.experience_years && (
                    <p className="text-xs text-muted-foreground">{cm.experience_years} অভিজ্ঞতা</p>
                  )}
                  {cm.mentors?.description && (
                    <p className="text-xs text-muted-foreground mt-1 max-w-[150px]">{cm.mentors.description}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {courseReviews && courseReviews.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-lg font-bold">শিক্ষার্থীদের মতামত</h2>
          <div className="overflow-hidden" ref={reviewEmblaRef}>
            <div className="flex gap-4">
              {courseReviews.map((r: any) => (
                <div key={r.id} className="flex-[0_0_85%] sm:flex-[0_0_45%] min-w-0">
                  <div className="border rounded-xl p-4 h-full bg-card">
                    <div className="flex items-center gap-3 mb-2">
                      {r.image_url ? (
                        <img src={r.image_url} alt={r.student_name} className="h-10 w-10 rounded-full object-cover" />
                      ) : (
                        <div className="h-10 w-10 rounded-full bg-secondary" />
                      )}
                      <div>
                        <p className="font-medium text-sm">{r.student_name}</p>
                        {r.college_name && <p className="text-xs text-muted-foreground">{r.college_name}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 mb-1.5">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`h-3.5 w-3.5 ${i < r.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"}`} />
                      ))}
                    </div>
                    <p className="text-sm text-muted-foreground line-clamp-4">{r.review_text}</p>
                    {r.post_image_url && (
                      <img src={r.post_image_url} alt="Review" className="mt-3 rounded-lg w-full h-auto object-contain max-h-64" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="sticky bottom-3 mt-8 flex items-center justify-between gap-3 rounded-2xl border bg-background/95 p-4 shadow-lg backdrop-blur">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-extrabold text-[#e93482]">
              ৳{Number(course.price).toLocaleString("en-BD")}
            </span>
            {discountPct > 0 && (
              <span className="text-sm text-muted-foreground line-through">
                ৳{Number(course.original_price).toLocaleString("en-BD")}
              </span>
            )}
          </div>
        </div>
        <Button
          asChild
          className="bg-gradient-to-br from-[#e52b80] to-[#f05463] font-bold"
        >
          <Link to={`/courses/${courseId}/buy`}>ভর্তি হন</Link>
        </Button>
      </div>
    </div>
  );
};

export default CourseDetails;
