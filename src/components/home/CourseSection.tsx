import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Check, Tag, Users } from "lucide-react";
import { Input } from "@/components/ui/input";

// Configuration: Add category names here to restrict the buttons shown on the landing page.
// Example: ["HSC 25", "HSC 26", "Engineering"]
// If empty, all categories from active courses will be shown.
const FEATURED_CATEGORIES: string[] = [];

export const CourseSection = () => {
    const [selectedCategory, setSelectedCategory] = useState<string>("all");
    const [selectedSubCategory, setSelectedSubCategory] = useState<string>("all");
    const [searchQuery, setSearchQuery] = useState<string>("");

    const { data: courses, isLoading } = useQuery({
        queryKey: ["public-courses"],
        queryFn: async () => {
          const { data, error } = await supabase
            .from("courses")
            .select("id, name, short_description, price, original_price, image_url, slug, is_active, category, sub_category, priority, sub_category_order")
            .eq("is_public", true)
            .eq("is_active", true)
            .order("priority", { ascending: true })
            .order("created_at", { ascending: false });
          if (error) throw error;
          return data || [];
        },
        staleTime: 5 * 60 * 1000,
    });

    const { data: enrollmentCounts } = useQuery({
        queryKey: ["course-enrollment-counts"],
        queryFn: async () => {
            const { data, error } = await supabase.rpc("get_all_course_enrollment_counts");
            if (error) {
                console.error("Error fetching enrollment counts:", error);
                return {} as Record<string, number>;
            }
            const counts: Record<string, number> = {};
            (data || []).forEach((row: any) => {
                counts[row.course_id] = row.enrollment_count;
            });
            return counts;
        },
        staleTime: 5 * 60 * 1000,
    });

    const { data: activeDiscounts } = useQuery({
        queryKey: ["active-special-discounts-all"],
        queryFn: async () => {
             const { data, error } = await (supabase.from as any)("promo_codes")
                 .select("course_id, course_ids")
                 .eq("is_active", true)
                 .not("special_discount_text", "is", null)
                 .neq("special_discount_text", "")
                 .or(`special_discount_deadline.is.null,special_discount_deadline.gt.${new Date().toISOString()}`);
             
             if (error) {
                 console.error("Error fetching active discounts:", error);
                 return [];
             }

             // Flatten results since promo_codes can have either course_id (legacy) or course_ids (array)
             const discountMeta = data?.flatMap(d => {
                 const ids = [];
                 if (d.course_id) ids.push(d.course_id);
                 if (d.course_ids && Array.isArray(d.course_ids)) {
                     ids.push(...d.course_ids);
                 }
                 return ids;
             }) || [];

             return Array.from(new Set(discountMeta)).map(id => ({ course_id: id }));
        },
        staleTime: 5 * 60 * 1000,
    });

    const { data: categoryOrder } = useQuery({
        queryKey: ["category-display-order"],
        queryFn: async () => {
            const { data } = await supabase.from("app_settings").select("value").eq("key", "category_order_global").maybeSingle();
            return (data?.value as string[]) || [];
        },
        staleTime: 5 * 60 * 1000,
    });

    // Extract unique categories and subcategories flattened from arrays
    let categories = Array.from(new Set(
        courses?.flatMap((c: any) =>
            Array.isArray(c.category) ? c.category : (c.category ? [c.category] : [])
        ) || []
    )).sort((a, b) => {
        // Respect admin's custom drag-order (Manage Course Position → All tab)
        // when set; unlisted names fall back to alphabetical, appended after.
        const order = categoryOrder || [];
        const iA = order.indexOf(a), iB = order.indexOf(b);
        if (iA !== -1 && iB !== -1) return iA - iB;
        if (iA !== -1) return -1;
        if (iB !== -1) return 1;
        return a.localeCompare(b);
    }) as string[];

    // Filter categories if configuration is set
    if (FEATURED_CATEGORIES.length > 0) {
        categories = categories.filter(c => FEATURED_CATEGORIES.includes(c));
    }

    // Filter courses based on selection and search
    const filteredCourses = courses?.filter((course: any) => {
        const courseCats = Array.isArray(course.category)
            ? course.category
            : (course.category ? [course.category] : []);

        const courseSubs = Array.isArray(course.sub_category)
            ? course.sub_category
            : (course.sub_category ? [course.sub_category] : []);

        if (selectedCategory !== "all" && !courseCats.includes(selectedCategory)) return false;
        if (selectedSubCategory !== "all" && !courseSubs.includes(selectedSubCategory)) return false;

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const nameMatch = course.name?.toLowerCase().includes(query);
            return nameMatch;
        }

        return true;
    });

    // When a specific sub-category tab is active, respect that sub-category's
    // own drag-ordered position (set via Admin → Courses → Manage Course
    // Position) instead of the single global "priority" — a course can be
    // #1 under "Full Course" but #5 under "GK-English".
    if (selectedSubCategory !== "all" && filteredCourses) {
        filteredCourses.sort((a: any, b: any) => {
            const orderA = a.sub_category_order?.[selectedSubCategory] ?? a.priority ?? 0;
            const orderB = b.sub_category_order?.[selectedSubCategory] ?? b.priority ?? 0;
            return orderA - orderB;
        });
    }

    const { data: subCategoryOrder } = useQuery({
        queryKey: ["sub-category-display-order"],
        queryFn: async () => {
            const { data } = await supabase.from("app_settings").select("value").eq("key", "sub_category_order_global").maybeSingle();
            return (data?.value as string[]) || [];
        },
        staleTime: 5 * 60 * 1000,
    });

    // Get subcategories for the selected category (or all if no category selected)
    const availableSubCategories = Array.from(new Set(
        courses
            ?.filter((c: any) => {
                 const courseCats = Array.isArray(c.category)
                    ? c.category
                    : (c.category ? [c.category] : []);
                return selectedCategory === "all" || courseCats.includes(selectedCategory);
            })
            .flatMap((c: any) =>
                Array.isArray(c.sub_category) ? c.sub_category : (c.sub_category ? [c.sub_category] : [])
            )
            .filter(Boolean) || []
    )).sort((a, b) => {
        // Respect admin's custom drag-order (Manage Course Position →
        // Sub-Category Order) when set; unlisted names fall back to
        // alphabetical, appended after the ordered ones.
        const order = subCategoryOrder || [];
        const iA = order.indexOf(a), iB = order.indexOf(b);
        if (iA !== -1 && iB !== -1) return iA - iB;
        if (iA !== -1) return -1;
        if (iB !== -1) return 1;
        return a.localeCompare(b);
    }) as string[];

    // Reset subcategory when category changes if it's no longer valid
    useEffect(() => {
        if (selectedCategory !== "all" && selectedSubCategory !== "all") {
             // Check if any course has BOTH selectedCategory AND selectedSubCategory
             const isValid = courses?.some((c: any) => {
                 const courseCats = Array.isArray(c.category) ? c.category : [c.category];
                 const courseSubs = Array.isArray(c.sub_category) ? c.sub_category : [c.sub_category];
                 return courseCats.includes(selectedCategory) && courseSubs.includes(selectedSubCategory);
             });

             if (!isValid) setSelectedSubCategory("all");
        }
    }, [selectedCategory, courses]);

    return (
        <section id="courses" className="space-y-6 w-[1px] min-w-full">
            <div className="flex flex-col gap-6">
                <div className="flex flex-col items-center justify-center text-center gap-2">
                    <h2 className="text-3xl font-bold tracking-tight text-primary relative inline-block">
                        চলমান কোর্স সমূহ
                        <span className="absolute left-0 -bottom-2 w-full h-1 bg-primary rounded-full"></span>
                    </h2>

                    {/* Search Input */}
                    <div className="w-full max-w-2xl mt-4">
                        <Input
                            type="text"
                            placeholder="কোর্স খুঁজুন..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="bg-white"
                        />
                    </div>
                </div>

                {/* Filters using Visible Buttons */}
                <div className="space-y-4 w-full">
                    <div className="flex flex-col items-center gap-4">

                        {/* Category Buttons */}
                        <div className="w-full">
                            <div className="flex flex-wrap justify-center gap-2 md:gap-3">
                                <Button
                                    variant={selectedCategory === "all" ? "default" : "outline"}
                                    onClick={() => setSelectedCategory("all")}
                                    className={`px-3 h-8 text-xs md:px-6 md:h-10 md:text-sm border transition-all ${
                                        selectedCategory === "all"
                                        ? "bg-green-600 hover:bg-green-700 text-white border-green-600 shadow-md"
                                        : "bg-transparent hover:bg-green-50 text-foreground border-border hover:border-green-200"
                                    }`}
                                >
                                    সব
                                </Button>
                                {categories.map((cat: string) => (
                                    <Button
                                        key={cat}
                                        variant={selectedCategory === cat ? "default" : "outline"}
                                        onClick={() => setSelectedCategory(cat)}
                                        className={`px-3 h-8 text-xs md:px-6 md:h-10 md:text-sm border transition-all ${
                                            selectedCategory === cat
                                            ? "bg-green-600 hover:bg-green-700 text-white border-green-600 shadow-md"
                                            : "bg-transparent hover:bg-green-50 text-foreground border-border hover:border-green-200"
                                        }`}
                                    >
                                        {cat}
                                    </Button>
                                ))}
                            </div>
                        </div>

                        {/* Sub Category Buttons (Secondary Filter) */}
                        {availableSubCategories.length > 0 && (
                            <div className="w-full">
                                <div className="flex flex-wrap justify-center gap-2 md:gap-3">
                                    <Button
                                        variant={selectedSubCategory === "all" ? "default" : "outline"}
                                        onClick={() => setSelectedSubCategory("all")}
                                        className={`px-3 h-8 text-xs md:px-6 md:h-10 md:text-sm border transition-all ${
                                            selectedSubCategory === "all"
                                            ? "bg-green-600 hover:bg-green-700 text-white border-green-600 shadow-sm"
                                            : "bg-transparent hover:bg-green-50 text-foreground border-border hover:border-green-200"
                                        }`}
                                    >
                                        সব টাইপ
                                    </Button>
                                    {availableSubCategories.map((sub: string) => (
                                        <Button
                                            key={sub}
                                            variant={selectedSubCategory === sub ? "default" : "outline"}
                                            onClick={() => setSelectedSubCategory(sub)}
                                            className={`px-3 h-8 text-xs md:px-6 md:h-10 md:text-sm border transition-all ${
                                                selectedSubCategory === sub
                                                ? "bg-green-600 hover:bg-green-700 text-white border-green-600 shadow-sm"
                                                : "bg-transparent hover:bg-green-50 text-foreground border-border hover:border-green-200"
                                            }`}
                                        >
                                            {sub}
                                        </Button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {isLoading ? (
                    <p className="text-sm text-muted-foreground col-span-full">লোড হচ্ছে...</p>
                ) : !filteredCourses || filteredCourses.length === 0 ? (
                    <p className="text-sm text-muted-foreground col-span-full">
                        {courses && courses.length > 0 ? "এই ক্যাটাগরিতে কোনো কোর্স নেই।" : "বর্তমানে কোনো কোর্স চালু নেই।"}
                    </p>
                ) : (
                    filteredCourses.map((course: any) => {
                        const image = course.image_url || "/placeholder.svg";
                        const idOrSlug = course.slug || course.id;
                        const enrollCount = enrollmentCounts?.[course.id] || 0;

                        return (
                            <article
                                key={course.id}
                                className="group relative w-full rounded-[24px] p-[2px] shadow-[0_0_0_1px_rgba(0,0,0,0.85),0_8px_25px_rgba(0,0,0,0.1)] transition-transform duration-300 hover:-translate-y-[7px] hover:shadow-[0_0_0_1px_rgba(0,0,0,0.95),0_15px_35px_rgba(37,99,235,0.16)]"
                                style={{
                                    background: "linear-gradient(120deg, #111 0%, #2563eb 25%, #111 50%, #60a5fa 75%, #111 100%)",
                                    backgroundSize: "350% 350%",
                                    animation: "phStrongBorderMove 5s linear infinite",
                                }}
                            >
                                <div className="relative flex h-full w-full flex-col overflow-hidden rounded-[22px] bg-white shadow-[inset_0_0_0_1px_rgba(20,20,20,0.1)] dark:bg-slate-900">
                                    {/* Thumbnail */}
                                    <div className="relative w-full overflow-hidden bg-[#f1f2f4]" style={{ aspectRatio: "16/9" }}>
                                        <img
                                            src={image}
                                            alt={course.name}
                                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.045]"
                                        />
                                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/[0.02] via-transparent to-black/[0.12]" />
                                        {activeDiscounts?.some((d: any) => d.course_id === course.id) && (
                                            <div className="absolute top-0 left-0 z-20 h-24 w-24 overflow-hidden">
                                                <div className="absolute top-4 -left-7 flex w-32 rotate-[-45deg] animate-pulse items-center justify-center gap-1 truncate border-y border-red-400 bg-red-600 py-1 text-center text-[10px] font-bold text-white shadow-lg">
                                                    <Tag className="h-3 w-3 fill-white" /> SALE
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Body */}
                                    <div className="flex flex-1 flex-col px-4 pb-4 pt-4">
                                        <h3 className="mb-2.5 text-[16px] font-extrabold leading-[1.35] tracking-[-0.15px] text-[#171b1c] line-clamp-2 dark:text-white">
                                            {course.name}
                                        </h3>

                                        {/* Enrollment meta */}
                                        <div className="mb-2.5 flex w-full items-center">
                                            <div className="inline-flex items-center gap-2 rounded-[11px] border border-[#dce4f5] bg-gradient-to-br from-[#f5f8ff] to-white py-1 pl-1 pr-3 shadow-[0_4px_14px_rgba(0,0,0,0.055)] dark:border-white/10 dark:from-slate-800 dark:to-slate-800">
                                                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[8px] border border-[#c7d7f7] bg-[#eef2ff]">
                                                    <Users className="h-[14px] w-[14px] text-[#2563eb]" />
                                                </span>
                                                <span className="flex items-baseline gap-1 whitespace-nowrap">
                                                    <span className="text-[14px] font-black leading-none text-[#2563eb]">{enrollCount.toLocaleString("en-BD")}</span>
                                                    <span className="text-[11px] font-bold text-[#45484d] dark:text-slate-300">জন ভর্তি</span>
                                                </span>
                                            </div>
                                        </div>

                                        {/* Divider */}
                                        <div className="mb-2.5 h-px w-full bg-gradient-to-r from-[#eee] via-[#dce4f5] to-[#eee]" />

                                        {/* Price + Button */}
                                        <div className="mt-auto flex w-full items-center justify-between gap-3">
                                            <div className="flex min-w-0 flex-col gap-0.5">
                                                <p className="m-0 text-[10px] font-semibold text-[#858a91]">কোর্স ফি</p>
                                                {course.original_price != null && Number(course.original_price) > Number(course.price) && (
                                                    <del className="text-[12px] font-semibold leading-none text-[#a5a8ad]">৳{Number(course.original_price).toLocaleString("en-BD")}</del>
                                                )}
                                                <p className="m-0 text-[21px] font-black leading-[1.1] tracking-[-0.4px] text-[#2563eb]">
                                                    {course.price != null ? `৳${Number(course.price).toLocaleString("en-BD")}` : "যোগাযোগ করুন"}
                                                </p>
                                            </div>
                                            <a
                                                href={`/courses/${idOrSlug}`}
                                                className="group/btn relative flex min-w-[110px] flex-shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-[12px] bg-gradient-to-br from-[#3b82f6] to-[#1d4ed8] px-4 py-2.5 text-[12px] font-extrabold text-white shadow-[0_8px_20px_rgba(37,99,235,0.22)] transition-all hover:-translate-y-[3px] hover:shadow-[0_12px_28px_rgba(37,99,235,0.32)]"
                                            >
                                                <span className="absolute -left-[120%] top-0 h-full w-4/5 -skew-x-[20deg] bg-gradient-to-r from-transparent via-white/35 to-transparent transition-all duration-500 group-hover/btn:left-[140%]" />
                                                <span className="relative z-[1]">বিস্তারিত</span>
                                                <span className="relative z-[1] text-base font-black transition-transform group-hover/btn:translate-x-1">→</span>
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </article>
                        );
                    })
                )}
            </div>
        </section>
    );
};
