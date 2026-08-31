import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Facebook, Users, Send, Youtube, Mail } from "lucide-react";

export const ContactSection = () => {
  const { data: links } = useQuery({
    queryKey: ["official-links-public"],
    queryFn: async () => {
      const { data } = await supabase.from("official_links").select("*").eq("id", 1).maybeSingle();
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const email = links?.email || "medihourofficial@gmail.com";
  const facebookPage = links?.facebook_page || "https://www.facebook.com/share/1EX8RkwBoP/";
  const facebookGroup = links?.facebook_group || "https://www.facebook.com/share/g/1CsYjAfZxw/";
  const telegram = links?.telegram || "https://t.me/MediHour";
  const youtube = links?.youtube || "https://youtube.com/@medihour.official?si=Q-vU8sHvBB0cka-C";

  const contactLinks = [
    {
      href: facebookPage,
      icon: Facebook,
      name: "Medihour - মেডিহাওয়ার পেজে মেসেজ করো",
      sub: "আমাদের Facebook Page-এ যোগাযোগ করো",
      primary: true,
      iconBg: "bg-[#e8edff] dark:bg-blue-500/10 border-[#d5ddff] dark:border-blue-500/20",
      iconColor: "text-[#4267d9] dark:text-blue-400",
    },
    {
      href: facebookGroup,
      icon: Users,
      name: "Medihour Group এ যুক্ত হও",
      sub: "কমিউনিটির সাথে যুক্ত থাকো",
      iconBg: "bg-[#f0efff] dark:bg-indigo-500/10 border-[#dedcff] dark:border-indigo-500/20",
      iconColor: "text-[#656cff] dark:text-indigo-400",
    },
    {
      href: `mailto:${email}`,
      icon: Mail,
      name: "ইমেইল করো",
      sub: email,
      iconBg: "bg-[#fff0f2] dark:bg-rose-500/10 border-[#ffd8de] dark:border-rose-500/20",
      iconColor: "text-[#ef334f] dark:text-rose-400",
    },
    {
      href: telegram,
      icon: Send,
      name: "Telegram চ্যানেলে জয়েন করো",
      sub: "সর্বশেষ আপডেট পেতে",
      iconBg: "bg-[#eaf8ff] dark:bg-sky-500/10 border-[#d5f0ff] dark:border-sky-500/20",
      iconColor: "text-[#229ed9] dark:text-sky-400",
    },
    {
      href: youtube,
      icon: Youtube,
      name: "YouTube চ্যানেল সাবস্ক্রাইব করো",
      sub: "ফ্রি ক্লাস ও ভিডিও দেখো",
      iconBg: "bg-[#fff0f6] dark:bg-pink-500/10 border-[#ffd9e8] dark:border-pink-500/20",
      iconColor: "text-[#ed3d78] dark:text-pink-400",
    },
  ];

  return (
    <section className="relative w-full overflow-hidden py-14 bg-gradient-to-b from-white via-[#f8f8ff] to-white dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Decorative glows */}
      <div className="pointer-events-none absolute -left-44 -top-64 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(101,108,255,0.1),transparent_70%)]" />
      <div className="pointer-events-none absolute -bottom-60 -right-52 h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,rgba(237,61,120,0.08),transparent_70%)]" />

      <div className="relative z-[2] mx-auto w-full max-w-[1120px] px-5">
        <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-[0.85fr_1.15fr] md:gap-[75px]">
          {/* Left */}
          <div className="flex flex-col justify-center">
            <span className="mb-4 inline-flex items-center gap-2 text-xs font-bold text-[#777b86] dark:text-slate-400">
              <span className="h-[7px] w-[7px] flex-shrink-0 rounded-full bg-gradient-to-br from-[#656cff] to-[#ed3d78] shadow-[0_0_0_4px_rgba(101,108,255,0.08)]" />
              যোগাযোগ
            </span>
            <h2 className="m-0 text-[clamp(28px,4vw,48px)] font-black leading-[1.1] tracking-[-1.2px] text-[#17191d] dark:text-white">
              আমাদের সাথে
              <br />
              <span className="bg-gradient-to-r from-[#656cff] to-[#ed3d78] bg-clip-text text-transparent">
                যোগাযোগ করো
              </span>
            </h2>
            <p className="mt-4 max-w-[410px] text-[13px] font-medium leading-[1.8] text-[#777b85] dark:text-slate-400">
              Medihour-এর সাথে যুক্ত থাকো, নতুন ক্লাস, আপডেট ও প্রয়োজনীয় তথ্য সবার আগে পেতে।
            </p>
          </div>

          {/* Right */}
          <div className="flex flex-col gap-2.5">
            {contactLinks.map((link) => (
              <a
                key={link.name}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`group relative flex min-h-[72px] w-full items-center justify-between gap-4 rounded-[17px] border px-4 py-3 shadow-[0_5px_18px_rgba(40,45,90,0.043)] transition-all duration-250 hover:translate-x-1 hover:shadow-[0_12px_28px_rgba(50,55,110,0.1)] ${
                  link.primary
                    ? "border-[#dfe1ff] dark:border-white/10 bg-gradient-to-[105deg] from-[#f0f1ff] to-[#fff0f6] dark:from-slate-800 dark:to-slate-800 hover:border-[#c8caFc]"
                    : "border-[#e6e6ed] dark:border-white/10 bg-white/90 dark:bg-slate-800/60 hover:border-[#cfd1f7] hover:bg-white dark:hover:bg-slate-800"
                }`}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className={`flex h-[43px] w-[43px] flex-shrink-0 items-center justify-center rounded-xl border transition-transform duration-250 group-hover:scale-[1.08] ${link.iconBg} ${link.iconColor}`}
                  >
                    <link.icon size={18} />
                  </div>
                  <div className="min-w-0">
                    <p className="m-0 truncate text-sm font-extrabold text-[#25272e] dark:text-white">{link.name}</p>
                    <p className="m-0 mt-0.5 truncate text-[10px] font-medium text-[#92959d] dark:text-slate-400">{link.sub}</p>
                  </div>
                </div>
                <span className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full bg-black/[0.03] text-sm text-[#777] transition-transform duration-250 group-hover:translate-x-0.5 dark:bg-white/5 dark:text-slate-300">
                  →
                </span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
