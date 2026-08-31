import { MessageCircle, Phone } from "lucide-react";

export const HelpCtaSection = () => {
  return (
    <section className="w-full bg-white dark:bg-slate-950 px-4 py-11">
      <div className="mx-auto w-full max-w-[1050px]">
        <div className="relative isolate flex flex-col sm:flex-row items-center gap-5 overflow-hidden rounded-[22px] border border-[#f0dce5] dark:border-white/10 bg-gradient-to-br from-white to-[#fff8fb] dark:from-slate-900 dark:to-slate-900 px-5 py-6 sm:px-6 shadow-[0_12px_35px_rgba(32,34,45,0.08)]">
          {/* Top gradient bar */}
          <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#ed3d78] via-[#656cff] to-[#ed3d78] bg-[length:200%_100%] animate-[ph-help-gradient_4s_linear_infinite]" />
          {/* Decorative blob */}
          <div className="pointer-events-none absolute -bottom-[105px] -right-[85px] h-[170px] w-[170px] -z-[1] rounded-full bg-[rgba(237,61,120,0.08)]" />

          <div className="flex h-[58px] w-[58px] flex-shrink-0 items-center justify-center rounded-2xl border border-[#eadce5] bg-gradient-to-br from-[#fff0f5] to-[#f0f2ff] text-[#ed3d78] shadow-[0_7px_18px_rgba(237,61,120,0.10)]">
            <MessageCircle className="h-7 w-7" strokeWidth={2} />
          </div>

          <div className="min-w-0 flex-1 text-center sm:text-left">
            <h3 className="m-0 mb-1 text-lg font-black tracking-tight text-[#202228] dark:text-white sm:text-xl">
              সাহায্যের প্রয়োজন? <span className="text-[#ed3d78]">আমরা পাশে আছি</span>
            </h3>
            <p className="m-0 text-[13px] font-medium leading-relaxed text-[#777b84] dark:text-slate-400">
              কোর্স সম্পর্কিত যেকোনো সমস্যা বা তথ্যের জন্য আমাদের সাথে যোগাযোগ করো।
            </p>
          </div>

          <div className="flex flex-shrink-0 flex-wrap items-center justify-center gap-2.5">
            <a
              href="https://www.facebook.com/share/1EX8RkwBoP/"
              target="_blank"
              rel="noopener noreferrer"
              className="group relative flex min-h-[48px] items-center gap-2.5 overflow-hidden whitespace-nowrap rounded-xl bg-gradient-to-br from-[#4267D9] to-[#5B73EF] px-4 text-white shadow-[0_8px_20px_rgba(66,103,217,0.22)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_25px_rgba(66,103,217,0.3)]"
            >
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] flex-shrink-0 fill-none stroke-current" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
              </svg>
              <div className="flex flex-col leading-tight">
                <span className="text-[13px] font-bold">Facebook মেসেজ</span>
                <span className="text-[11px] text-white/80">যেকোনো সময় (২৪/৭)</span>
              </div>
            </a>

            <a
              href="https://wa.me/8801639787547"
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[48px] items-center gap-2.5 whitespace-nowrap rounded-xl border border-[#dedfe5] bg-white dark:bg-slate-800 dark:border-white/10 px-4 text-[#27292f] dark:text-white shadow-[0_5px_15px_rgba(0,0,0,0.05)] transition-all hover:-translate-y-0.5 hover:border-[#ed3d78] hover:text-[#ed3d78] hover:shadow-[0_10px_22px_rgba(237,61,120,0.12)]"
            >
              <Phone className="h-[18px] w-[18px] flex-shrink-0" strokeWidth={2} />
              <div className="flex flex-col leading-tight">
                <span className="text-[13px] font-black tracking-wide">01639787547</span>
                <span className="text-[11px] text-[#777b84] group-hover:text-[#ed3d78]">হোয়াটসঅ্যাপ</span>
              </div>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};
