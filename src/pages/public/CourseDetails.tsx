import { useQuery } from "@tanstack/react-query";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Users, CheckCircle2, Star, Gift, PlayCircle, ExternalLink, Sparkles } from "lucide-react";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import { getEmbedUrl } from "@/lib/videoUtils";
import { DemoContentItem } from "@/types/admin";

const CourseDetails = () => {
  const { courseId } = useParams<{ courseId: string }>();

  const { data: course, isLoading, isError } = useQuery({
    queryKey: ["public-course-details", courseId],
    queryFn: async () => {
      if (!courseId) return null;
      const { data, error } = await supabase
        .from("courses")
        .select(
          "id, name, full_description, short_description, short_description_lines, full_description_blocks, extra_links, price, original_price, image_url, video_url, what_you_get, demo_content, linked_course_ids, is_active, is_public"
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

  // Fetch bonus (linked) courses shown above mentor list
  const linkedIds: string[] = Array.isArray((course as any)?.linked_course_ids)
    ? (course as any).linked_course_ids
    : [];

  const { data: bonusCourses } = useQuery({
    queryKey: ["public-course-bonus", linkedIds],
    queryFn: async () => {
      if (!linkedIds.length) return [];
      const { data, error } = await supabase
        .from("courses")
        .select("id, name, image_url, slug")
        .in("id", linkedIds);
      if (error) return [];
      return data || [];
    },
    enabled: linkedIds.length > 0,
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
      <style>{`
        @keyframes check-pop {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.35); opacity: 0.7; }
        }
      `}</style>
      <Link
        to="/"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> ফিরে যান
      </Link>

      {/* Auto-playing demo video takes priority over the static image */}
      {(() => {
        const demoItems: DemoContentItem[] = Array.isArray((course as any).demo_content)
          ? ((course as any).demo_content as DemoContentItem[])
          : [];
        const firstVideo = demoItems.find((d) => d.video_url)?.video_url || course.video_url;
        if (firstVideo) {
          const embed = getEmbedUrl(firstVideo);
          if (embed) {
            return (
              <div className="mb-5 aspect-video w-full overflow-hidden rounded-2xl border">
                <iframe
                  src={`${embed}&autoplay=1&mute=1`}
                  title={course.name}
                  className="h-full w-full"
                  allow="autoplay; encrypted-media; picture-in-picture"
                  allowFullScreen
                />
              </div>
            );
          }
        }
        return course.image_url ? (
          <div className="mb-5 overflow-hidden rounded-2xl border">
            <img src={course.image_url} alt={course.name} className="w-full object-cover" />
          </div>
        ) : null;
      })()}

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

      {/* Short description: animated checklist */}
      {Array.isArray((course as any).short_description_lines) &&
        (course as any).short_description_lines.length > 0 && (
          <div className="mb-5 space-y-1.5">
            {((course as any).short_description_lines as { text: string; bold?: boolean }[]).map(
              (line, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg border bg-card p-2">
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0 text-green-500"
                    style={{ animation: `check-pop 1.6s ease-in-out ${i * 0.15}s infinite` }}
                  />
                  <span className={`text-sm ${line.bold ? "font-bold" : ""}`}>{line.text}</span>
                </div>
              )
            )}
          </div>
        )}

      {/* Full description: centered special heading box + detail below it */}
      {Array.isArray((course as any).full_description_blocks) &&
        (course as any).full_description_blocks.length > 0 && (
          <div className="mb-6 space-y-6">
            {((course as any).full_description_blocks as { heading: string; body: string }[]).map(
              (block, i) => (
                <div key={i}>
                  {block.heading && (
                    <div className="mx-auto mb-3 max-w-[90%] rounded-xl border bg-secondary/60 px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5 font-bold">
                        <Sparkles className="h-4 w-4 shrink-0 text-amber-500 animate-pulse" />
                        <span>{block.heading}</span>
                      </div>
                    </div>
                  )}
                  {block.body && (
                    <div
                      className="text-sm leading-relaxed text-muted-foreground"
                      dangerouslySetInnerHTML={{ __html: block.body }}
                    />
                  )}
                </div>
              )
            )}
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

      {/* Bonus courses, shown above mentor list */}
      {bonusCourses && bonusCourses.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 flex items-center gap-1.5 text-lg font-bold">
            <Gift className="h-5 w-5 text-purple-600" /> সাথে পাচ্ছেন বোনাস কোর্স
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {bonusCourses.map((bc: any) => (
              <Link
                key={bc.id}
                to={`/courses/${bc.slug || bc.id}`}
                className="flex flex-col overflow-hidden rounded-xl border bg-card transition hover:border-purple-400 hover:shadow-md"
              >
                <div className="aspect-video w-full overflow-hidden bg-purple-50">
                  {bc.image_url ? (
                    <img src={bc.image_url} alt={bc.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Gift className="h-6 w-6 text-purple-300" />
                    </div>
                  )}
                </div>
                <p className="line-clamp-2 p-2 text-xs font-semibold">{bc.name}</p>
              </Link>
            ))}
          </div>
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

      {/* Demo content list */}
      {Array.isArray((course as any).demo_content) && (course as any).demo_content.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-lg font-bold">ডেমো কনটেন্ট</h2>
          <div className="space-y-2">
            {((course as any).demo_content as DemoContentItem[]).map((d, i) => (
              <div key={i} className="flex items-center gap-2 rounded-xl border p-3">
                <PlayCircle className="h-4 w-4 shrink-0 text-primary" />
                <span className="truncate text-sm font-medium">{d.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* "এই কোর্স সম্পর্কে আরো" — admin-added Extra Links as premium full-width cards */}
      {Array.isArray((course as any).extra_links) &&
        (course as any).extra_links.length > 0 && (
          <div className="mb-6">
            <h2 className="mb-3 text-lg font-bold">এই কোর্স সম্পর্কে আরো:</h2>
            <div className="flex flex-col gap-3">
              {((course as any).extra_links as { label: string; url: string }[]).map((l, i) => (
                <a
                  key={i}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex w-full items-center gap-4 rounded-2xl border bg-gradient-to-br from-card to-secondary/40 p-4 shadow-sm transition hover:shadow-md hover:border-primary/40"
                >
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <PlayCircle className="h-6 w-6" />
                  </div>
                  <span className="flex-1 text-sm font-semibold leading-relaxed">{l.label}</span>
                  <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:text-primary" />
                </a>
              ))}
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
