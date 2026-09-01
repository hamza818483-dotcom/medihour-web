import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRef, useState } from "react";

/** Enables click-and-drag / touch-swipe scrolling on a marquee row while
 *  the CSS auto-scroll animation is paused during interaction. */
const useDragScroll = () => {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startScroll = useRef(0);

  const onDown = (clientX: number) => {
    if (!ref.current) return;
    setDragging(true);
    startX.current = clientX;
    startScroll.current = ref.current.scrollLeft;
  };
  const onMove = (clientX: number) => {
    if (!dragging || !ref.current) return;
    ref.current.scrollLeft = startScroll.current - (clientX - startX.current);
  };
  const onUp = () => setDragging(false);

  return {
    ref,
    dragging,
    handlers: {
      onMouseDown: (e: React.MouseEvent) => onDown(e.clientX),
      onMouseMove: (e: React.MouseEvent) => onMove(e.clientX),
      onMouseUp: onUp,
      onMouseLeave: onUp,
      onTouchStart: (e: React.TouchEvent) => onDown(e.touches[0].clientX),
      onTouchMove: (e: React.TouchEvent) => onMove(e.touches[0].clientX),
      onTouchEnd: onUp,
    },
  };
};

export const SuccessGallerySection = () => {
  const { data: photos } = useQuery({
    queryKey: ["success-gallery-public"],
    queryFn: async () => {
      const { data } = await supabase
        .from("success_gallery")
        .select("*")
        .order("display_order", { ascending: true });
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const row1 = useDragScroll();
  const row2 = useDragScroll();

  if (!photos || photos.length === 0) return null;

  // Split into two rows for the marquee effect
  const mid = Math.ceil(photos.length / 2);
  const rowOne = photos.slice(0, mid);
  const rowTwo = photos.length > 3 ? photos.slice(mid) : rowOne;

  return (
    <section className="relative w-full overflow-hidden bg-black py-[52px] pb-[60px] isolate">
      {/* Heading */}
      <div className="flex w-full items-center justify-center gap-[22px] px-5 pb-9 text-center">
        <div className="hidden h-px w-[70px] flex-none bg-gradient-to-r from-transparent to-[#ff4081] sm:block" />
        <div className="max-w-[850px]">
          <h2 className="m-0 text-[clamp(24px,4vw,40px)] font-extrabold leading-[1.35] tracking-[-0.4px] text-white">
            MediHour-এর হাত ধরে{" "}
            <span className="bg-gradient-to-r from-[#ff5a91] via-[#ef55d7] to-[#6978ff] bg-clip-text text-transparent">
              সাফল্যের পথে এগিয়ে চলেছে
            </span>
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-white/58">
            আমাদের শিক্ষার্থীদের অর্জন ও স্মরণীয় মুহূর্তগুলো
          </p>
        </div>
        <div className="hidden h-px w-[70px] flex-none bg-gradient-to-l from-transparent to-[#6877ff] sm:block" />
      </div>

      {/* Row 1 */}
      <div
        ref={row1.ref}
        className="w-full overflow-x-auto scrollbar-hide cursor-grab active:cursor-grabbing"
        {...row1.handlers}
      >
        <div
          className={`flex w-max animate-gallery-scroll-left gap-4 hover:[animation-play-state:paused] ${
            row1.dragging ? "gallery-row-paused" : ""
          }`}
        >
          {[...rowOne, ...rowOne].map((photo, i) => (
            <div
              key={`r1-${photo.id}-${i}`}
              className="relative h-[180px] w-[330px] flex-none overflow-hidden rounded-[15px] border border-white/10 bg-[#111111] shadow-[0_8px_28px_rgba(0,0,0,0.38)] sm:h-[230px] sm:w-[430px]"
            >
              <img
                src={photo.image_url}
                alt={photo.caption || "MediHour Success Story"}
                className="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.04]"
                loading="lazy"
                draggable={false}
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/[0.16]" />
            </div>
          ))}
        </div>
      </div>

      {/* Row 2 (reverse direction), only if enough photos */}
      {photos.length > 3 && (
        <div
          ref={row2.ref}
          className="mt-4 w-full overflow-x-auto scrollbar-hide cursor-grab active:cursor-grabbing"
          {...row2.handlers}
        >
          <div
            className={`flex w-max animate-gallery-scroll-right gap-4 hover:[animation-play-state:paused] ${
              row2.dragging ? "gallery-row-paused" : ""
            }`}
          >
            {[...rowTwo, ...rowTwo].map((photo, i) => (
              <div
                key={`r2-${photo.id}-${i}`}
                className="relative h-[180px] w-[330px] flex-none overflow-hidden rounded-[15px] border border-white/10 bg-[#111111] shadow-[0_8px_28px_rgba(0,0,0,0.38)] sm:h-[230px] sm:w-[430px]"
              >
                <img
                  src={photo.image_url}
                  alt={photo.caption || "MediHour Success Story"}
                  className="h-full w-full object-cover transition-transform duration-500 hover:scale-[1.04]"
                  loading="lazy"
                  draggable={false}
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/[0.16]" />
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
