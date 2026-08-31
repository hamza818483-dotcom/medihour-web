import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Users, CheckCircle2 } from "lucide-react";

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
