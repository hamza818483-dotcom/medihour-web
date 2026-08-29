import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
            .order("priority", { ascending: true })
            .order("created_at", { ascending: false });
          if (error) throw error;
          return data || [];
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {isLoading ? (
                    <p className="text-sm text-muted-foreground col-span-full">লোড হচ্ছে...</p>
                ) : !filteredCourses || filteredCourses.length === 0 ? (
                    <p className="text-sm text-muted-foreground col-span-full">
                        {courses && courses.length > 0 ? "এই ক্যাটাগরিতে কোনো কোর্স নেই।" : "বর্তমানে কোনো কোর্স চালু নেই।"}
                    </p>
                ) : (
                    filteredCourses.map((course: any) => {
                        const image = course.image_url || "/placeholder.svg";
                        const description = course.short_description || "";
                        const idOrSlug = course.slug || course.id;

                        // Handle array or string display
                        const categoryBadges = Array.isArray(course.category)
                            ? course.category
                            : (course.category ? [course.category] : []);

                        return (
                            <Card key={course.id} className="overflow-hidden flex flex-col h-full min-w-0 w-full max-w-full hover:-translate-y-1 transition-all duration-300">
                                {/* Course Image */}
                                <div className="w-full aspect-video relative">
                                    <img
                                        src={image}
                                        alt={`${course.name} cover`}
                                        className="absolute inset-0 h-full w-full object-cover"
                                    />
                                    {activeDiscounts?.some((d: any) => d.course_id === course.id) && (
                                        <div className="absolute top-0 left-0 w-24 h-24 overflow-hidden z-20">
                                            <div className="absolute top-4 -left-7 w-32 bg-red-600 shadow-lg text-white font-bold text-[10px] py-1 text-center truncate rotate-[-45deg] flex items-center justify-center gap-1 animate-[pulse_2s_cubic-bezier(0.4,0,0.6,1)_infinite] border-y border-red-400">
                                                <Tag className="w-3 h-3 fill-white" /> SALE
                                            </div>
                                        </div>
                                    )}
                                    <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
                                        {categoryBadges.map((cat: string) => (
                                            <Badge key={cat} className="bg-black/50 hover:bg-black/70 backdrop-blur-sm text-white border-0">
                                                {cat}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                                {/* Content */}
                                <div className="flex-1 p-5 flex flex-col justify-between gap-4">
                                    <div>
                                        <div className="flex justify-between items-start gap-2">
                                             <h3 className="text-lg font-bold mb-2 leading-tight">{course.name}</h3>
                                        </div>

                                        <p className="text-muted-foreground text-xs mb-4 line-clamp-3">{description}</p>
                                        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                                            <div className="flex items-center gap-1"><Check className="h-3 w-3 text-green-500" /> প্রিমিয়াম গাইডলাইন</div>
                                            <div className="flex items-center gap-1"><Check className="h-3 w-3 text-green-500" /> লিডারবোর্ড</div>
                                            <div className="flex items-center gap-1"><Check className="h-3 w-3 text-green-500" /> ইউনিক কন্টেন্ট</div>
                                            <div className="flex items-center gap-1"><Check className="h-3 w-3 text-green-500" /> ওয়ান টু ওয়ান মেন্টরিং</div>
                                            <div className="flex items-center gap-1"><Check className="h-3 w-3 text-green-500" /> র‍্যাপিড ফায়ার</div>
                                            <div className="flex items-center gap-1"><Check className="h-3 w-3 text-green-500" /> স্ট্যান্ডার্ড এক্সাম</div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-2 mt-auto pt-4 border-t border-dashed">
                                        <div className="flex flex-col items-start">
                                            {course.original_price != null && Number(course.original_price) > Number(course.price) && (
                                                <span className="text-[10px] text-muted-foreground line-through">
                                                    ৳{Number(course.original_price).toLocaleString("en-BD")}
                                                </span>
                                            )}
                                            <div className="text-base font-bold text-primary">
                                                {course.price != null ? `৳${Number(course.price).toLocaleString("en-BD")}` : "যোগাযোগ করুন"}
                                            </div>
                                        </div>
                                        <div className="flex gap-2 w-full">
                                            <Button asChild variant="outline" size="sm" className="h-8 px-2 text-xs flex-1">
                                                <a href={`/courses/${idOrSlug}`}>বিস্তারিত</a>
                                            </Button>
                                            <Button asChild size="sm" className="h-8 px-2 text-xs flex-1">
                                                <a href={`/courses/${idOrSlug}/buy`}>ভর্তি হন</a>
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        );
                    })
                )}
            </div>
        </section>
    );
};
