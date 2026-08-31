import { useState } from "react";
import { useParams, Link, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const CourseBuy = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const { user, loading: authLoading } = useAuth();

  const [method, setMethod] = useState<"bkash" | "nagad">("bkash");
  const [phone, setPhone] = useState("");
  const [trxId, setTrxId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const { data: course, isLoading } = useQuery({
    queryKey: ["public-course-buy", courseId],
    queryFn: async () => {
      if (!courseId) return null;
      const { data, error } = await supabase
        .from("courses")
        .select("id, name, price, bkash_number, nagad_number, contact_info")
        .or(`slug.eq.${courseId},id.eq.${courseId}`)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!courseId,
  });

  if (authLoading || isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <p className="text-muted-foreground">লোড হচ্ছে...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to={`/login?returnTo=${encodeURIComponent(`/courses/${courseId}/buy`)}`}
        replace
      />
    );
  }

  if (!course) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-lg font-bold">কোর্সটি খুঁজে পাওয়া যায়নি</p>
        <Link to="/" className="text-sm text-primary underline">
          হোমে ফিরে যান
        </Link>
      </div>
    );
  }

  const numberToPay = method === "bkash" ? course.bkash_number : course.nagad_number;

  const handleSubmit = async () => {
    if (!phone.trim() || !trxId.trim()) {
      toast.error("ফোন নাম্বার ও ট্রানজেকশন আইডি দিন");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from("payment_requests").insert({
        profile_id: user.id,
        course_id: course.id,
        trx_id: trxId.trim(),
        phone: phone.trim(),
        payment_method: method,
      });
      if (error) throw error;
      setSubmitted(true);
      toast.success("পেমেন্ট রিকোয়েস্ট জমা হয়েছে, যাচাই করার পর অ্যাক্সেস পাবে");
    } catch (e: any) {
      toast.error(e.message || "সমস্যা হয়েছে, আবার চেষ্টা করো");
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="mx-auto flex min-h-[60vh] w-full max-w-[600px] flex-col items-center justify-center gap-3 px-4 text-center">
        <p className="text-xl font-extrabold text-[#e93482]">ধন্যবাদ!</p>
        <p className="text-muted-foreground">
          তোমার পেমেন্ট রিকোয়েস্ট জমা হয়েছে। যাচাই করার পর কোর্স অ্যাক্সেস পেয়ে যাবে।
        </p>
        <Button asChild className="mt-2">
          <Link to="/dashboard">ড্যাশবোর্ডে যান</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[600px] px-4 py-6">
      <Link
        to={`/courses/${courseId}`}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> ফিরে যান
      </Link>

      <h1 className="mb-1 text-2xl font-extrabold">{course.name}</h1>
      <p className="mb-6 text-lg font-bold text-[#e93482]">
        ৳{Number(course.price).toLocaleString("en-BD")}
      </p>

      <div className="mb-6 rounded-2xl border p-4">
        <h2 className="mb-3 font-bold">পেমেন্ট মেথড বাছাই করো</h2>
        <RadioGroup
          value={method}
          onValueChange={(v) => setMethod(v as "bkash" | "nagad")}
          className="mb-4 flex gap-4"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="bkash" id="bkash" />
            <Label htmlFor="bkash">বিকাশ</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="nagad" id="nagad" />
            <Label htmlFor="nagad">নগদ</Label>
          </div>
        </RadioGroup>

        {numberToPay ? (
          <p className="mb-4 rounded-lg bg-muted p-3 text-sm">
            এই নাম্বারে <b>Send Money</b> করো:{" "}
            <span className="font-mono font-bold">{numberToPay}</span>
          </p>
        ) : (
          <p className="mb-4 text-sm text-muted-foreground">
            নাম্বার সেট করা নেই, {course.contact_info || "সাপোর্টে যোগাযোগ করো"}
          </p>
        )}

        <div className="mb-3 space-y-1.5">
          <Label htmlFor="phone">তোমার ফোন নাম্বার (যেটা থেকে পাঠিয়েছো)</Label>
          <Input
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="01XXXXXXXXX"
          />
        </div>

        <div className="mb-4 space-y-1.5">
          <Label htmlFor="trx">ট্রানজেকশন আইডি</Label>
          <Input
            id="trx"
            value={trxId}
            onChange={(e) => setTrxId(e.target.value)}
            placeholder="TRX ID"
          />
        </div>

        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full bg-gradient-to-br from-[#e52b80] to-[#f05463] font-bold"
        >
          {submitting ? "জমা হচ্ছে..." : "জমা দাও"}
        </Button>
      </div>
    </div>
  );
};

export default CourseBuy;
