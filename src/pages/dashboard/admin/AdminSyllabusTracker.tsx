import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, BookOpen, RefreshCw, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SyllabusEditor } from "@/components/admin/SyllabusEditor";

type StBox = "dashboard" | "syllabus" | "revision";

const AdminSyllabusTracker = () => {
  const [stBox, setStBox] = useState<StBox>("dashboard");

  useEffect(() => {
    document.title = "Study Tracker — Admin";
  }, []);

  const countOf = async (table: string, mode: string) => {
    const { count } = await (supabase.from as any)(table).select("id", { count: "exact", head: true }).eq("mode", mode);
    return count || 0;
  };
  const { data: dashCounts } = useQuery({
    queryKey: ["admin-st-dash-counts"],
    queryFn: async () => ({ hsc: await countOf("st_subjects", "hsc"), medical: await countOf("st_subjects", "medical"), varsity: await countOf("st_subjects", "varsity") }),
  });
  const { data: rvCounts } = useQuery({
    queryKey: ["admin-rv-dash-counts"],
    queryFn: async () => ({ hsc: await countOf("rv_subjects", "hsc"), medical: await countOf("rv_subjects", "medical"), varsity: await countOf("rv_subjects", "varsity") }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-sky-600" /> Study Tracker ম্যানেজার
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Syllabus এবং Revision কন্টেন্ট এখান থেকে ম্যানেজ করুন।
        </p>
      </div>

      {stBox === "dashboard" && (
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setStBox("syllabus")}
            className="text-left bg-card border rounded-xl p-4 cursor-pointer border-t-[3px]"
            style={{ borderTopColor: "#7C83FF" }}
          >
            <BookOpen className="h-5 w-5 mb-1.5" />
            <div className="font-bold text-sm mb-1">Syllabus Tracker</div>
            <div className="text-xs text-muted-foreground">HSC ও Medical বিষয়, অধ্যায়, টপিক</div>
            <div className="text-xs mt-2" style={{ color: "#7C83FF" }}>
              {dashCounts ? `HSC: ${dashCounts.hsc} · Medical: ${dashCounts.medical} · Varsity: ${dashCounts.varsity} বিষয়` : "লোড হচ্ছে..."}
            </div>
          </button>

          <button
            onClick={() => setStBox("revision")}
            className="text-left bg-card border rounded-xl p-4 cursor-pointer border-t-[3px]"
            style={{ borderTopColor: "#A855F7" }}
          >
            <RefreshCw className="h-5 w-5 mb-1.5" />
            <div className="font-bold text-sm mb-1">Revision Planner</div>
            <div className="text-xs text-muted-foreground">HSC ও Medical রিভিশন কন্টেন্ট</div>
            <div className="text-xs mt-2" style={{ color: "#A855F7" }}>
              {rvCounts ? `HSC: ${rvCounts.hsc} · Medical: ${rvCounts.medical} · Varsity: ${rvCounts.varsity} বিষয়` : "লোড হচ্ছে..."}
            </div>
          </button>
        </div>
      )}

      {stBox === "revision" && (
        <div className="space-y-4">
          <Button variant="outline" size="sm" onClick={() => setStBox("dashboard")} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <SyllabusEditor prefix="rv" />
        </div>
      )}

      {stBox === "syllabus" && (
        <div className="space-y-4">
          <Button variant="outline" size="sm" onClick={() => setStBox("dashboard")} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <SyllabusEditor prefix="st" />
        </div>
      )}
    </div>
  );
};

export default AdminSyllabusTracker;
