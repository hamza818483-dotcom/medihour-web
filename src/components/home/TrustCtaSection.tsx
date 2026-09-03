export const TrustCtaSection = () => {
  return (
    <section className="relative w-full overflow-hidden py-12 px-4 bg-gradient-to-br from-[#f7fbff] via-white to-[#fff8fc] dark:from-slate-900 dark:via-slate-950 dark:to-slate-900">
      <div className="relative z-[2] mx-auto w-full max-w-[1050px]">
        <div className="relative flex min-h-[280px] sm:min-h-[390px] items-center overflow-hidden rounded-[24px] border border-[#e6eef8] dark:border-white/10 bg-gradient-to-br from-[#eef8ff] to-white dark:from-slate-800 dark:to-slate-900 px-6 py-9 sm:px-10 shadow-[0_12px_35px_rgba(40,60,90,0.07)]">
          {/* Decorative blob */}
          <div className="pointer-events-none absolute -bottom-[170px] right-[80px] h-[270px] w-[270px] rounded-full bg-[rgba(255,190,100,0.15)]" />

          <div className="relative z-[5] w-full sm:w-[58%]">
            <span className="mb-3 inline-flex items-center rounded-full border border-[#ffd4e5] bg-white dark:bg-slate-800 dark:border-rose-500/30 px-3 py-1.5 text-[11px] font-bold text-[#e93482] before:mr-1.5 before:h-1.5 before:w-1.5 before:rounded-full before:bg-[#ed347f]">
              আস্থার প্রতিশ্রুতি
            </span>

            <h2 className="m-0 max-w-[620px] text-[clamp(24px,3.4vw,40px)] font-extrabold leading-[1.25] text-[#252525] dark:text-white">
              মেডিকেল ভর্তি প্রস্তুতিতে{" "}
              <span className="text-[#e83283]">MediHour</span> একটি আস্থার নাম
            </h2>

            <p className="my-3 max-w-[500px] text-[clamp(13px,1.4vw,16px)] leading-relaxed text-[#777] dark:text-slate-300">
              ভর্তি প্রস্তুতির শুরু হোক আজ থেকেই। সঠিক দিকনির্দেশনা ও প্রয়োজনীয় রিসোর্সের সাথে এগিয়ে যাও তোমার লক্ষ্যের দিকে।
            </p>

            <div className="flex flex-wrap items-center gap-2.5">
              <a
                href="/#courses"
                className="inline-flex min-h-[42px] items-center justify-center rounded-[9px] bg-gradient-to-br from-[#e52b80] to-[#f05463] px-5 text-[13px] font-bold text-white shadow-[0_7px_16px_rgba(229,43,128,0.17)] transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_20px_rgba(229,43,128,0.25)]"
              >
                পেইড কোর্স
              </a>
              <a
                href="/free-class"
                className="inline-flex min-h-[42px] items-center justify-center rounded-[9px] border border-[#e66b9d] bg-white dark:bg-transparent px-5 text-[13px] font-bold text-[#df317f] transition-all hover:-translate-y-0.5 hover:bg-[#df317f] hover:text-white"
              >
                ফ্রি কোর্স
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
