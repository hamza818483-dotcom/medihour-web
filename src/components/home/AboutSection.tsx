import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { User } from "lucide-react";

const ABOUT_KEY = "about_us_section";

interface AboutStat {
  label: string;
  value: string;
}

interface AboutData {
  badge?: string;
  heading_prefix?: string;
  heading_highlight?: string;
  paragraph?: string;
  image_url?: string;
  stats?: AboutStat[];
}

const DEFAULT_ABOUT: AboutData = {
  badge: "🎯 স্বপ্ন ছোঁয়ার প্রস্তুতি",
  heading_prefix: 'স্বপ্ন ছোঁয়ার আশা থাকলে সেই স্বপ্নের ভিত তৈরিতে সাথে আছে',
  heading_highlight: '"MediHour"',
  paragraph:
    'মেডিকেল ও ভার্সিটি ভর্তি পরীক্ষার প্রস্তুতির জন্য দেশের অন্যতম সেরা প্ল্যাটফর্ম "MediHour"। ভর্তি প্রস্তুতি নেওয়া শিক্ষার্থীদের সঠিক দিকনির্দেশনা, নিয়মিত পরীক্ষা, মানসম্মত ক্লাস এবং ধারাবাহিক প্রস্তুতির মাধ্যমে নিজেদের লক্ষ্যে পৌঁছাতে আমরা কাজ করে যাচ্ছি।',
  image_url: "",
  stats: [
    { label: "সফল শিক্ষার্থী", value: "৩৫০+" },
    { label: "অভিজ্ঞ মেন্টর", value: "১০+" },
    { label: "সন্তুষ্টি হার", value: "৯৮%" },
  ],
};

export const AboutSection = () => {
  const { data } = useQuery({
    queryKey: ["about-us-section"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", ABOUT_KEY).maybeSingle();
      return (data?.value as AboutData | null) || null;
    },
    staleTime: 5 * 60 * 1000,
  });

  const about = { ...DEFAULT_ABOUT, ...(data || {}) };
  const stats = about.stats && about.stats.length > 0 ? about.stats : DEFAULT_ABOUT.stats!;

  return (
    <section className="w-full overflow-hidden bg-white dark:bg-slate-950 py-10 sm:py-14" id="about">
      <div className="mx-auto w-full max-w-[1180px] px-4">
        <h2 className="mb-8 text-center text-[26px] font-black leading-snug text-[#202124] dark:text-white sm:text-[32px]">
          <span className="bg-gradient-to-r from-[#ff7a18] to-[#2563eb] bg-clip-text text-transparent">আমাদের</span> সম্পর্কে
        </h2>

        <div className="relative grid grid-cols-1 items-center gap-8 overflow-hidden rounded-[32px] border border-[#eee8e8] dark:border-white/10 bg-gradient-to-br from-[#fff8f5] via-white to-[#f7f8ff] dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 p-6 shadow-[0_15px_50px_rgba(30,30,30,0.07)] sm:p-9 md:grid-cols-[0.9fr_1.1fr]">
          <div className="pointer-events-none absolute -left-40 -top-40 h-80 w-80 rounded-full bg-[rgba(255,125,60,0.08)] blur-[5px]" />
          <div className="pointer-events-none absolute -bottom-[150px] -right-[150px] h-[300px] w-[300px] rounded-full bg-[rgba(91,101,255,0.07)]" />

          {/* About Image */}
          <div className="relative z-[2] flex items-center justify-center">
            <div className="relative flex min-h-[300px] w-full max-w-[430px] items-end justify-center overflow-hidden rounded-[28px] border border-white/90 bg-gradient-to-br from-[#ffe8dc] via-[#fff7f1] to-[#e9edff] shadow-[0_20px_45px_rgba(40,40,40,0.12)] sm:min-h-[410px]">
              <div className="absolute left-1/2 top-6 h-64 w-64 -translate-x-1/2 rounded-full bg-gradient-to-br from-[rgba(255,119,55,0.22)] to-[rgba(255,45,130,0.1)]" />
              <div className="absolute left-4 top-4 z-[7] flex items-center gap-1.5 rounded-full border border-white/95 bg-white/90 px-3 py-2 text-[10px] font-extrabold text-[#333] shadow-[0_7px_20px_rgba(0,0,0,0.08)] backdrop-blur-md">
                <span className="h-[7px] w-[7px] flex-shrink-0 rounded-full bg-[#ff397d] shadow-[0_0_0_4px_rgba(255,57,125,0.12)]" />
                MediHour
              </div>
              {about.image_url ? (
                <img src={about.image_url} alt="MediHour" className="relative z-[2] max-h-[380px] w-auto max-w-full object-contain transition-transform duration-500 hover:-translate-y-1.5 hover:scale-[1.02]" />
              ) : (
                <User className="relative z-[2] h-40 w-40 text-muted-foreground" />
              )}
            </div>
          </div>

          {/* About Content */}
          <div className="relative z-[3]">
            {about.badge && (
              <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-[rgba(255,84,126,0.12)] bg-[rgba(255,84,126,0.08)] px-3 py-1.5 text-[11px] font-extrabold text-[#e92d6d]">
                {about.badge}
              </div>
            )}
            <h3 className="mb-3.5 text-[22px] font-black leading-snug text-[#1f2328] dark:text-white sm:text-[30px]">
              {about.heading_prefix}{" "}
              <span className="bg-gradient-to-r from-[#ff6b35] to-[#2563eb] bg-clip-text text-transparent">{about.heading_highlight}</span>
            </h3>
            <p className="mb-5 max-w-[650px] text-sm font-medium leading-[1.85] text-[#626870] dark:text-slate-300 whitespace-pre-line">
              {about.paragraph}
            </p>

            <div className="grid grid-cols-3 gap-2.5">
              {stats.map((stat, i) => (
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
  );
};
