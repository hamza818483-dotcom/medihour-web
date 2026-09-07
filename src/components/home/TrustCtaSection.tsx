import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const PROMO_VIDEO_KEY = "landing_promo_video";

function getYoutubeEmbedUrl(url: string): string | null {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m?.[1]) return `https://www.youtube.com/embed/${m[1]}?autoplay=1&mute=0&playsinline=1&rel=0`;
  }
  return null;
}

export const TrustCtaSection = () => {
  const { data } = useQuery({
    queryKey: ["landing-promo-video"],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", PROMO_VIDEO_KEY)
        .maybeSingle();
      return (data?.value as { title?: string; youtube_url?: string } | null) || null;
    },
    staleTime: 5 * 60 * 1000,
  });

  const embedUrl = data?.youtube_url ? getYoutubeEmbedUrl(data.youtube_url) : null;
  if (!embedUrl) return null;

  return (
    <section className="relative w-full overflow-hidden py-3 px-3 sm:px-4 lg:px-6 rounded-[24px] border border-[#e6eef8] dark:border-white/10 bg-white dark:bg-slate-900 shadow-[0_12px_35px_rgba(40,60,90,0.07)]">
      <div className="relative z-[2] mx-auto w-full max-w-[1500px]">
        {data?.title && (
          <h2 className="mb-4 text-center text-[clamp(20px,3vw,32px)] font-extrabold leading-[1.25] text-[#252525] dark:text-white">
            {data.title}
          </h2>
        )}
        <div className="relative w-full overflow-hidden rounded-[16px]" style={{ aspectRatio: "16/9" }}>
          <iframe
            src={embedUrl}
            title={data?.title || "Promo Video"}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    </section>
  );
};
