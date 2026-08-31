import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { Button } from '@/components/ui/button';
import { ArrowRight, Clock, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HeroCarouselItemProps {
  hero: any;
}

const CountdownTimer = ({ targetDate }: { targetDate: string }) => {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const difference = +new Date(targetDate) - +new Date();
      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
          seconds: Math.floor((difference / 1000) % 60),
        });
      } else {
        setTimeLeft(null);
      }
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(timer);
  }, [targetDate]);

  if (!timeLeft) return null;

  return (
    <div className="flex gap-2 sm:gap-6 mt-2 md:mt-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      {[
        { label: 'দিন', value: timeLeft.days },
        { label: 'ঘণ্টা', value: timeLeft.hours },
        { label: 'মিনিট', value: timeLeft.minutes },
        { label: 'সেকেন্ড', value: timeLeft.seconds },
      ].map((item, i) => (
        <div key={i} className="flex flex-col items-center group">
          <div className="relative">
            <div className="relative bg-white/10 backdrop-blur-md border border-white/20 rounded-lg md:rounded-2xl w-10 h-10 sm:w-20 sm:h-20 md:w-24 md:h-24 flex items-center justify-center shadow-lg">
              <span className="text-sm sm:text-3xl md:text-5xl font-black text-white tabular-nums">
                {item.value.toString().padStart(2, '0')}
              </span>
            </div>
          </div>
          <span className="text-[10px] md:text-xs font-black text-white/90 uppercase mt-1 md:mt-3 tracking-wider md:tracking-widest">{item.label}</span>
        </div>
      ))}
    </div>
  );
};

const HeroCarouselItem: React.FC<HeroCarouselItemProps> = ({ hero }) => {
  const isImageOnly = hero.hero_type === 'image' || !hero.hero_type;
  const isCountdown = hero.hero_type === 'countdown';
  const isAnnouncement = hero.hero_type === 'announcement';

  // Force migration from old emerald to dark emerald if found
  let bgConfig = hero.background_config || { type: 'gradient', from: '#064e3b', to: '#022c22' };
  if (bgConfig.from === '#10b981' || bgConfig.to === '#059669') {
      bgConfig = { type: 'gradient', from: '#064e3b', to: '#022c22' };
  }
  
  const bgStyle = bgConfig.type === 'gradient' 
    ? { background: `linear-gradient(135deg, ${bgConfig.from} 0%, ${bgConfig.to} 100%)` }
    : { backgroundColor: bgConfig.from };

  if (isImageOnly) {
    return (
      <section className="min-w-0 flex-[0_0_100%]">
        <a href={hero.cta_link || "#"} className="block relative w-full h-auto aspect-video md:aspect-[21/9] lg:aspect-[2.4/1] overflow-hidden bg-background cursor-pointer hover:opacity-95 transition-opacity">
          {hero.image_url ? (
            <div className="h-full w-full relative flex items-center justify-center">
              <img
                src={hero.image_url}
                alt={hero.title}
                className="relative max-h-full max-w-full object-contain z-10"
              />
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-secondary/50 text-muted-foreground">
              <span className="opacity-20 text-4xl font-bold italic uppercase">MediHour Banner</span>
            </div>
          )}
        </a>
      </section>
    );
  }

  return (
    <section 
      className="min-w-0 flex-[0_0_100%] relative aspect-video md:h-[700px] overflow-hidden flex items-center select-none"
      style={bgStyle}
    >
      {/* Background patterns */}
      <div className="absolute top-[-10%] right-[-5%] w-[40%] h-[60%] bg-white/10 rounded-full blur-[80px]" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[50%] h-[70%] bg-black/10 rounded-full blur-[100px]" />
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '24px 24px' }} />
      
      <div className="container mx-auto px-4 sm:px-16 relative z-10 h-full flex items-center">
        <div className="grid md:grid-cols-2 gap-4 md:gap-16 items-center w-full">
          <div className="space-y-1.5 md:space-y-6 text-white animate-in fade-in slide-in-from-left-8 duration-700">
            <div className="flex flex-wrap gap-2">
              {isCountdown && (
                <div className="inline-flex items-center gap-1.5 bg-white/10 backdrop-blur-sm px-2 py-0.5 md:px-3 md:py-1 rounded-full border border-white/20 text-[8px] md:text-[10px] font-black tracking-widest uppercase">
                  <div className="w-1 h-1 md:w-1.5 md:h-1.5 rounded-full bg-red-400 animate-pulse" /> কাউন্টডাউন
                </div>
              )}
              {isAnnouncement && (
                <div className="inline-flex items-center gap-1.5 bg-black/10 backdrop-blur-sm px-2 py-0.5 md:px-3 md:py-1 rounded-full border border-white/10 text-[8px] md:text-[10px] font-black tracking-widest uppercase">
                    📢 বিজ্ঞপ্তি
                </div>
              )}
            </div>
            
            <div className="space-y-0.5 md:space-y-2">
                <h1 className="text-xl md:text-5xl lg:text-6xl font-black leading-tight tracking-tight text-white drop-shadow-lg line-clamp-1 md:line-clamp-none">
                    {hero.title}
                </h1>
                <div className="h-0.5 md:h-1 w-12 md:w-16 bg-white/30 rounded-full" />
            </div>
            
            <div className={cn(
              "prose prose-invert max-w-none text-white/80 leading-snug md:leading-relaxed text-[10px] md:text-lg font-medium",
              "prose-headings:text-white prose-strong:text-white prose-a:text-white prose-a:underline decoration-white/30 hover:decoration-white",
              "line-clamp-2 md:line-clamp-none"
            )}>
              {hero.markdown_content ? (
                <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {hero.markdown_content}
                </ReactMarkdown>
              ) : (
                <p>{hero.subtitle}</p>
              )}
            </div>

            {isCountdown && hero.countdown_target && (
              <CountdownTimer targetDate={hero.countdown_target} />
            )}

            <div className="pt-1 md:pt-4">
              <Button 
                  asChild 
                  className="bg-white/95 text-foreground hover:bg-white rounded-lg md:rounded-xl font-black px-4 md:px-10 h-7 md:h-14 text-[10px] md:text-lg shadow-xl hover:-translate-y-0.5 transition-all duration-300 group overflow-hidden"
                  style={{ color: bgConfig.from }}
              >
                <a href={hero.cta_link || "#"}>
                  <span className="relative z-10 flex items-center gap-1 md:gap-2">
                    {hero.cta_text || "বিস্তারিত দেখুন"} 
                    <ArrowRight className="h-3 w-3 md:h-6 md:w-6 group-hover:translate-x-1 transition-transform" />
                  </span>
                </a>
              </Button>
            </div>
          </div>

          {hero.image_url && (
              <div className="hidden md:flex justify-center items-center animate-in fade-in zoom-in duration-700 delay-300">
                  <div className="relative group p-6">
                      <div className="absolute inset-0 bg-white/10 blur-[80px] rounded-full scale-90" />
                      <div className="relative z-10 bg-white/5 backdrop-blur-sm p-3 rounded-[2rem] border border-white/10 shadow-2xl rotate-1 group-hover:rotate-0 transition-transform duration-500">
                        <img 
                            src={hero.image_url} 
                            alt={hero.title} 
                            className="relative z-10 max-h-[250px] lg:max-h-[400px] w-auto object-contain rounded-xl"
                        />
                      </div>
                  </div>
              </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default HeroCarouselItem;
