import { useEffect, useState } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { PublicHeader } from "@/components/PublicHeader";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, CheckCircle2, Copy, AlertCircle, Sparkles, Tag, Gift, Timer, CalendarIcon, Info, SkipForward } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { trackPixelEvent, generateEventId, getStoredUtmParams, getFacebookCookies } from "@/lib/metaPixel";

// Live countdown timer component
const CountdownTimer = ({ deadline }: { deadline: string }) => {
  const [timeLeft, setTimeLeft] = useState("");
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const update = () => {
      const now = new Date().getTime();
      const end = new Date(deadline).getTime();
      const diff = end - now;

      if (diff <= 0) {
        setExpired(true);
        setTimeLeft("Expired");
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);

      if (days > 0) {
        setTimeLeft(`${days}d ${hours}h ${mins}m ${secs}s`);
      } else if (hours > 0) {
        setTimeLeft(`${hours}h ${mins}m ${secs}s`);
      } else {
        setTimeLeft(`${mins}m ${secs}s`);
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [deadline]);

  if (expired) return null;

  return (
    <span className="inline-flex items-center gap-1 font-mono text-xs font-bold tabular-nums">
      <Timer className="h-3 w-3" />
      {timeLeft}
    </span>
  );
};

// Step indicator
const StepBadge = ({ number, label }: { number: number; label: string }) => (
  <div className="flex items-center gap-2 mb-2">
    <span className="bg-primary text-primary-foreground w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0">
      {number}
    </span>
    <span className="font-semibold text-sm text-muted-foreground">{label}</span>
  </div>
);

const formSchema = z.object({
  payment_method: z.enum(["bkash", "nagad"], { required_error: "পেমেন্ট মেথড বাছাই করো" }),
  amount_sent: z.coerce.number().min(1, "পরিশোধিত টাকার পরিমাণ লিখুন"),
  has_due: z.enum(["yes", "no"]),
  due_amount: z.coerce.number().optional().nullable(),
  due_date: z.date().optional().nullable(),
  sender_last5: z.string().min(5, "Last 5 digits অবশ্যই ৫ সংখ্যার হতে হবে").max(5, "Last 5 digits অবশ্যই ৫ সংখ্যার হতে হবে"),
  social_link: z.string().min(5, "সোশ্যাল মিডিয়া লিংক দিন"),
  contact_number: z.string().min(11, "সক্রিয় নম্বর দিন (কমপক্ষে ১১ সংখ্যা)"),
}).refine((data) => {
  if (data.has_due === "yes" && (!data.due_amount || data.due_amount <= 0)) {
    return false;
  }
  return true;
}, {
  message: "বাকি টাকার পরিমাণ লিখুন",
  path: ["due_amount"],
});

const CourseBuy = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [searchParams] = useSearchParams();

  // Promo Code State
  const [promoCode, setPromoCode] = useState("");
  const [appliedCouponCode, setAppliedCouponCode] = useState<string | null>(null);
  const [discount, setDiscount] = useState<{ amount: number; type: "flat" | "percentage"; id: string } | null>(null);
  const [checkingPromo, setCheckingPromo] = useState(false);

  // Read coupon from URL params (passed from CourseDetails)
  useEffect(() => {
    const couponFromUrl = searchParams.get("coupon");
    const couponId = searchParams.get("coupon_id");
    const discountAmount = searchParams.get("discount_amount");
    const discountType = searchParams.get("discount_type");

    if (couponFromUrl && couponId && discountAmount && discountType) {
      setAppliedCouponCode(couponFromUrl);
      setPromoCode(couponFromUrl);
      setDiscount({
        amount: Number(discountAmount),
        type: discountType as "flat" | "percentage",
        id: couponId,
      });
    }
  }, [searchParams]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      payment_method: "bkash",
      amount_sent: undefined,
      has_due: "no",
      due_amount: null,
      due_date: null,
      sender_last5: "",
      social_link: "",
      contact_number: profile?.phone || "",
    },
  });

  const hasDue = form.watch("has_due");

  const {
    data: course,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["public-course-buy", courseId],
    queryFn: async () => {
      if (!courseId) return null;

      const { data, error } = await supabase
        .from("courses")
        .select("id, name, price, slug, bkash_number, nagad_number, contact_info")
        .or(`slug.eq.${courseId},id.eq.${courseId}`)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!courseId,
    staleTime: 3 * 60 * 1000,
  });

  useEffect(() => {
    if (course?.id) {
      trackPixelEvent("InitiateCheckout", {
        content_ids: [course.id],
        content_name: course.name,
        content_type: "product",
        value: course.price ?? undefined,
        currency: "BDT",
      });
    }
  }, [course?.id]);

  // Fetch special discounts for this course
  const { data: specialDiscounts } = useQuery({
    queryKey: ["special-discounts", course?.id],
    queryFn: async () => {
      if (!course?.id) return [];
      const { data, error } = await supabase.rpc("get_special_discounts", { p_course_id: course.id });
      if (error) return [];
      return data || [];
    },
    enabled: !!course?.id,
  });

  const freeEnrollMutation = useMutation({
    mutationFn: async () => {
      if (!course?.id || !user?.id) throw new Error("কোর্স পাওয়া যায়নি অথবা লগইন করা নেই");

      if (Number(course.price) === 0) {
        const { error } = await supabase.rpc("enroll_in_free_course", { p_course_id: course.id });
        if (error) throw error;
      } else {
        const { error } = await (supabase.from as any)("payment_requests").insert({
          profile_id: user.id,
          course_id: course.id,
          trx_id: "PROMO-FREE",
          phone: profile?.phone || "N/A",
          payment_method: "bkash",
          status: "pending",
          event_id: generateEventId(),
          ...getStoredUtmParams(),
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      if (Number(course?.price) === 0) {
        toast.success("সফলভাবে ভর্তি হয়েছে!");
        navigate("/dashboard");
      } else {
        toast.success("ভর্তির রিকোয়েস্ট জমা হয়েছে! অ্যাডমিন অনুমোদনের অপেক্ষা করুন।");
        navigate("/dashboard");
      }
    },
    onError: (err: any) => {
      toast.error(err.message);
    },
  });

  const { data: enrollment } = useQuery({
    queryKey: ["check-enrollment", course?.id, user?.id],
    queryFn: async () => {
      if (!course?.id || !user?.id) return null;
      const { data, error } = await supabase
        .from("enrollments")
        .select("id")
        .eq("course_id", course.id)
        .eq("profile_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!course?.id && !!user?.id,
  });

  const { data: existingRequest } = useQuery({
    queryKey: ["check-payment-request", course?.id, user?.id],
    queryFn: async () => {
      if (!course?.id || !user?.id) return null;
      const { data } = await supabase
        .from("payment_requests")
        .select("*")
        .eq("course_id", course.id)
        .eq("profile_id", user.id)
        .eq("status", "pending")
        .maybeSingle();
      return data;
    },
    enabled: !!course?.id && !!user?.id,
  });

  useEffect(() => {
    if (course?.name) {
      document.title = `ভর্তি হন - ${course.name}`;
    } else {
      document.title = "ভর্তি হন";
    }
  }, [course?.name]);

  const checkPromoCode = async () => {
    if (!promoCode || !course?.id) return;
    setCheckingPromo(true);
    try {
      const { data: rawData, error } = await supabase.rpc("check_promo_code", {
        p_code: promoCode,
        p_course_id: course.id,
      });
      const data = rawData as any;

      if (error) throw error;

      if (data && data.valid) {
        setDiscount({
          amount: data.discount_amount,
          type: data.discount_type,
          id: data.id,
        });
        setAppliedCouponCode(data.code || promoCode.toUpperCase());
        toast.success("প্রোমো কোড প্রয়োগ হয়েছে!");
      } else {
        setDiscount(null);
        toast.error(data?.message || "ভুল প্রোমো কোড");
      }
    } catch (err) {
      console.error(err);
      toast.error("প্রোমো কোড যাচাই করা যায়নি");
    } finally {
      setCheckingPromo(false);
    }
  };

  const submitMutation = useMutation({
    mutationFn: async (values: z.infer<typeof formSchema>) => {
      if (!user || !course) throw new Error("লগইন করা প্রয়োজন");

      const payload: any = {
        profile_id: user.id,
        course_id: course.id,
        trx_id: values.sender_last5,
        phone: values.contact_number,
        payment_method: values.payment_method,
        status: "pending",
        amount_sent: values.amount_sent,
        due_amount: values.has_due === "yes" ? values.due_amount : null,
        due_date: values.has_due === "yes" && values.due_date ? format(values.due_date, "yyyy-MM-dd") : null,
        sender_last5: values.sender_last5,
        social_link: values.social_link,
        contact_number: values.contact_number,
        event_id: generateEventId(),
        ...getStoredUtmParams(),
        ...(() => { const c = getFacebookCookies(); return { fbp: c.fbp || null, fbc: c.fbc || null }; })(),
      };

      const { error } = await (supabase.from as any)("payment_requests").insert(payload);

      if (error) throw error;
    },
    onSuccess: () => {
      setIsSubmitted(true);
      toast.success("পেমেন্ট রিকোয়েস্ট সফলভাবে জমা হয়েছে!");
    },
    onError: (error: any) => {
      toast.error("জমা দিতে ব্যর্থ: " + error.message);
    },
  });

  function onSubmit(values: z.infer<typeof formSchema>) {
    submitMutation.mutate(values);
  }

  const bkashNumber = course?.bkash_number || "01XXXXXXXXX";
  const nagadNumber = course?.nagad_number || "01XXXXXXXXX";

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} কপি হয়েছে!`);
  };

  // Calculate final price
  let finalPrice = Number(course?.price) || 0;
  if (discount) {
    if (discount.type === "flat") {
      finalPrice = Math.max(0, finalPrice - discount.amount);
    } else if (discount.type === "percentage") {
      finalPrice = Math.max(0, finalPrice - (finalPrice * (discount.amount / 100)));
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="animate-spin text-primary h-8 w-8" />
      </div>
    );
  }

  if (enrollment) {
    return (
      <div className="min-h-screen bg-background text-foreground">
        <PublicHeader />
        <main className="mx-auto max-w-2xl px-4 py-16 text-center">
          <div className="flex justify-center mb-4 text-green-500">
            <CheckCircle2 size={64} />
          </div>
          <h1 className="text-2xl font-bold mb-2">আপনি ইতিমধ্যে ভর্তি হয়েছেন!</h1>
          <p className="text-muted-foreground mb-6">{course?.name} কোর্সে আপনার অ্যাক্সেস আছে।</p>
          <Button asChild>
            <Link to="/dashboard">ড্যাশবোর্ডে যান</Link>
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicHeader />
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-10 sm:pt-14">
        <Card className="border-[3px] border-foreground">
          <CardHeader className="space-y-1 pb-3">
            <p className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">পেমেন্ট নির্দেশনা</p>
            <CardTitle className="text-xl">{course?.name ? `${course.name} ভর্তি হন` : "কোর্স পাওয়া যায়নি"}</CardTitle>
            <CardDescription className="text-xs">
              {finalPrice === 0 ? "এই কোর্সটি আপনার জন্য ফ্রি।" : "পেমেন্ট সম্পন্ন করে নিচে বিস্তারিত জমা দিন।"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 text-sm">
            {isError && <p className="text-sm text-destructive">কোর্স লোড করতে ব্যর্থ। আবার চেষ্টা করুন।</p>}

            {finalPrice === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 space-y-6 text-center animate-in fade-in zoom-in-95 duration-500">
                <div className="p-4 bg-primary/10 rounded-full">
                  <Sparkles className="h-12 w-12 text-primary animate-pulse" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold">ফ্রিতে ভর্তি হন!</h2>
                  <p className="text-muted-foreground max-w-sm mx-auto">
                    কোনো পেমেন্ট ছাড়াই এই কোর্সের সব ক্লাস, পরীক্ষা এবং রিসোর্সে সাথে সাথে অ্যাক্সেস পান।
                  </p>
                </div>
                {!user ? (
                  <div className="space-y-4">
                    <p className="text-sm font-medium">ভর্তি হতে লগইন করুন</p>
                    <div className="flex gap-2 justify-center">
                      <Button asChild variant="default">
                        <Link to="/login">লগইন করুন</Link>
                      </Button>
                      <Button asChild variant="outline">
                        <Link to="/register">রেজিস্টার করুন</Link>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    size="lg"
                    className="w-full max-w-xs text-lg shadow-lg hover:shadow-primary/25 transition-all hover:scale-105"
                    onClick={() => freeEnrollMutation.mutate()}
                    disabled={freeEnrollMutation.isPending}
                  >
                    {freeEnrollMutation.isPending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : "এখনই শুরু করুন"}
                  </Button>
                )}
              </div>
            ) : (
              <>
                {/* Special Discount Banners */}
                {specialDiscounts && specialDiscounts.length > 0 && !appliedCouponCode && (
                  <div className="space-y-3 mb-4">
                    {specialDiscounts.map((discount: any, idx: number) => (
                      <div
                        key={idx}
                        className="relative overflow-hidden rounded-xl border-2 border-amber-300/50 bg-gradient-to-r from-amber-50 via-orange-50 to-yellow-50 dark:from-amber-950/30 dark:via-orange-950/20 dark:to-yellow-950/30 p-3 shadow-sm"
                      >
                        <div className="flex items-start gap-2">
                          <Gift className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-amber-900 dark:text-amber-200 leading-snug">{discount.special_discount_text}</p>
                            {discount.special_discount_deadline && (
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className="text-xs text-amber-700 dark:text-amber-400">শেষ হবে:</span>
                                <span className="text-red-600 dark:text-red-400">
                                  <CountdownTimer deadline={discount.special_discount_deadline} />
                                </span>
                              </div>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-2 h-7 text-xs w-full max-w-[200px] border-amber-300 hover:bg-amber-100 text-amber-800"
                              onClick={() => {
                                navigator.clipboard.writeText(discount.code);
                                toast.success(`"${discount.code}" ক্লিপবোর্ডে কপি হয়েছে।`);
                              }}
                            >
                              <Copy className="h-3 w-3 mr-1" />
                              কপি: {discount.code}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Price Display */}
                <div className="text-center py-4 bg-muted/30 rounded-lg border">
                  <p className="text-muted-foreground text-xs uppercase tracking-widest mb-1">সর্বমোট পরিশোধযোগ্য টাকা</p>
                  <div className="flex items-center justify-center gap-2">
                    {discount ? (
                      <>
                        <span className="text-xl text-muted-foreground line-through decoration-red-500/50">
                          ৳{Number(course?.price).toLocaleString("en-BD")}
                        </span>
                        <span className="text-3xl font-bold text-primary">৳{Number(finalPrice).toLocaleString("en-BD")}</span>
                      </>
                    ) : (
                      <span className="text-3xl font-bold">৳{Number(course?.price).toLocaleString("en-BD")}</span>
                    )}
                  </div>
                  {discount && appliedCouponCode && (
                    <div className="mt-2 inline-flex items-center gap-2 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-full px-3 py-1">
                      <Tag className="h-3 w-3 text-green-600" />
                      <span className="text-xs font-semibold text-green-700 dark:text-green-400">{appliedCouponCode}</span>
                      <span className="text-xs text-green-600">
                        {discount.type === "percentage" ? `${discount.amount}% ছাড়` : `৳${discount.amount} ছাড়`}
                      </span>
                    </div>
                  )}
                </div>

                {/* Promo Code Input */}
                <div className="flex gap-2 items-end">
                  <div className="grid w-full gap-1.5">
                    <Label htmlFor="promo" className="text-xs">প্রোমো কোড আছে?</Label>
                    <div className="relative">
                      <Tag className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="promo"
                        placeholder="কোড লিখুন"
                        className="pl-9"
                        value={promoCode}
                        onChange={(e) => setPromoCode(e.target.value)}
                        disabled={!!discount}
                      />
                    </div>
                  </div>
                  {discount ? (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setDiscount(null);
                        setPromoCode("");
                        setAppliedCouponCode(null);
                      }}
                    >
                      সরান
                    </Button>
                  ) : (
                    <Button onClick={checkPromoCode} disabled={!promoCode || checkingPromo}>
                      {checkingPromo ? <Loader2 className="h-4 w-4 animate-spin" /> : "প্রয়োগ করুন"}
                    </Button>
                  )}
                </div>

                {/* Step 1: Send Money */}
                <div className="bg-muted/50 p-6 rounded-lg space-y-4 border">
                  <div className="flex items-center gap-2 text-base font-bold text-primary">
                    <span className="bg-primary text-primary-foreground w-7 h-7 rounded-full flex items-center justify-center text-sm">1</span>
                    ধাপ ১: টাকা পাঠান
                  </div>
                  <p className="text-muted-foreground pl-9">
                    <span className="font-bold text-foreground">৳{Number(finalPrice).toLocaleString("en-BD")}</span> "Send Money" এর মাধ্যমে পাঠান।
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                    <div className="relative p-4 bg-pink-50 dark:bg-pink-950/30 rounded-lg border border-pink-200 dark:border-pink-800 group hover:shadow-sm transition-shadow">
                      <span className="text-xs font-bold text-pink-600 dark:text-pink-400 block mb-1 uppercase tracking-wider">বিকাশ পার্সোনাল</span>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-lg font-bold tracking-wide">{bkashNumber}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-pink-600 hover:text-pink-700 hover:bg-pink-100"
                          onClick={() => copyToClipboard(bkashNumber, "বিকাশ নাম্বার")}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="relative p-4 bg-orange-50 dark:bg-orange-950/30 rounded-lg border border-orange-200 dark:border-orange-800 group hover:shadow-sm transition-shadow">
                      <span className="text-xs font-bold text-orange-600 dark:text-orange-400 block mb-1 uppercase tracking-wider">নগদ পার্সোনাল</span>
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-lg font-bold tracking-wide">{nagadNumber}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-orange-600 hover:text-orange-700 hover:bg-orange-100"
                          onClick={() => copyToClipboard(nagadNumber, "নগদ নাম্বার")}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step 2: Submit Details */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-base font-bold text-primary mt-6">
                    <span className="bg-primary text-primary-foreground w-7 h-7 rounded-full flex items-center justify-center text-sm">2</span>
                    ধাপ ২: আপনার তথ্য দিন
                  </div>

                  {!user ? (
                    <div className="text-center py-8 border-2 border-dashed rounded-lg bg-muted/20">
                      <div className="flex justify-center mb-3 text-muted-foreground">
                        <AlertCircle className="h-8 w-8" />
                      </div>
                      <p className="mb-4 font-medium">পেমেন্ট বিস্তারিত জমা দিতে লগইন করা প্রয়োজন।</p>
                      <div className="flex gap-2 justify-center">
                        <Button asChild variant="default">
                          <Link to="/login">লগইন করুন</Link>
                        </Button>
                        <Button asChild variant="outline">
                          <Link to="/register">রেজিস্টার করুন</Link>
                        </Button>
                      </div>
                    </div>
                  ) : isSubmitted || existingRequest ? (
                    <div className="text-center py-8 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg border border-yellow-200 dark:border-yellow-800 animate-in zoom-in-95 duration-300 p-6">
                      <div className="flex justify-center mb-4">
                        <div className="p-3 bg-yellow-100 text-yellow-600 rounded-full dark:bg-yellow-900/30 dark:text-yellow-400">
                          <CheckCircle2 className="h-8 w-8" />
                        </div>
                      </div>
                      <h3 className="font-bold text-xl text-yellow-900 dark:text-yellow-200 mb-4">
                        মেডিআওয়ারের কোর্সে আপনাকে স্বাগতম।
                      </h3>
                      <div className="text-sm text-yellow-800 dark:text-yellow-300 space-y-3 leading-relaxed max-w-lg mx-auto">
                        <p>
                          আপনার পেমেন্ট রিকোয়েস্ট পর্যালোচনার জন্য জমা হয়েছে। যাচাই করার পর টিম আপনাকে অ্যাক্সেস দিয়ে দিবে।
                        </p>
                        <p>এক্সেস পেলে নোটিশে মেসেজ আসবে।</p>
                        <p>দীর্ঘসময় পরেও অ্যাক্সেস না পেলে সাপোর্টে যোগাযোগ করুন।</p>
                      </div>
                      <Button asChild className="mt-6 bg-yellow-600 hover:bg-yellow-700 text-white border-none">
                        <Link to="/dashboard">ড্যাশবোর্ডে যান</Link>
                      </Button>
                    </div>
                  ) : (
                    <Form {...form}>
                      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 border p-6 rounded-lg bg-card shadow-sm">
                        {/* Payment Method */}
                        <FormField
                          control={form.control}
                          name="payment_method"
                          render={({ field }) => (
                            <FormItem className="space-y-3">
                              <FormLabel className="font-semibold">কোন মাধ্যমে পেমেন্ট করেছেন?</FormLabel>
                              <FormControl>
                                <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-row gap-4">
                                  <FormItem className="flex items-center space-x-3 space-y-0">
                                    <FormControl>
                                      <RadioGroupItem value="bkash" />
                                    </FormControl>
                                    <FormLabel className="font-normal">বিকাশ</FormLabel>
                                  </FormItem>
                                  <FormItem className="flex items-center space-x-3 space-y-0">
                                    <FormControl>
                                      <RadioGroupItem value="nagad" />
                                    </FormControl>
                                    <FormLabel className="font-normal">নগদ</FormLabel>
                                  </FormItem>
                                </RadioGroup>
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        {/* Q1: Amount Sent */}
                        <div className="space-y-3 p-4 bg-muted/30 rounded-lg border border-border/50">
                          <StepBadge number={1} label='কত টাকা "Send Money" করেছেন? (আবশ্যক)' />
                          <FormField
                            control={form.control}
                            name="amount_sent"
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <div className="relative">
                                    <span className="absolute left-3 top-2.5 text-muted-foreground font-bold">৳</span>
                                    <Input type="number" placeholder={`${finalPrice}`} className="pl-7" {...field} />
                                  </div>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        {/* Q2: Has Due? */}
                        <div className="space-y-3 p-4 bg-muted/30 rounded-lg border border-border/50">
                          <StepBadge number={2} label="আপনার টাকা দেওয়া বাকি আছে? (Due)" />
                          <FormField
                            control={form.control}
                            name="has_due"
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <RadioGroup onValueChange={field.onChange} defaultValue={field.value} className="flex flex-row gap-6">
                                    <FormItem className="flex items-center space-x-3 space-y-0">
                                      <FormControl>
                                        <RadioGroupItem value="yes" />
                                      </FormControl>
                                      <FormLabel className="font-normal">✅ হ্যাঁ, বাকি আছে</FormLabel>
                                    </FormItem>
                                    <FormItem className="flex items-center space-x-3 space-y-0">
                                      <FormControl>
                                        <RadioGroupItem value="no" />
                                      </FormControl>
                                      <FormLabel className="font-normal">❌ না, বাকি নেই</FormLabel>
                                    </FormItem>
                                  </RadioGroup>
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          {hasDue === "yes" && (
                            <div className="space-y-3 pt-2">
                              <FormField
                                control={form.control}
                                name="due_amount"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-xs">✅ বাকি কত টাকা?</FormLabel>
                                    <FormControl>
                                      <div className="relative">
                                        <span className="absolute left-3 top-2.5 text-muted-foreground font-bold">৳</span>
                                        <Input
                                          type="number"
                                          placeholder="e.g. 500"
                                          className="pl-7"
                                          {...field}
                                          value={field.value ?? ""}
                                        />
                                      </div>
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                          )}

                          {hasDue === "no" && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded p-2">
                              <SkipForward className="h-3.5 w-3.5 shrink-0" />
                              <span>⚠️ বাকি না থাকলে Skip করে পরের প্রশ্নে যান।</span>
                            </div>
                          )}
                        </div>

                        {/* Q3: Due Date (only if has due) */}
                        {hasDue === "yes" && (
                          <div className="space-y-3 p-4 bg-muted/30 rounded-lg border border-border/50">
                            <StepBadge number={3} label="বাকি টাকা কবের মধ্যে দিবেন? (আনুমানিক)" />
                            <p className="text-xs text-muted-foreground pl-9 -mt-1">মাস ও তারিখ বেছে নিন।</p>
                            <div className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-800/60 p-3 text-xs text-amber-800 dark:text-amber-300 flex gap-2">
                              <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                              <span>চেষ্টা করবেন নির্দিষ্ট সময়ের মাঝে দিয়ে দেওয়ার। না পারলে সাপোর্টে জানাবেন।</span>
                            </div>
                            <FormField
                              control={form.control}
                              name="due_date"
                              render={({ field }) => (
                                <FormItem className="flex flex-col">
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <FormControl>
                                        <Button
                                          variant="outline"
                                          className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                                        >
                                          {field.value ? format(field.value, "PPP") : "তারিখ বেছে নিন"}
                                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                        </Button>
                                      </FormControl>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                      <Calendar
                                        mode="single"
                                        selected={field.value ?? undefined}
                                        onSelect={field.onChange}
                                        disabled={(date) => date < new Date()}
                                        initialFocus
                                      />
                                    </PopoverContent>
                                  </Popover>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <SkipForward className="h-3.5 w-3.5 shrink-0" />
                              <span>⚠️ টাকা বাকি না থাকলে Skip করেন।</span>
                            </div>
                          </div>
                        )}

                        {/* Q4: Last 5 Digits */}
                        <div className="space-y-3 p-4 bg-muted/30 rounded-lg border border-border/50">
                          <StepBadge
                            number={hasDue === "yes" ? 4 : 3}
                            label='যে নম্বর থেকে "Send Money" করেছেন সেই নম্বরের Last 5 Digit লিখুন। (আবশ্যক)'
                          />
                          <FormField
                            control={form.control}
                            name="sender_last5"
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input placeholder="e.g. 12345" maxLength={5} {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        {/* Q5: Social Link */}
                        <div className="space-y-3 p-4 bg-muted/30 rounded-lg border border-border/50">
                          <StepBadge number={hasDue === "yes" ? 5 : 4} label="আপনার Telegram বা Facebook আইডির লিংক দিন। (আবশ্যক)" />
                          <p className="text-xs text-muted-foreground pl-9 -mt-1">নিজস্ব একাউন্ট না থাকলে গার্ডিয়ানের আইডির লিংক দিবেন।</p>
                          <FormField
                            control={form.control}
                            name="social_link"
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input placeholder="https://t.me/... অথবা https://fb.com/..." {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        {/* Q6: Contact/WhatsApp Number */}
                        <div className="space-y-3 p-4 bg-muted/30 rounded-lg border border-border/50">
                          <StepBadge number={hasDue === "yes" ? 6 : 5} label="প্রয়োজনে যোগাযোগের জন্য সক্রিয় Contact/WhatsApp Number লিখুন। (আবশ্যক)" />
                          <FormField
                            control={form.control}
                            name="contact_number"
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input placeholder="01XXXXXXXXX" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>

                        <Button type="submit" className="w-full" disabled={submitMutation.isPending}>
                          {submitMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                          পেমেন্ট বিস্তারিত জমা দিন
                        </Button>
                      </form>
                    </Form>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default CourseBuy;
