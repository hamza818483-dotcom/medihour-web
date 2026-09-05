import { useEffect } from "react";
import { LiveCountdown } from "@/components/shared/LiveCountdown";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import useEmblaCarousel from "embla-carousel-react";
import Autoplay from "embla-carousel-autoplay";
import {
  ArrowRight,
  Star,
  Check,
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
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

  const { data: specialExams } = useQuery({
    queryKey: ["public-special-exams"],
    queryFn: async () => {
      // @ts-ignore
      const { data, error } = await supabase
        .from("special_exam_cards")
        .select("*")
        .eq("is_active", true)
        .order("display_order", { ascending: true })
        .limit(20);
      if (error) {
        if (error.code === '42P01') return [];
        throw error;
      };
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
    <div className="min-h-screen bg-background text-foreground flex flex-col">
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

        {/* Special Exams Section */}
        {specialExams && specialExams.length > 0 && (
            <div className="animate-border-chase rounded-2xl border p-2.5 sm:p-3" style={{ ["--border-chase-color" as any]: "hsl(var(--primary))" }}>
            <section id="special-exams" className="space-y-3">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-bold tracking-tight">বিশেষ ঘোষণা</h2>
                        <p className="text-sm text-muted-foreground mt-1">গুরুত্বপূর্ণ আপডেট এবং বিশেষ ঘোষণা সমূহ।</p>
                    </div>
                    <span className="hidden sm:flex items-center gap-1.5 text-xs font-semibold bg-primary/10 text-primary px-3 py-1.5 rounded-full">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                        লাইভ আপডেট
                    </span>
                </div>
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    {(specialExams as any[]).map((exam: any) => {
                      const isAnnouncement = exam.card_type === 'announcement';

                      if (isAnnouncement) {
                        return (
                          <div key={exam.id} className="animate-border-chase relative flex flex-col overflow-hidden rounded-2xl border bg-gradient-to-br from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/20 shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 group" style={{ ["--border-chase-color" as any]: "hsl(271 81% 60%)" }}>
                            {/* Accent gradient top bar */}
                            <div className="h-1.5 w-full bg-gradient-to-r from-violet-500 via-indigo-500 to-blue-500" />
                            {exam.image_url && (
                              <div className="h-48 w-full overflow-hidden">
                                <img src={exam.image_url} alt={exam.title} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" />
                              </div>
                            )}
                            <div className="flex flex-grow flex-col gap-3 p-5">
                              {/* Card badge */}
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-bold uppercase tracking-wider bg-violet-500/10 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded-full border border-violet-500/20">📢 বিজ্ঞপ্তি</span>
                              </div>
                              <h3 className="text-lg font-bold leading-tight text-foreground">{exam.title}</h3>
                              {exam.details && (
                                <p className="text-sm text-muted-foreground leading-relaxed">{exam.details}</p>
                              )}
                              {exam.instructions && (
                                <div className="mt-auto rounded-xl bg-white/60 dark:bg-white/5 border border-violet-200/50 dark:border-violet-500/20 px-4 py-3 backdrop-blur-sm">
                                  <p className="text-xs text-violet-700 dark:text-violet-300 leading-snug font-medium">{exam.instructions}</p>
                                </div>
                              )}
                              {exam.action_link && (
                                <a
                                  href={exam.action_link}
                                  className="mt-2 inline-flex items-center justify-center gap-2 text-sm font-semibold bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-xl transition-colors"
                                >
                                  {exam.button_text || "বিস্তারিত দেখুন"} <ArrowRight className="h-3.5 w-3.5" />
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      }

                      // ── Exam Card ─────────────────────────────────────────────────
                      return (
                        <Card key={exam.id} className="animate-border-chase overflow-hidden flex flex-col hover:-translate-y-1.5 hover:shadow-xl transition-all duration-300 border-primary/10 hover:border-primary/30 group rounded-2xl" style={{ ["--border-chase-color" as any]: "hsl(var(--primary))" }}>
                            {exam.image_url && (
                                <div className="h-44 w-full overflow-hidden bg-muted">
                                    <img src={exam.image_url} alt={exam.title} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                </div>
                            )}
                            <div className="h-1.5 w-full bg-gradient-to-r from-primary/60 via-primary to-primary/60" />
                            <CardHeader className="pb-3">
                                <div className="flex items-start gap-2">
                                    <span className="text-xs font-bold uppercase tracking-wider bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20 mt-0.5">📋 বিশেষ পরীক্ষা</span>
                                </div>
                                <CardTitle className="text-xl font-bold mt-2">{exam.title}</CardTitle>
                            </CardHeader>
                            <CardContent className="flex flex-grow flex-col gap-2 pt-0">
                                {exam.details && (
                                    <div className="space-y-1.5">
                                        <div className="grid grid-cols-1 gap-y-1 text-xs text-muted-foreground">
                                            {exam.details.split(/[,|\n]+/).filter((d: string) => d.trim().length > 0).map((detail: string, i: number) => (
                                                <div key={i} className="flex items-start gap-2 bg-muted/40 rounded-lg px-3 py-1.5">
                                                    <Check className="h-3.5 w-3.5 text-green-500 mt-0.5 shrink-0" />
                                                    <span className="text-[11px] leading-tight">{detail.trim()}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                
                                {exam.instructions && (
                                    <div className="mt-2 text-sm bg-yellow-500/10 border border-yellow-500/20 p-3 rounded-xl flex items-start gap-3">
                                        <Lightbulb className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
                                        <p className="text-yellow-700 dark:text-yellow-500/90 text-xs leading-snug font-medium">
                                            {exam.instructions}
                                        </p>
                                    </div>
                                )}
                            </CardContent>
                            {exam.action_link && (
                                <CardFooter className="pt-2 pb-4">
                                    <Button asChild className="w-full text-sm h-10 rounded-xl" size="sm">
                                        <a href={exam.action_link}>
                                            {exam.button_text || "বিস্তারিত দেখুন"} <ArrowRight className="ml-2 h-4 w-4" />
                                        </a>
                                    </Button>
                                </CardFooter>
                            )}
                        </Card>
                      );
                    })}
                </div>
            </section>
            </div>
        )}


        {/* Quick Actions (All Courses / Free Class / Free Exam / Quick Practice / Focus Timer / Pomodoro) */}
        <div className="rounded-2xl border py-1 px-1 sm:p-3">
        <QuickActionsSection />
        </div>

        {/* Trust CTA (PhysicsHunters-style minimal trust banner) */}
        <TrustCtaSection />

        {/* Paid Courses Section (Grid View) */}
        <div className="rounded-2xl border p-2.5 sm:p-3">
        <CourseSection />
        </div>

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

      {/* About Section (PhysicsHunters-style spotlight card) */}
      <section className="w-full overflow-hidden bg-white dark:bg-slate-950 py-10 sm:py-14" id="about">
        <div className="mx-auto w-full max-w-[1180px] px-4">
          <h2 className="mb-8 text-center text-[26px] font-black leading-snug text-[#202124] dark:text-white sm:text-[32px]">
            <span className="bg-gradient-to-r from-[#ff7a18] to-[#2563eb] bg-clip-text text-transparent">আমাদের</span> সম্পর্কে
          </h2>

          <div className="relative grid grid-cols-1 items-center gap-8 overflow-hidden rounded-[32px] border border-[#eee8e8] dark:border-white/10 bg-gradient-to-br from-[#fff8f5] via-white to-[#f7f8ff] dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 p-6 shadow-[0_15px_50px_rgba(30,30,30,0.07)] sm:p-9 md:grid-cols-[0.9fr_1.1fr]">
            <div className="pointer-events-none absolute -left-40 -top-40 h-80 w-80 rounded-full bg-[rgba(255,125,60,0.08)] blur-[5px]" />
            <div className="pointer-events-none absolute -bottom-[150px] -right-[150px] h-[300px] w-[300px] rounded-full bg-[rgba(91,101,255,0.07)]" />

            {/* Founder Image */}
            <div className="relative z-[2] flex items-center justify-center">
              <div className="relative flex min-h-[300px] w-full max-w-[430px] items-end justify-center overflow-hidden rounded-[28px] border border-white/90 bg-gradient-to-br from-[#ffe8dc] via-[#fff7f1] to-[#e9edff] shadow-[0_20px_45px_rgba(40,40,40,0.12)] sm:min-h-[410px]">
                <div className="absolute left-1/2 top-6 h-64 w-64 -translate-x-1/2 rounded-full bg-gradient-to-br from-[rgba(255,119,55,0.22)] to-[rgba(255,45,130,0.1)]" />
                <div className="absolute left-4 top-4 z-[7] flex items-center gap-1.5 rounded-full border border-white/95 bg-white/90 px-3 py-2 text-[10px] font-extrabold text-[#333] shadow-[0_7px_20px_rgba(0,0,0,0.08)] backdrop-blur-md">
                  <span className="h-[7px] w-[7px] flex-shrink-0 rounded-full bg-[#ff397d] shadow-[0_0_0_4px_rgba(255,57,125,0.12)]" />
                  MediHour
                </div>
                {mentors && mentors.length > 0 && mentors[0].image_url ? (
                  <img src={mentors[0].image_url} alt={mentors[0].name} className="relative z-[2] max-h-[380px] w-auto max-w-full object-contain transition-transform duration-500 hover:-translate-y-1.5 hover:scale-[1.02]" />
                ) : (
                  <User className="relative z-[2] h-40 w-40 text-muted-foreground" />
                )}
              </div>
            </div>

            {/* About Content */}
            <div className="relative z-[3]">
              <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-[rgba(255,84,126,0.12)] bg-[rgba(255,84,126,0.08)] px-3 py-1.5 text-[11px] font-extrabold text-[#e92d6d]">
                🎯 স্বপ্ন ছোঁয়ার প্রস্তুতি
              </div>
              <h3 className="mb-3.5 text-[22px] font-black leading-snug text-[#1f2328] dark:text-white sm:text-[30px]">
                স্বপ্ন ছোঁয়ার আশা থাকলে সেই স্বপ্নের ভিত তৈরিতে সাথে আছে{" "}
                <span className="bg-gradient-to-r from-[#ff6b35] to-[#2563eb] bg-clip-text text-transparent">"MediHour"</span>
              </h3>
              <p className="mb-5 max-w-[650px] text-sm font-medium leading-[1.85] text-[#626870] dark:text-slate-300">
                মেডিকেল ও ভার্সিটি ভর্তি পরীক্ষার প্রস্তুতির জন্য দেশের অন্যতম সেরা প্ল্যাটফর্ম <strong className="text-[#1f2328] dark:text-white">"MediHour"</strong>।
                ভর্তি প্রস্তুতি নেওয়া শিক্ষার্থীদের সঠিক দিকনির্দেশনা, নিয়মিত পরীক্ষা, মানসম্মত ক্লাস এবং ধারাবাহিক প্রস্তুতির মাধ্যমে নিজেদের লক্ষ্যে পৌঁছাতে আমরা কাজ করে যাচ্ছি।
              </p>

              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { label: "সফল শিক্ষার্থী", value: "৩৫০+" },
                  { label: "অভিজ্ঞ মেন্টর", value: `${mentors?.length || 0}+` },
                  { label: "সন্তুষ্টি হার", value: "৯৮%" },
                ].map((stat, i) => (
                  <div key={i} className="rounded-[17px] border border-[#eee] bg-white/75 dark:bg-slate-800/60 dark:border-white/10 p-3.5 text-center transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_25px_rgba(0,0,0,0.07)]">
                    <p className="m-0 text-xl font-black leading-none text-[#202124] dark:text-white">{stat.value}</p>
                    <p className="mt-1.5 text-[10px] font-semibold text-[#777] dark:text-slate-400">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Student Reviews */}
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <StudentReviews reviews={reviews as any} id="reviews" />

      {/* Contact Section (PhysicsHunters-style) */}
      <ContactSection />

      {/* Success Gallery (PhysicsHunters-style scrolling photo marquee) */}
      <SuccessGallerySection />

      {/* Help / Support CTA (PhysicsHunters-style) */}
      <HelpCtaSection />

      {/* Founder & Teacher Panel (Footer Top) */}
      <section className="bg-card border-t py-12 px-4 mt-auto">
          <div className="mx-auto max-w-6xl space-y-8">
               <div className="text-center space-y-2">
                    <h2 className="text-2xl font-bold">আমাদের মেন্টরবৃন্দ</h2>
                    <p className="text-muted-foreground">আপনার সফলতার কারিগর।</p>
               </div>

               <div className="grid gap-8 sm:grid-cols-2 md:grid-cols-4 justify-center">
                   {mentors && mentors.length > 0 ? (
                       mentors.map((mentor: any) => (
                           <div key={mentor.id} className="flex flex-col items-center text-center space-y-3">
                               <div className="h-40 w-40 rounded-full overflow-hidden border-2 border-primary shadow-lg hover:shadow-xl transition-shadow">
                                   {mentor.image_url ? (
                                       <img src={mentor.image_url} alt={mentor.name} className="h-full w-full object-cover" />
                                   ) : (
                                       <div className="h-full w-full bg-secondary flex items-center justify-center">
                                           <User className="h-16 w-16 text-muted-foreground" />
                                       </div>
                                   )}
                               </div>
                               <div>
                                   <h3 className="font-semibold">{mentor.name}</h3>
                                   <p className="text-xs text-primary font-medium uppercase tracking-wide">{mentor.role}</p>
                                   <p className="text-sm text-muted-foreground mt-1 max-w-[200px]">{mentor.description}</p>
                               </div>
                           </div>
                       ))
                   ) : (
                       <p className="text-center col-span-full text-muted-foreground">খুব শীঘ্রই মেন্টর যুক্ত করা হবে।</p>
                   )}
               </div>
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
