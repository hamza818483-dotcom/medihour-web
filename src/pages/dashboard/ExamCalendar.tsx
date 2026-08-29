import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, Calendar as CalendarIcon, Clock } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { bn } from "date-fns/locale";

const ExamCalendar = () => {
    const [searchQuery, setSearchQuery] = useState("");

    useEffect(() => {
        document.title = "Exam Routine – Atlas";
    }, []);

    const { data: schedules, isLoading } = useQuery({
        queryKey: ["public-exam-schedules"],
        queryFn: async () => {
            const { data, error } = await supabase
                .from("exam_schedules")
                .select("*")
                .order("exam_date", { ascending: true });
            if (error) throw error;
            return data || [];
        }
    });

    const filteredSchedules = schedules?.filter(s => 
        s.subject_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.paper_name?.toLowerCase().includes(searchQuery.toLowerCase())
    ) || [];

    const formatBengaliDate = (dateStr: string) => {
        try {
            return format(new Date(dateStr), "dd MMMM, yyyy", { locale: bn });
        } catch (e) {
            return dateStr;
        }
    };

    const getCountdown = (dateStr: string) => {
        const diff = differenceInDays(new Date(dateStr), new Date());
        if (diff === 0) return "আজ পরীক্ষা";
        if (diff < 0) return "পরীক্ষা শেষ";
        return `${diff} দিন বাকি`;
    };

    const groupedSchedules = filteredSchedules.reduce((acc: any, schedule) => {
        const category = schedule.category_name || "Uncategorized";
        if (!acc[category]) acc[category] = [];
        acc[category].push(schedule);
        return acc;
    }, {});

    return (
        <div className="w-full px-[5px] py-4 space-y-6 pb-20">
            <header className="px-2 space-y-1">
                <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2 text-primary">
                    <CalendarIcon className="h-5 w-5 md:h-6 md:w-6" /> পরীক্ষা রুটিন
                </h1>
                <p className="text-[10px] md:text-sm text-muted-foreground font-medium uppercase tracking-wider">রুটিন ও লাইভ কাউন্টডাউন</p>
            </header>

            <div className="px-2 space-y-4">
                <div className="relative w-full">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted-foreground">
                        <Search className="w-3.5 h-3.4" />
                    </div>
                    <input 
                        type="text" 
                        placeholder="বিষয় খুঁজুন..." 
                        className="w-full pl-9 pr-4 py-2 bg-muted/50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-xs shadow-sm h-9" 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            <div className="space-y-8">
                {isLoading ? (
                    <div className="py-20 text-center"><Clock className="animate-spin h-8 w-8 mx-auto text-primary/50" /></div>
                ) : Object.keys(groupedSchedules).length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground border-2 border-dashed rounded-xl text-xs italic mx-2">কোন রুটিন পাওয়া যায়নি।</div>
                ) : Object.keys(groupedSchedules).map((category) => (
                    <div key={category} className="space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-500">
                        <div className="flex items-center gap-2 px-2">
                             <div className="h-3 w-1 bg-indigo-600 rounded-full" />
                             <h3 className="text-sm md:text-lg font-bold text-foreground">{category}</h3>
                        </div>
                        
                        <div className="overflow-hidden rounded-xl border bg-card shadow-sm mx-1">
                            <div className="overflow-x-auto overflow-y-hidden">
                                <table className="w-full text-left border-collapse min-w-0">
                                    <thead>
                                        <tr className="bg-muted/40 border-b">
                                            <th className="p-2 md:p-4 font-bold text-muted-foreground text-[10px] md:text-sm">বিষয় ও পত্র</th>
                                            <th className="p-2 md:p-4 font-bold text-muted-foreground text-[10px] md:text-sm">তারিখ</th>
                                            <th className="p-2 md:p-4 font-bold text-muted-foreground text-[10px] md:text-sm text-right">বাকি</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-border/50">
                                        {groupedSchedules[category].map((schedule: any) => (
                                            <tr key={schedule.id} className="hover:bg-muted/30 transition-colors">
                                                <td className="p-2 md:p-4 font-bold text-foreground text-[11px] md:text-sm leading-tight">
                                                    <div className="flex flex-col gap-0.5">
                                                        <span>{schedule.subject_name}</span>
                                                        {schedule.paper_name && (
                                                            <span className="text-[8px] md:text-[10px] font-medium text-muted-foreground w-fit bg-muted px-1 rounded border border-border/30">
                                                                {schedule.paper_name}
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-2 md:p-4 font-medium text-muted-foreground text-[10px] md:text-sm whitespace-nowrap">
                                                    {formatBengaliDate(schedule.exam_date)}
                                                </td>
                                                <td className="p-2 md:p-4 text-[10px] md:text-xs font-bold text-right">
                                                    <span className={`inline-block px-1.5 py-0.5 md:px-2.5 md:py-1 rounded-md border whitespace-nowrap ${differenceInDays(new Date(schedule.exam_date), new Date()) < 7 ? 'bg-red-50 text-red-700 border-red-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'}`}>
                                                        {getCountdown(schedule.exam_date)}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            
            <div className="bg-primary/5 border border-primary/10 rounded-xl p-4">
                <p className="text-xs text-muted-foreground leading-relaxed">
                    <strong>দৃষ্টি আকর্ষণ:</strong> রুটিনে যেকোনো পরিবর্তনের জন্য কর্তৃপক্ষের সিদ্ধান্ত চূড়ান্ত বলে গণ্য হবে। নিয়মিত আপডেট পেতে আমাদের ফেসবুক গ্রুপে যুক্ত থাকুন।
                </p>
            </div>
        </div>
    );
};

export default ExamCalendar;
