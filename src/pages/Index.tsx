import { useEffect } from "react";
import { LiveCountdown } from "@/components/shared/LiveCountdown";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import {
  Star,
  Monitor,
  Users,
  BookOpen,
  Lightbulb,
  FileText,
  MessageCircle,
  Smartphone,
  BarChart,
  User,
  Send,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import PublicHeader from "@/components/PublicHeader";
import { supabase } from "@/integrations/supabase/client";
import { StudentReviews } from "@/components/StudentReviews";
import { CourseSection } from "@/components/home/CourseSection";
import { QuickActionsSection } from "@/components/home/QuickActionsSection";
import { TrustCtaSection } from "@/components/home/TrustCtaSection";
import { HelpCtaSection } from "@/components/home/HelpCtaSection";
import HeroCarouselItem from "@/components/home/HeroCarouselItem";
import Footer from "@/components/Footer";
import { ContactSection } from "@/components/home/ContactSection";
import { SuccessGallerySection } from "@/components/home/SuccessGallerySection";

const FEATURES = [
    { icon: Monitor, title: "অনলাইন প্রোগ্রাম", desc: "ঘরে বসেই সেরা প্রস্তুতি।" },
    { icon: Users, title: "অভিজ্ঞ শিক্ষকবৃন্দ", desc: "সেরা মেন্টরদের সান্নিধ্যে।" },
    { icon: BookOpen, title: "স্টাডি ম্যাটেরিয়ালস", desc: "মানসম্মত নোট এবং রিসোর্স।" },
    { icon: Lightbulb, title: "কনসেপ্ট ভিত্তিক ক্লাস", desc: "বেসিক হোক শক্তিশালী।" },
    { icon: FileText, title: "ইউনিক এক্সাম সিস্টেম", desc: "নিজেকে যাচাইয়ের সেরা মাধ্যম।" },
    { icon: MessageCircle, title: "Q&A সাপোর্ট", desc: "তাৎক্ষণিক সমস্যার সমাধান।" },
    { icon: Smartphone, title: "সঠিক গাইডলাইন", desc: "সাফল্যের পথে এগিয়ে চলুন।" },
    { icon: BarChart, title: "এক্সাম লিডারবোর্ড", desc: "অন্যদের সাথে নিজের অবস্থান যাচাই।" },
];

const Index = () => {
  const navigate = useNavigate();
  useEffect(() => {
    document.title = "MediHour - Best Coaching & Exam Platform";
  }, []);

  const { data: mentors } = useQuery({
    queryKey: ["public-mentors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mentors")
        .select("*")
        .order("display_order", { ascending: true })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    staleTime: 10 * 60 * 1000,
  });

  const { data: heroes } = useQuery({
    queryKey: ["public-heroes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("heroes")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .limit(20);
      if (error) throw error;
      return data || [];
    },
    staleTime: 10 * 60 * 1000,
  });


  const { data: landingExams } = useQuery({
    queryKey: ["public-landing-exams"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exams")
        .select("id, title, free_exam_category, time_window_end")
        .eq("is_published", true)
        .eq("is_visible_on_free", true)
        // @ts-ignore
        .eq("show_on_landing", true)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) {
        if (error.code === '42P01' || error.code === '42703') return [];
        throw error;
      }
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const formatDate = (dateStr: string | null | undefined, options?: Intl.DateTimeFormatOptions) => {
    if (!dateStr) return "";
    try {
      return new Date(dateStr).toLocaleString("en-US", { timeZone: "Asia/Dhaka", ...options });
    } catch {
      return "";
    }
  };

  const { data: reviewsTagline } = useQuery({
    queryKey: ["reviews-tagline"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", "reviews_tagline").maybeSingle();
      return (data?.value as { text?: string } | null)?.text || "MediHour-এর হাত ধরে সাফল্যের পথে এগিয়ে চলেছে";
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: reviews } = useQuery({
    queryKey: ["public-reviews"],
    queryFn: async () => {
      // Assuming reviews table is created, or using dummy data if not yet active
      // For now, I'll return hardcoded reviews if table fetch fails/is empty
       const { data, error } = await supabase
        .from("reviews")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(3);

       if (error || !data || data.length === 0) {
           return [
               { id: 1, student_name: "Sadiq", college_name: "Dhaka College", review_text: "এইচএসসি প্রস্তুতির জন্য সেরা প্ল্যাটফর্ম!", rating: 5, gender: "male", image_url: "https://pub-48488a27fc9244d9b86fec8da3eb89f4.r2.dev/d63297ba-5e53-45ba-a2a1-7ab15d3c5ade.webp", post_image_url: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&auto=format&fit=crop" }
           ];
       }
       return data;
    },
    staleTime: 10 * 60 * 1000,
  });

  const displayHeroes = heroes && heroes.length > 0 ? heroes : [];
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true }, [Autoplay({ delay: 5000 })]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#eef0fd] via-[#f3eefb] to-[#faf3f8] text-foreground flex flex-col dark:from-background dark:via-background dark:to-background">
      <PublicHeader />

      {/* Hero Section (Full Width, LMS-style) */}
      {displayHeroes.length > 0 && (
        <div className="overflow-hidden w-full relative hero-glow" ref={emblaRef}>
          <div className="flex">
            {displayHeroes.map((hero: any, index: number) => (
              <HeroCarouselItem key={hero.id || index} hero={hero} />
            ))}
          </div>
        </div>
      )}


      <main className={`mx-auto flex max-w-6xl flex-col gap-6 px-2 sm:px-4 pb-10 flex-1 pt-6 sm:pt-8 ${displayHeroes.length === 0 ? "mt-3 sm:mt-4" : ""}`}>

        {/* Landing Exams (Free Exam category exams with "Allow Dashboard" toggle on) */}
        {landingExams && landingExams.length > 0 && (
            <section className="space-y-3">
                <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                    <h2 className="text-lg font-semibold tracking-tight">Live Now</h2>
                </div>
                <div className="flex flex-col gap-4 max-w-xl mx-auto w-full">
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {(landingExams as any[]).map((exam: any) => (
                        <Card key={exam.id} className="relative border transition-all border-emerald-600 shadow-[0_0_15px_rgba(5,150,105,0.5)] dark:shadow-[0_0_20px_rgba(5,150,105,0.3)] bg-emerald-50/50 dark:bg-emerald-900/20 overflow-hidden">
                            <CardHeader className="space-y-2 px-4 pt-4 pb-2">
                                <div className="flex items-start justify-between gap-2">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-[10px] font-mono uppercase text-emerald-800 dark:text-emerald-200 break-words">
                                        {exam?.free_exam_category || "Free Exam"}
                                    </span>
                                    <span className="animate-pulse shrink-0 inline-flex items-center whitespace-nowrap px-2.5 py-1 rounded text-xs font-bold bg-red-100 text-red-700 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800">
                                        LIVE EXAM
                                    </span>
                                </div>
                                <CardTitle
                                    className="font-extrabold text-center whitespace-nowrap overflow-hidden leading-tight"
                                    style={{ fontSize: `${Math.max(1.3, Math.min(2.5, 22 / Math.max((exam?.title || "Live Exam").length, 6)))}rem` }}
                                >
                                    {exam?.title || "Live Exam"}
                                </CardTitle>
                                {exam?.time_window_end && (
                                    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                                        <span>এক্সাম শেষ: {formatDate(exam.time_window_end, { hour: '2-digit', minute: '2-digit' })}</span>
                                        <span className="text-muted-foreground/50">•</span>
                                        <span>সময় বাকি: <LiveCountdown endTime={exam.time_window_end} /></span>
                                    </div>
                                )}
                            </CardHeader>
                            <CardContent className="px-4 pb-2 pt-1">
                                <Button
                                    size="lg"
                                    onClick={() => navigate(`/take-exam/${exam.id}`)}
                                    className="w-full bg-emerald-700 hover:bg-emerald-800 text-white border-none font-bold h-12"
                                    style={{ fontSize: "1.4rem" }}
                                >
                                    Start Exam
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </section>
        )}

        {/* Quick Actions (All Courses / Free Class / Free Exam / Quick Practice / Focus Timer / Pomodoro) */}
        <div className="rounded-2xl border py-1 px-1 sm:p-3">
        <QuickActionsSection />
        </div>

        {/* Trust CTA (PhysicsHunters-style minimal trust banner) */}
        <TrustCtaSection />

        {/* Paid Courses Section (Grid View) */}
        <CourseSection />

        {/* Benefits Section (PhysicsHunters-style dark cards) */}
        <section className="overflow-hidden py-2">
            <div className="mx-auto w-full max-w-[1180px] px-1">
                <h2 className="relative mx-auto mb-6 table px-3.5 pb-2.5 text-center text-[22px] sm:text-[25px] font-black leading-tight tracking-tight text-[#202124] dark:text-white before:absolute before:-z-10 before:left-[3%] before:right-[3%] before:bottom-[3px] before:h-[10px] before:-skew-x-12 before:rounded-[20px] before:bg-gradient-to-r before:from-[rgba(255,178,56,0.2)] before:via-[rgba(255,105,55,0.2)] before:to-[rgba(221,38,117,0.2)] after:absolute after:left-[30%] after:right-[30%] after:bottom-0 after:h-[3px] after:rounded-full after:bg-gradient-to-r after:from-[#ffb238] after:via-[#ff6937] after:to-[#dd2675]">
                    আমাদের বিশেষত্ব
                </h2>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {FEATURES.map((feature, i) => (
                        <div
                            key={i}
                            className="group relative isolate overflow-hidden rounded-[22px] border border-white/[0.16] bg-[radial-gradient(130%_130%_at_0%_0%,_#383838_0%,_#1b1b1b_42%,_#0d0d0d_100%)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04),0_7px_22px_rgba(0,0,0,0.22)] transition-all duration-300 hover:-translate-y-1 hover:border-white/[0.28] hover:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07),0_15px_35px_rgba(0,0,0,0.32),0_0_28px_rgba(221,38,117,0.08)]"
                        >
                            <div className="relative z-[5] flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center">
                                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white transition-all duration-300 group-hover:scale-110 group-hover:bg-white/[0.12]">
                                    <feature.icon className="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 className="text-[13px] font-black leading-tight text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.65)] sm:text-[15px]">{feature.title}</h3>
                                    <p className="mt-1 max-w-[220px] text-[10px] font-medium leading-snug text-white/80 sm:text-xs">{feature.desc}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>

      </main>

      {/* Student Reviews */}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <StudentReviews reviews={reviews as any} id="reviews" tagline={reviewsTagline} />

      {/* Success Gallery (PhysicsHunters-style scrolling photo marquee) */}
      <SuccessGallerySection />

      {/* Contact Section (PhysicsHunters-style) */}
      <ContactSection />

      {/* Help / Support CTA (PhysicsHunters-style) */}
      <HelpCtaSection />

      {/* Owner Introduction (Footer Top) */}
      <section className="bg-card border-t py-12 px-4 mt-auto">
          <div className="mx-auto max-w-3xl space-y-8">
               <div className="text-center space-y-2">
                    <h2 className="text-2xl font-bold">Owner Introduction</h2>
               </div>

               {mentors && mentors.length > 0 ? (
                   <div className="flex flex-col items-center text-center space-y-4">
                       <div className="h-40 w-40 rounded-full overflow-hidden border-2 border-primary shadow-lg hover:shadow-xl transition-shadow">
                           {mentors[0].image_url ? (
                               <img src={mentors[0].image_url} alt={mentors[0].name} className="h-full w-full object-cover" />
                           ) : (
                               <div className="h-full w-full bg-secondary flex items-center justify-center">
                                   <User className="h-16 w-16 text-muted-foreground" />
                               </div>
                           )}
                       </div>
                       <div>
                           <h3 className="font-semibold text-lg">{mentors[0].name}</h3>
                           <p className="text-xs text-primary font-medium uppercase tracking-wide">{mentors[0].role}</p>
                           <p className="text-sm text-muted-foreground mt-2 max-w-md">{mentors[0].description}</p>
                       </div>
                   </div>
               ) : (
                   <p className="text-center text-muted-foreground">খুব শীঘ্রই যুক্ত করা হবে।</p>
               )}
          </div>
      </section>

      <Footer />

      {/* Floating Contact Buttons */}
      <div className="fixed bottom-6 right-5 z-50 flex flex-col gap-3">
        <a
          href="https://wa.me/8801639787547"
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center justify-center h-12 w-12 rounded-full bg-[#25D366] shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-300"
          title="WhatsApp"
        >
          <MessageCircle className="h-6 w-6 text-white" />
          <span className="absolute right-14 bg-[#25D366] text-white text-xs font-semibold px-2 py-1 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-md pointer-events-none">
            WhatsApp
          </span>
        </a>
        <a
          href="https://t.me/rafi_somc"
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center justify-center h-12 w-12 rounded-full bg-[#0088cc] shadow-lg hover:shadow-xl hover:scale-110 transition-all duration-300"
          title="Telegram"
        >
          <Send className="h-6 w-6 text-white" />
          <span className="absolute right-14 bg-[#0088cc] text-white text-xs font-semibold px-2 py-1 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200 shadow-md pointer-events-none">
            Telegram
          </span>
        </a>
      </div>
    </div>
  );
};

export default Index;
