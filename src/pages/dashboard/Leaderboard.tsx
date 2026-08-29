import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useEnrollments } from "@/hooks/useEnrollments";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Trophy, BadgeAlert, Download, FileText, Star, Scale, CheckCircle2, XCircle, MinusCircle, Clock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const Podium = ({ topThree, isStaff }: { topThree: any[], isStaff: boolean }) => {
    if (!topThree || topThree.length === 0) return null;

    const first = topThree[0];
    const second = topThree[1];
    const third = topThree[2];

    const PodiumItem = ({ student, rank, color, height, glowColor, zIndex, CrownIcon }: { student: any, rank: number, color: string, height: string, glowColor: string, zIndex: number, CrownIcon?: boolean }) => {
        if (!student) return <div className="w-24 sm:w-32 hidden md:block"></div>;

        return (
            <div className={`flex flex-col items-center justify-end mx-0.5 sm:mx-1.5 md:mx-2`} style={{ zIndex }}>
                <div className="relative mb-1.5 flex flex-col items-center group">
                    {/* Crown for 1st place */}
                    {CrownIcon && (
                         <div className="absolute -top-5 text-yellow-400 drop-shadow-md z-20 animate-bounce">
                             <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-crown"><path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.956-.734L2.02 6.02a.5.5 0 0 1 .798-.518l4.276 3.664a1 1 0 0 0 1.516-.294z"/><path d="M5 21h14"/></svg>
                         </div>
                    )}
                    
                    {/* Avatar with glowing ring */}
                    <div className={`relative p-0.5 rounded-lg bg-gradient-to-br ${color} shadow-md transition-transform duration-300 group-hover:scale-110`}>
                        <Avatar className="w-11 h-11 sm:w-14 sm:h-14 lg:w-16 lg:h-16 rounded-md border-2 border-background bg-background shadow-inner">
                            <AvatarImage src={student.profile?.avatar_url} className="rounded-md" />
                            <AvatarFallback className="rounded-md text-sm font-bold bg-muted text-foreground">
                                {student.profile?.full_name?.slice(0, 2)?.toUpperCase() || "??"}
                            </AvatarFallback>
                        </Avatar>
                        
                        {/* Score badge overlapping the avatar */}
                        <div className={`absolute -bottom-2 left-1/2 transform -translate-x-1/2 px-2 py-0.5 rounded-full text-[10px] font-bold text-white shadow-md whitespace-nowrap bg-gradient-to-r ${color}`}>
                            {student.score} marks
                        </div>
                    </div>
                </div>

                <div className="text-center mb-1.5 max-w-[90px] sm:max-w-[120px]">
                    <div className="font-bold text-xs sm:text-sm text-foreground leading-tight break-words drop-shadow-sm" title={student.profile?.full_name}>
                        {student.profile?.full_name ? student.profile.full_name.split(" ").map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ") : "Unknown"}
                    </div>
                    {isStaff && student.time_taken_seconds && (
                         <div className="text-[9px] text-muted-foreground font-mono">
                             {Math.floor(student.time_taken_seconds / 60)}m {student.time_taken_seconds % 60}s
                         </div>
                    )}
                </div>

                {/* The 3D Podium Block */}
                <div 
                    className={`w-16 sm:w-20 lg:w-24 rounded-t-lg relative flex items-start justify-center pt-2 sm:pt-3 transition-all duration-500 hover:brightness-110 overflow-hidden text-white shadow-[0_-5px_25px_-5px_rgba(0,0,0,0.1)] bg-gradient-to-b ${color}`} 
                    style={{ height, boxShadow: `0 -5px 25px -5px ${glowColor}` }}
                >
                    {/* Glossy overlay effect */}
                    <div className="absolute inset-0 bg-gradient-to-b from-white/30 to-transparent pointer-events-none"></div>
                    <span className="font-black text-xl sm:text-2xl lg:text-4xl drop-shadow-md z-10 opacity-90">{rank}</span>
                </div>
            </div>
        );
    };

    return (
        <div className="relative flex justify-center items-end pt-6 pb-1 px-2 mb-1 bg-gradient-to-t from-slate-100/50 to-transparent dark:from-slate-900/50 rounded-xl mx-auto overflow-hidden">
            {/* Background decorations */}
            <div className="absolute top-6 left-8 text-yellow-300 opacity-50"><Star size={16} fill="currentColor" /></div>
            <div className="absolute top-10 right-10 text-blue-300 opacity-40"><Star size={12} fill="currentColor" /></div>
            <div className="absolute top-3 right-1/4 text-pink-300 opacity-60"><Star size={14} fill="currentColor" /></div>
            
            <PodiumItem student={second} rank={2} color="from-slate-400 to-slate-500" glowColor="rgba(148, 163, 184, 0.5)" height="70px" zIndex={20} />
            <PodiumItem student={first} rank={1} color="from-yellow-400 to-amber-500" glowColor="rgba(250, 204, 21, 0.6)" height="95px" zIndex={30} CrownIcon={true} />
            <PodiumItem student={third} rank={3} color="from-orange-400 to-orange-600" glowColor="rgba(249, 115, 22, 0.5)" height="55px" zIndex={10} />
        </div>
    );
};

const Leaderboard = () => {
  const { user, isAdmin, isTeacher } = useAuth();
  const { data: enrollments } = useEnrollments();
  const { examId } = useParams();
  const isStaff = isAdmin || isTeacher;
  const navigate = useNavigate();
  const [filterType, setFilterType] = useState<'live' | 'practice'>('live');
  const [compareTargetId, setCompareTargetId] = useState<string | null>(null);
  const [compareOpen, setCompareOpen] = useState(false);

  useEffect(() => {
    document.title = "Leaderboard – Atlas";
  }, []);

  const { data: exam } = useQuery({
    queryKey: ["exam-details", examId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exams")
        .select("*")
        .eq("id", examId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Calculate Access using useEnrollments (which handles linked courses)
  const hasAccess = (() => {
      if (!exam) return undefined; // Loading state essentially
      if (!exam.course_id) return true; // Public
      if (isStaff) return true;

      const enrolledIds = enrollments?.map(e => e.course_id) || [];
      if (enrolledIds.includes(exam.course_id)) return true;

      // Check shared courses if available in exam object (assuming standard field)
      // @ts-ignore
      if (exam.shared_course_ids && Array.isArray(exam.shared_course_ids)) {
          // @ts-ignore
          if (exam.shared_course_ids.some(id => enrolledIds.includes(id))) return true;
      }

      return false;
  })();

  const { data: leaderboardData, isLoading } = useQuery({
    queryKey: ["leaderboard", examId, filterType],
    queryFn: async () => {
      const MAX_ROWS = 5000;
      let allData: any[] = [];
      let from = 0;
      const chunkSize = 1000;
      let total = 0;

      while (true) {
        let query = (supabase as any)
          .from('leaderboard_exam_attempts')
          .select('*', { count: 'exact' })
          .eq('exam_id', examId);

        if (filterType === 'live') {
          query = query.eq('attempt_type', 'live');
        } else {
          query = query.or('attempt_type.eq.practice,attempt_type.is.null');
        }

        const { data, error, count } = await query
          .order('score', { ascending: false })
          .order('time_taken_seconds', { ascending: true, nullsFirst: false })
          .order('submitted_at', { ascending: true })
          .range(from, from + chunkSize - 1);

        if (error) throw error;

        allData = allData.concat(data || []);
        total = count || 0;
        from += chunkSize;

        if (!data || data.length < chunkSize || allData.length >= total || allData.length >= MAX_ROWS) break;
      }

      return { data: allData, count: total };
    },
    enabled: !!exam,
  });

  // Automatically switch to practice view if exam is practice type
  useEffect(() => {
    if (exam?.exam_type === 'practice') {
      setFilterType('practice');
    }
  }, [exam?.exam_type]);

  const leaderboard = leaderboardData?.data || [];
  const totalCount = leaderboardData?.count || 0;

  // Top 3 for Podium
  const topThree = leaderboard.slice(0, 3);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const myAttempt = leaderboard.find((a: any) => a.profile_id === user?.id);
  const myAttemptId = myAttempt?.id || null;

  const comparePairIds = compareTargetId && myAttemptId ? [myAttemptId, compareTargetId] : [];

  const { data: compareData, isLoading: compareLoading } = useQuery({
    queryKey: ["leaderboard-compare", comparePairIds],
    queryFn: async () => {
      const { data: attempts, error: aError } = await (supabase as any)
        .from("exam_attempts")
        .select("*")
        .in("id", comparePairIds);
      if (aError) throw aError;

      const { data: questions, error: qError } = await (supabase as any)
        .from("exam_questions")
        .select("id, correct_option, marks")
        .eq("exam_id", examId);
      if (qError) throw qError;

      const questionsMap = new Map((questions || []).map((q: any) => [q.id, q]));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const statsUnordered = (attempts || []).map((att: any) => {
        let correct = 0, wrong = 0, skipped = 0;
        const answeredIds = new Set((att.answers || []).map((a: any) => a.question_id));

        (att.answers || []).forEach((ans: any) => {
          const q = questionsMap.get(ans.question_id);
          if (!q) return;
          if (!ans.selected_option) skipped++;
          else if (ans.selected_option === q.correct_option) correct++;
          else wrong++;
        });

        const totalQ = questions?.length || 0;
        const unanswered = Math.max(0, totalQ - answeredIds.size);

        return {
          attemptId: att.id,
          profileId: att.profile_id,
          score: att.score,
          time_taken_seconds: att.time_taken_seconds,
          violation_count: att.violation_count || 0,
          correct,
          wrong,
          skipped: skipped + unanswered,
          totalQ,
        };
      });

      // Ensure order: [me, target]
      const me = statsUnordered.find((s: any) => s.attemptId === myAttemptId);
      const target = statsUnordered.find((s: any) => s.attemptId === compareTargetId);
      return me && target ? [me, target] : statsUnordered;
    },
    enabled: compareOpen && comparePairIds.length === 2,
  });

  const openCompare = (attemptId: string) => {
    setCompareTargetId(attemptId);
    setCompareOpen(true);
  };

  const getAttemptDisplay = (attemptId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return leaderboard.find((a: any) => a.id === attemptId);
  };

  const formatDurationShort = (seconds: number) => {
    if (!seconds) return "-";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  const capitalizeName = (name: string) => {
    if (!name) return "Unknown";
    return name
      .split(" ")
      .map(w => w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)
      .join(" ");
  };

  const displayCollegeName = (name: string) => {
    if (!name) return "-";
    const words = name.trim().split(/\s+/).filter(w => w.length > 0);
    if (words.length > 1) {
      return words.map(w => w.charAt(0).toUpperCase()).join("");
    }
    return name.toUpperCase();
  };

  const buildVerdict = () => {
    if (!compareData || compareData.length < 2) return [];
    const [a, b] = compareData;
    const nameA = getAttemptDisplay(a.attemptId)?.profile?.full_name || "প্রথম শিক্ষার্থী";
    const nameB = getAttemptDisplay(b.attemptId)?.profile?.full_name || "দ্বিতীয় শিক্ষার্থী";

    const points: string[] = [];

    if (a.score !== b.score) {
      const leader = a.score > b.score ? nameA : nameB;
      const diff = Math.abs(a.score - b.score);
      points.push(`স্কোরে ${leader} ${diff} নম্বর এগিয়ে আছে।`);
    } else {
      points.push("দুইজনের স্কোর সমান।");
    }

    if (a.correct !== b.correct) {
      const leader = a.correct > b.correct ? nameA : nameB;
      points.push(`${leader}-এর সঠিক উত্তর বেশি (${Math.max(a.correct, b.correct)}টি বনাম ${Math.min(a.correct, b.correct)}টি)।`);
    } else {
      points.push(`দুইজনের সঠিক উত্তরের সংখ্যা সমান (${a.correct}টি)।`);
    }

    if (a.wrong !== b.wrong) {
      const worse = a.wrong > b.wrong ? nameA : nameB;
      points.push(`${worse}-এর ভুল উত্তর বেশি, তাই accuracy বাড়ানো দরকার।`);
    } else {
      points.push(`দুইজনের ভুল উত্তরের সংখ্যা সমান (${a.wrong}টি)।`);
    }

    if (a.skipped !== b.skipped) {
      const more = a.skipped > b.skipped ? nameA : nameB;
      points.push(`${more} বেশি প্রশ্ন বাদ দিয়েছে — সময় ব্যবস্থাপনায় নজর দেওয়া দরকার।`);
    }

    if (a.time_taken_seconds && b.time_taken_seconds && a.time_taken_seconds !== b.time_taken_seconds) {
      const faster = a.time_taken_seconds < b.time_taken_seconds ? nameA : nameB;
      points.push(`${faster} কম সময়ে পরীক্ষা শেষ করেছে।`);
    }

    if (a.violation_count !== b.violation_count) {
      const more = a.violation_count > b.violation_count ? nameA : nameB;
      points.push(`${more}-এর ওয়ার্নিং/ভায়োলেশন বেশি, পরীক্ষার নিয়ম মেনে চলার দিকে মনোযোগ দিতে হবে।`);
    }

    // Overall suggestion
    const scoreLeader = a.score >= b.score ? a : b;
    const scoreLeaderName = scoreLeader === a ? nameA : nameB;
    const scoreLoserName = scoreLeader === a ? nameB : nameA;
    if (a.score !== b.score) {
      points.push(`পরামর্শ: ${scoreLoserName}-কে ${scoreLeaderName}-এর মতো বেশি প্র্যাকটিস প্রশ্ন সম্পন্ন করা এবং তাড়াহুড়ো না করে চিন্তা করে সঠিক উত্তর দেওয়ার অভ্যাস গড়ে তুলতে হবে।`);
    } else {
      points.push("পরামর্শ: দুইজনেরই পারফরম্যান্স কাছাকাছি — accuracy আরও বাড়াতে বেশি প্র্যাকটিস প্রশ্ন সমাধান করা উচিত।");
    }

    return points;
  };

  const handleExportCSV = async () => {
      try {
          // Fetch ALL records for export, not just paginated
          let query = (supabase as any)
            .from('leaderboard_exam_attempts')
            .select('*')
            .eq('exam_id', examId);

          if (filterType === 'live') {
            query = query.eq('attempt_type', 'live');
          } else {
            query = query.or('attempt_type.eq.practice,attempt_type.is.null');
          }

          const { data, error } = await query
            .order('score', { ascending: false })
            .order('time_taken_seconds', { ascending: true, nullsFirst: false })
            .order('submitted_at', { ascending: true });

          if (error) throw error;
          if (!data || data.length === 0) {
              alert("No data to export");
              return;
          }

          // Generate CSV
          const headers = ["Rank", "Name", "Registration ID", "Score", "Time Taken (sec)", "Submitted At", "Attempt No", "Warnings"];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rows = data.map((item: any, idx: number) => {
              const regId = item.profile?.registration_id || "";
              const maskedRegId = isStaff ? regId : (regId.length >= 4 ? "**" + regId.slice(-4) : regId);

              return [
                idx + 1,
                item.profile?.full_name || "Unknown",
                maskedRegId,
                item.score,
                item.time_taken_seconds || "-",
                new Date(item.submitted_at).toLocaleString(),
                item.attempt_number || 1,
                item.violation_count || 0
              ];
          });

          const csvContent = [
              headers.join(","),
              ...rows.map(r => r.map(c => `"${c}"`).join(","))
          ].join("\n");

          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.setAttribute("href", url);
          link.setAttribute("download", `${exam?.title}_leaderboard_${filterType}.csv`);
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

      } catch (err) {
          console.error(err);
          alert("Failed to export");
      }
  };

  const handlePrintPDF = async (isFullAdminReport = false) => {
      try {
          // 1. Fetch Exam Questions (to grade)
          const { data: questions, error: qError } = await supabase
              .from('exam_questions')
              .select('id, correct_option')
              .eq('exam_id', examId);

          if (qError) throw qError;
          const questionsMap = new Map(questions.map(q => [q.id, q.correct_option]));

          // 2. Fetch Attempts with Answers & Profile details
          // We fetch from leaderboard_exam_attempts to ensure we get the correct profile data structure
          // BUT we also need 'answers' which is only in exam_attempts.
          // Solution: Fetch from exam_attempts but join profile correctly or check why profile might be null.
          // The issue "name and hsc batch not coming" means attempt.profile is likely null.
          // This happens if the user enrolled but doesn't have a full profile or RLS blocks it.
          // However, the main leaderboard UI works (fetching from leaderboard_exam_attempts view).
          // Let's use the view for profile data and join attempts for answers if needed, OR just trust the view has everything except answers.
          // Actually, the view `leaderboard_exam_attempts` usually aggregates data.
          // Let's try fetching from the VIEW first to see if that fixes the data visibility.

          let query = (supabase as any)
            .from('leaderboard_exam_attempts')
            .select('*')
            .eq('exam_id', examId);

           if (filterType === 'live') {
                query = query.eq('attempt_type', 'live');
           } else {
                query = query.or('attempt_type.eq.practice,attempt_type.is.null');
           }

           const { data: attempts, error: aError } = await query
                .order('score', { ascending: false })
                .order('time_taken_seconds', { ascending: true, nullsFirst: false })
                .order('submitted_at', { ascending: true });

           if (aError) throw aError;
           if (!attempts || attempts.length === 0) {
               alert("No data to export");
               return;
           }

           const escapeHtml = (unsafe: string) => {
               return unsafe
                    .replace(/&/g, "&amp;")
                    .replace(/</g, "&lt;")
                    .replace(/>/g, "&gt;")
                    .replace(/"/g, "&quot;")
                    .replace(/'/g, "&#039;");
           };

           const title = escapeHtml(`${exam?.title} (${filterType === 'live' ? 'Live Exam' : 'Practice Exam'})${isFullAdminReport ? ' - Full Admin Report' : ''}`);

           // 3. Construct HTML
           let rowsHtml = '';
           // eslint-disable-next-line @typescript-eslint/no-explicit-any
           attempts.forEach((attempt: any, index: number) => {
               const name = escapeHtml(attempt.profile?.full_name || "Unknown");
               const regIdRaw = attempt.profile?.registration_id || ""
               const regIdMasked = isFullAdminReport ? regIdRaw : (regIdRaw.length >= 4 ? "**" + regIdRaw.slice(-4) : (regIdRaw || "-"));
               const hsc = escapeHtml(attempt.profile?.hsc_batch || "-");
               const college = escapeHtml(attempt.profile?.college_name || attempt.profile?.school || "-");
               const warnings = attempt.violation_count || 0;

               const formatDurationPrint = (seconds: number) => {
                   if (!seconds) return "-";
                   const m = Math.floor(seconds / 60);
                   const s = seconds % 60;
                   return `${m}m ${s}s`;
               };

               rowsHtml += `
               <tr>
                   <td class="text-center"><span class="rank-badge">${index + 1}</span></td>
                   <td style="font-weight: 600;">${name}</td>
                   <td class="text-center font-mono text-xs" style="color: #6b7280;">${regIdMasked}</td>
                   <td class="text-center font-bold" style="color: #10b981;">${attempt.score}</td>
                   ${isFullAdminReport ? `<td class="text-center font-mono text-xs" style="color: #6b7280;">${formatDurationPrint(attempt.time_taken_seconds)}</td>` : ''}
                   <td class="text-center" style="color: #6b7280;">${hsc}</td>
                   <td class="text-center" style="color: #4b5563;">${college}</td>
                   ${isFullAdminReport ? `<td class="text-center" style="color: ${warnings > 0 ? '#ef4444' : '#9ca3af'}; font-weight: ${warnings > 0 ? 'bold' : 'normal'};">${warnings > 0 ? warnings : '-'}</td>` : ''}
               </tr>`;
           });

           const htmlContent = `
            <!DOCTYPE html>
            <html lang="bn">
            <head>
                <meta charset="UTF-8">
                <title>${title}</title>
                <style>
                    @font-face {
                        font-family: 'SolaimanLipi';
                        src: url('${window.location.origin}/SolaimanLipi.ttf') format('truetype');
                    }
                    @page {
                        size: A4;
                        margin: 15mm;
                        @bottom-right {
                            content: "Page " counter(page) " of " counter(pages);
                            font-family: sans-serif;
                            font-size: 10px;
                            color: #9ca3af;
                        }
                    }
                    body {
                        font-family: 'SolaimanLipi', sans-serif;
                        margin: 0;
                        padding: 0;
                        color: #1f2937;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                        position: relative;
                    }
                    
                    /* The Watermark */
                    .watermark {
                        position: fixed;
                        top: 50%;
                        left: 50%;
                        transform: translate(-50%, -50%);
                        width: 70%;
                        height: 70%;
                        background-image: url('${window.location.origin}/logo.png');
                        background-repeat: no-repeat;
                        background-position: center;
                        background-size: contain;
                        opacity: 0.10; /* Making it more visible */
                        z-index: -1;
                        pointer-events: none;
                    }

                    .header-container {
                        display: flex;
                        align-items: center;
                        justify-content: space-between;
                        border-bottom: 2px solid #e5e7eb;
                        padding-bottom: 16px;
                        margin-bottom: 24px;
                    }
                    .header-left h1 {
                        color: #10b981;
                        font-size: 26px;
                        margin: 0 0 4px 0;
                        font-weight: 800;
                    }
                    .header-left p {
                        margin: 0;
                        color: #6b7280;
                        font-size: 13px;
                    }
                    .header-right {
                        text-align: right;
                    }
                    .header-right img {
                        height: 48px;
                        object-fit: contain;
                    }

                    table {
                        width: 100%;
                        border-collapse: collapse;
                        font-size: 13px;
                    }
                    thead { display: table-header-group; }
                    tfoot { display: table-footer-group; }
                    tr {
                        break-inside: avoid;
                        page-break-inside: avoid;
                    }
                    
                    /* Modern Table Styling */
                    th {
                        background-color: #f3f4f6 !important;
                        color: #374151 !important;
                        padding: 8px 6px; /* Reduced gap */
                        font-weight: 700;
                        text-align: center;
                        border-bottom: 2px solid #d1d5db !important;
                        text-transform: uppercase;
                        font-size: 11px;
                        letter-spacing: 0.05em;
                    }
                    th:first-child { border-top-left-radius: 6px; border-bottom-left-radius: 6px; }
                    th:last-child { border-top-right-radius: 6px; border-bottom-right-radius: 6px; }
                    th:nth-child(2) { text-align: left; }
                    
                    td {
                        padding: 8px 6px; /* Reduced gap */
                        border-bottom: 1px solid #d1d5db !important; /* Made divider darker and forced */
                        color: #111827;
                    }
                    td:nth-child(2) { text-align: left; font-weight: 500; }
                    
                    body table tbody tr {
                        background-color: transparent !important;
                    }

                    /* Top 3 Highlighting */
                    tbody tr:nth-child(1) td { background-color: rgba(16, 185, 129, 0.12) !important; border-bottom: 1px solid #d1d5db !important; }
                    tbody tr:nth-child(2) td { background-color: rgba(16, 185, 129, 0.06) !important; border-bottom: 1px solid #d1d5db !important; }
                    tbody tr:nth-child(3) td { background-color: rgba(16, 185, 129, 0.03) !important; border-bottom: 1px solid #d1d5db !important; }

                    .text-center { text-align: center; }
                    
                    /* Rank badges */
                    .rank-badge {
                        display: inline-block;
                        width: 20px;
                        height: 20px;
                        line-height: 20px;
                        text-align: center;
                        border-radius: 50%;
                        background-color: #f3f4f6;
                        color: #374151;
                        font-weight: bold;
                        font-size: 10px;
                    }
                    tbody tr:nth-child(1) .rank-badge { background-color: #fbbf24 !important; color: white !important; }
                    tbody tr:nth-child(2) .rank-badge { background-color: #9ca3af !important; color: white !important; }
                    tbody tr:nth-child(3) .rank-badge { background-color: #f97316 !important; color: white !important; }

                    .footer {
                        margin-top: 30px;
                        text-align: center;
                        font-size: 11px;
                        color: #6b7280;
                        border-top: 1px solid #d1d5db;
                        padding-top: 12px;
                    }
                </style>
            </head>
            <body>
                <div class="watermark"></div>
                <div class="header-container">
                    <div class="header-left">
                        <h1>${title}</h1>
                        <p>Generated on ${new Date().toLocaleString()}</p>
                    </div>
                    <div class="header-right">
                        <img src="${window.location.origin}/logo.png" alt="Logo" />
                    </div>
                </div>
                <table>
                    <thead>
                        <tr>
                            <th style="width: 8%;">Rank</th>
                            <th style="width: 25%;">Student Name</th>
                            <th style="width: 12%;">Reg ID</th>
                            <th style="width: 9%;">Score</th>
                            ${isFullAdminReport ? `<th style="width: 9%;">Time</th>` : ''}
                            <th style="width: 12%;">HSC Batch</th>
                            <th style="width: 17%;">College</th>
                            ${isFullAdminReport ? `<th style="width: 8%;">Warnings</th>` : ''}
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
                <div class="footer">
                    Powered by ATLAS LMS • Official Exam Result Sheet
                </div>
                <script>
                    window.onload = function() {
                        setTimeout(() => {
                            window.print();
                        }, 500);
                    }
                </script>
            </body>
            </html>
           `;

           const printWindow = window.open('', '_blank');
           if (printWindow) {
               printWindow.document.write(htmlContent);
               printWindow.document.close();
           } else {
               alert("Popup blocked! Please allow popups for this site.");
           }

      } catch (err) {
          console.error(err);
          alert("Failed to generate PDF");
      }
  };

  const handleDownloadStudentCards = async () => {
      try {
          let query = (supabase as any)
            .from('leaderboard_exam_attempts')
            .select('*')
            .eq('exam_id', examId);

          if (filterType === 'live') {
              query = query.eq('attempt_type', 'live');
          } else {
              query = query.or('attempt_type.eq.practice,attempt_type.is.null');
          }

          const { data: attempts, error: aError } = await query
              .order('score', { ascending: false })
              .order('time_taken_seconds', { ascending: true, nullsFirst: false })
              .order('submitted_at', { ascending: true });

          if (aError) throw aError;
          if (!attempts || attempts.length === 0) {
              alert("No data to export");
              return;
          }

          const escapeHtml = (unsafe: string) => {
              return (unsafe || "")
                  .replace(/&/g, "&amp;")
                  .replace(/</g, "&lt;")
                  .replace(/>/g, "&gt;")
                  .replace(/"/g, "&quot;")
                  .replace(/'/g, "&#039;");
          };

          const capitalizeWords = (name: string) => {
              if (!name) return "-";
              return name
                  .split(" ")
                  .map(w => w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w)
                  .join(" ");
          };

          const MALE_FIRST_NAMES = new Set([
              "mohammad","mohammed","md","abdul","abdullah","rahim","karim","rafiq","rafiqul","shahin","shahin",
              "shakib","shakil","tanvir","tanjim","hasan","hossain","hossen","imran","ibrahim","ismail","jahid",
              "jahangir","jamal","javed","kamal","kamrul","khalid","khan","mahfuz","mahmud","mahmudul","masud",
              "mizan","mizanur","mostafa","mostofa","mubarak","murad","nasir","nazrul","nazmul","nayeem","nayem",
              "obaidul","omar","rakib","rakibul","rashed","rashid","rasel","rasul","riyad","riyadh","rubel","ruhul",
              "sabbir","saddam","sadman","sagor","sagar","saif","saiful","sajib","sajid","sajjad","sakib","salam",
              "salman","samiul","shafin","shakib","shamim","shanto","shariful","sharif","shawon","siam","sohan",
              "sohel","sourav","sourov","sultan","sumon","tanvir","tareq","tarek","tuhin","zahid","zakir","zaman",
              "arif","asif","ashik","atik","ayan","ayaan","emon","fahim","faisal","faysal","habib","hamza",
              "iftekhar","ikram","irfan","kabir","liton","mahin","mamun","mehedi","milon","minhaz","nabil","naeem",
              "niloy","nixon","raihan","raju","rana","robin","rony","russel","shanto","shuvo","siddique","sourov",
              "yasin","zihad","farhan","fardin","abir","alvi","apon","arafat","biplob","dipto","emon","fahad",
              "galib","hridoy","ifty","jisan","limon","mahdi","naim","opu","pranto","rifat","robiul","rocky",
              "shovon","sifat","sohag","tanim","toha","towhid","yeamin","zubayer"
          ]);
          const FEMALE_FIRST_NAMES = new Set([
              "fatema","fatima","ayesha","aysha","nusrat","tasnim","tasnia","tania","taniya","sumaiya","sumaya",
              "sadia","sabrina","sabina","shabnam","shanta","shanaz","shirin","sharmin","shirin","rima","rina",
              "runa","rupa","rupali","ruma","ruksana","rukshana","rokeya","rokhsana","rifa","rifah","priya",
              "prity","prity","israt","israat","ishrat","jannat","jannatul","jarin","jui","joya","jui","kamrun",
              "khadija","khaleda","laila","layla","lima","lubna","luna","mahi","mahiya","maisha","mim","mitu",
              "moushumi","mukta","munmun","nadia","nafisa","nahar","najma","nargis","nasrin","natasha","nazia",
              "nazneen","nilufar","nishat","nusaiba","orin","papia","poly","preeti","priyanka","raisa","rehnuma",
              "rifat","rima","rita","riya","roksana","rowshan","ruma","sabiha","saima","saira","sathi","satu",
              "shabnam","shahana","shahnaz","shanjida","sharmila","shathi","shatabdi","shefali","shilpi","shimla",
              "shirin","shobnom","shopna","shorna","shreya","sifat","sultana","sumi","suraiya","tahmina","tania",
              "tanzila","tasfia","tasmia","trisha","tuli","yasmin","zannat","zarin","zerin","prity"
          ]);

          const guessGenderAvatar = (fullName: string): string => {
              const firstNameRaw = (fullName || "").trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") || "";
              if (MALE_FIRST_NAMES.has(firstNameRaw)) {
                  return `${window.location.origin}/default-avatar-male.svg`;
              }
              if (FEMALE_FIRST_NAMES.has(firstNameRaw)) {
                  return `${window.location.origin}/default-avatar-female.svg`;
              }
              return `${window.location.origin}/logo.png`;
          };

          const examTitle = escapeHtml(exam?.title || "Exam");

          let pagesHtml = '';
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          attempts.forEach((attempt: any, index: number) => {
              const name = escapeHtml(capitalizeName(attempt.profile?.full_name));
              const hsc = escapeHtml(attempt.profile?.hsc_batch || "-");
              const college = escapeHtml(capitalizeWords(attempt.profile?.college_name || attempt.profile?.school || "-"));
              const avatarUrl = attempt.profile?.avatar_url || guessGenderAvatar(attempt.profile?.full_name);

              pagesHtml += `
              <div class="student-page">
                  <div class="card-panel">
                      <div class="rank-corner">#${index + 1}</div>
                      <div class="left-col">
                          <img class="avatar" src="${avatarUrl}" alt="${name}" />
                      </div>
                      <div class="right-col">
                          <div class="exam-name">${examTitle}</div>
                          <div class="name">${name}</div>
                          <div class="detail-grid">
                              <div class="detail-row"><span class="label">HSC Batch</span><span class="value">${hsc}</span></div>
                              <div class="detail-row"><span class="label">College Name</span><span class="value">${college}</span></div>
                              <div class="detail-row highlight"><span class="label">Score</span><span class="value">${attempt.score}</span></div>
                              <div class="detail-row highlight"><span class="label">Rank</span><span class="value">#${index + 1}</span></div>
                          </div>
                      </div>
                  </div>
              </div>`;
          });

          const htmlContent = `
            <!DOCTYPE html>
            <html lang="bn">
            <head>
                <meta charset="UTF-8">
                <title>${examTitle} - Student Cards</title>
                <style>
                    @font-face {
                        font-family: 'SolaimanLipi';
                        src: url('${window.location.origin}/SolaimanLipi.ttf') format('truetype');
                    }
                    @page {
                        size: 338mm 190mm;
                        margin: 0;
                    }
                    * { box-sizing: border-box; }
                    html, body {
                        width: 338mm;
                        height: auto;
                    }
                    body {
                        font-family: 'SolaimanLipi', sans-serif;
                        margin: 0;
                        padding: 0;
                        color: #1f2937;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .student-page {
                        width: 338mm;
                        height: 190mm;
                        margin: 0;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        page-break-after: always;
                        break-after: page;
                        break-inside: avoid;
                        page-break-inside: avoid;
                        background: linear-gradient(135deg, #0f172a 0%, #1e3a8a 55%, #0f172a 100%);
                        position: relative;
                        overflow: hidden;
                    }
                    .student-page:last-child {
                        page-break-after: auto;
                    }
                    .card-panel {
                        position: relative;
                        z-index: 1;
                        width: 90%;
                        height: 78%;
                        background: #ffffff;
                        border-radius: 20px;
                        box-shadow: 0 25px 60px rgba(0,0,0,0.35);
                        display: flex;
                        overflow: hidden;
                    }
                    .rank-corner {
                        position: absolute;
                        top: 20px;
                        right: 24px;
                        background: linear-gradient(135deg, #f59e0b, #d97706);
                        color: white;
                        font-weight: 800;
                        font-size: 18px;
                        padding: 8px 18px;
                        border-radius: 999px;
                        box-shadow: 0 4px 12px rgba(217, 119, 6, 0.4);
                        letter-spacing: 0.5px;
                    }
                    .left-col {
                        width: 38%;
                        background: linear-gradient(160deg, #1e3a8a, #0f172a);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 30px;
                    }
                    .avatar {
                        width: 100%;
                        max-width: 260px;
                        aspect-ratio: 1 / 1;
                        object-fit: cover;
                        border-radius: 16px;
                        border: 4px solid rgba(255,255,255,0.85);
                        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
                    }
                    .right-col {
                        width: 62%;
                        padding: 36px 44px;
                        display: flex;
                        flex-direction: column;
                        justify-content: center;
                    }
                    .exam-name {
                        font-size: 15px;
                        font-weight: 700;
                        letter-spacing: 0.08em;
                        text-transform: uppercase;
                        color: #6366f1;
                        margin-bottom: 6px;
                    }
                    .name {
                        font-size: 34px;
                        font-weight: 800;
                        color: #111827;
                        margin-bottom: 24px;
                        line-height: 1.2;
                    }
                    .detail-grid {
                        display: grid;
                        grid-template-columns: 1fr 1fr;
                        gap: 14px 24px;
                    }
                    .detail-row {
                        display: flex;
                        flex-direction: column;
                        gap: 4px;
                        border-bottom: 1px solid #e5e7eb;
                        padding-bottom: 10px;
                    }
                    .detail-row.highlight .value {
                        color: #059669;
                    }
                    .label {
                        font-size: 12px;
                        font-weight: 600;
                        text-transform: uppercase;
                        letter-spacing: 0.06em;
                        color: #9ca3af;
                    }
                    .value {
                        font-size: 22px;
                        font-weight: 700;
                        color: #111827;
                    }
                </style>
            </head>
            <body>
                ${pagesHtml}
                <script>
                    window.onload = function() {
                        setTimeout(() => {
                            window.print();
                        }, 500);
                    }
                </script>
            </body>
            </html>
           `;

          const printWindow = window.open('', '_blank');
          if (printWindow) {
              printWindow.document.write(htmlContent);
              printWindow.document.close();
          } else {
              alert("Popup blocked! Please allow popups for this site.");
          }

      } catch (err) {
          console.error(err);
          alert("Failed to generate student cards PDF");
      }
  };

  // If exam is not live type, we might not need tabs, but user said "expired live exam will be counted as a practice exam"
  // So even for expired live exams, we should probably show the historical "Live Rank" vs "Practice Rank".
  const showTabs = exam?.exam_type === 'live';

  if (exam?.chapter === "Custom") {
     return (
        <div className="p-8 text-center text-muted-foreground">
            Custom exam-এ কোনো leaderboard নেই।
        </div>
     );
  }

  if (hasAccess === false) {
     return (
        <div className="p-8 text-center text-muted-foreground">
            You are not enrolled in this course or this exam is private.
        </div>
     );
  }

  return (
    <div className="space-y-3 max-w-5xl mx-auto pb-10 pt-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="min-w-0">
                <h1 className="text-2xl font-bold tracking-tight truncate">Leaderboard</h1>
                <p className="text-sm text-muted-foreground truncate max-w-[200px] sm:max-w-[400px]">
                    {exam?.title}
                </p>
            </div>
          </div>
          <div className="flex gap-2 self-end sm:self-auto flex-wrap justify-end">
            {isStaff && (
                <Button variant="outline" size="sm" onClick={handleExportCSV}>
                    <Download className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">CSV</span>
                </Button>
            )}
            {isStaff && (
                <Button variant="outline" size="sm" onClick={() => handlePrintPDF(false)}>
                    <FileText className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">PDF/Print</span>
                </Button>
            )}
            {isStaff && (
                <Button variant="default" size="sm" onClick={() => handlePrintPDF(true)}>
                    <FileText className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Admin PDF</span>
                </Button>
            )}
            {isAdmin && (
                <Button
                    size="sm"
                    onClick={handleDownloadStudentCards}
                    className="bg-amber-500 hover:bg-amber-600 text-white border-0"
                >
                    <FileText className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Student Cards PDF</span>
                </Button>
            )}
          </div>
      </div>

      <Card className="border-0 shadow-none bg-transparent md:border md:border-yellow-500/20 md:bg-yellow-50/10 md:shadow-sm">
        <CardHeader className="px-0 md:px-6 pb-2 pt-2 md:pt-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-yellow-500" />
                    Top Performers
                </CardTitle>
                <CardDescription>
                    Rankings based on score. Ties are broken by submission time.
                </CardDescription>
              </div>

              {showTabs && (
                  <Tabs value={filterType} onValueChange={(v) => setFilterType(v as 'live'|'practice')}>
                      <TabsList>
                          <TabsTrigger value="live">Live Rank</TabsTrigger>
                          <TabsTrigger value="practice">Practice Rank</TabsTrigger>
                      </TabsList>
                  </Tabs>
              )}
          </div>
        </CardHeader>
        <CardContent className="px-0 md:px-6">
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading ranking...</div>
          ) : !leaderboard || leaderboard.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
                No attempts recorded yet for this category.
            </div>
          ) : (
            <>
            {/* Podium Component */}
            {topThree.length > 0 && <Podium topThree={topThree} isStaff={isStaff} />}

            {/* Mobile: sticky column header */}
            <div className="md:hidden sticky top-0 z-10 bg-background/95 backdrop-blur-sm flex items-center px-1 py-1.5 text-[11px] font-semibold text-muted-foreground border-b mb-2 -mx-2">
                <span className="w-8 shrink-0">Rank</span>
                <span className="flex-1 pl-9">Student Detail</span>
                <span className="shrink-0">Score</span>
            </div>

            {/* Mobile: card list (no horizontal scroll) */}
            <div className="md:hidden space-y-2 -mx-2">
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {leaderboard.map((attempt: any, index: number) => {
                const globalIndex = index;
                let rankIcon = null;
                let cardClass = "bg-card";
                if (globalIndex === 0) { rankIcon = "🥇"; cardClass = "bg-yellow-100/50 dark:bg-yellow-900/20"; }
                else if (globalIndex === 1) { rankIcon = "🥈"; cardClass = "bg-slate-100/50 dark:bg-slate-800/20"; }
                else if (globalIndex === 2) { rankIcon = "🥉"; cardClass = "bg-orange-100/50 dark:bg-orange-900/20"; }

                const isSecondTimer = attempt.profile?.is_second_timer;
                const isMe = myAttemptId === attempt.id;

                return (
                  <div key={attempt.id} className={`relative rounded-lg border py-1 px-2 ${cardClass}`}>
                    {myAttemptId && !isMe && (
                        <div className="flex justify-end mb-0.5">
                            <button
                                onClick={() => openCompare(attempt.id)}
                                className="flex items-center gap-1 text-[10px] font-medium bg-primary/10 text-primary/70 rounded-full px-2 py-1 active:scale-90 hover:scale-105 transition-transform duration-150"
                            >
                                <Scale className="h-3 w-3" /> তুলনা করো
                            </button>
                        </div>
                    )}
                    <div className="flex items-start gap-2">
                        <div className="font-bold whitespace-nowrap pt-0.5">
                            {rankIcon ? <span className="text-xl">{rankIcon}</span> : <span className="text-muted-foreground text-sm">#{globalIndex + 1}</span>}
                        </div>
                        <Avatar className="h-9 w-9 rounded-sm shrink-0 border border-border">
                            <AvatarImage src={attempt.profile?.avatar_url} className="rounded-sm object-cover" />
                            <AvatarFallback className="rounded-sm bg-muted" />
                        </Avatar>
                        <div className="flex flex-col min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1.5">
                                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                                    <span className="font-semibold text-base break-words">{capitalizeName(attempt.profile?.full_name)}</span>
                                    {isSecondTimer && (
                                        <BadgeAlert className="h-3 w-3 text-orange-500 shrink-0" />
                                    )}
                                </div>
                                <span className="font-bold text-primary text-sm shrink-0 pl-2">{attempt.score}</span>
                            </div>
                            <div className="flex items-center justify-between gap-1.5 mt-0.5">
                                <div className="text-xs text-muted-foreground flex items-center flex-wrap gap-2 min-w-0">
                                    <span className="break-words">
                                        {attempt.profile?.hsc_batch ? `HSC ${attempt.profile.hsc_batch} • ` : ""}
                                        {displayCollegeName(attempt.profile?.college_name || attempt.profile?.school)}
                                    </span>
                                    {isStaff && <span>• {formatDurationShort(attempt.time_taken_seconds)}</span>}
                                </div>
                                {isStaff && (
                                    <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 shrink-0" onClick={() => navigate(`/dashboard/exam-review/${attempt.id}`)}>
                                        Review
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop: table */}
            <div className="hidden md:block rounded-md border bg-card overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[60px] md:w-[80px] whitespace-nowrap">Rank</TableHead>
                    <TableHead className="whitespace-nowrap">Student Detail</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Score</TableHead>
                    {isStaff && <TableHead className="text-right whitespace-nowrap hidden md:table-cell">Time</TableHead>}
                    {isStaff && <TableHead className="text-right whitespace-nowrap hidden md:table-cell">Warnings</TableHead>}
                    <TableHead className="text-right whitespace-nowrap hidden md:table-cell">Submitted</TableHead>
                    <TableHead className="text-right whitespace-nowrap">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {leaderboard.map((attempt: any, index: number) => {
                    // Calculate global rank
                    const globalIndex = index;
                    let rankIcon = null;
                    let rowClass = "";

                    if (globalIndex === 0) {
                        rankIcon = "🥇";
                        rowClass = "bg-yellow-100/50 hover:bg-yellow-100/60 dark:bg-yellow-900/20 dark:hover:bg-yellow-900/30";
                    } else if (globalIndex === 1) {
                        rankIcon = "🥈";
                        rowClass = "bg-slate-100/50 hover:bg-slate-100/60 dark:bg-slate-800/20 dark:hover:bg-slate-800/30";
                    } else if (globalIndex === 2) {
                        rankIcon = "🥉";
                        rowClass = "bg-orange-100/50 hover:bg-orange-100/60 dark:bg-orange-900/20 dark:hover:bg-orange-900/30";
                    }

                    // Format Time Taken
                    const formatDuration = (seconds: number) => {
                        if (!seconds) return "-";
                        const m = Math.floor(seconds / 60);
                        const s = seconds % 60;
                        return `${m}m ${s}s`;
                    };

                    // Format attempt number
                    const attemptNumber = attempt.attempt_number ? (
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground ml-2 hidden sm:inline">
                             {attempt.attempt_number}{[1, 21, 31].includes(attempt.attempt_number) ? 'st' : [2, 22, 32].includes(attempt.attempt_number) ? 'nd' : [3, 23, 33].includes(attempt.attempt_number) ? 'rd' : 'th'} attempt
                        </span>
                    ) : null;

                    const isSecondTimer = attempt.profile?.is_second_timer;
                    const isMe = myAttemptId === attempt.id;

                    return (
                        <TableRow key={attempt.id} className={rowClass}>
                            <TableCell className="font-bold whitespace-nowrap">
                                {rankIcon ? <span className="text-2xl mr-2">{rankIcon}</span> : <span className="text-muted-foreground ml-2">#{globalIndex + 1}</span>}
                            </TableCell>
                            <TableCell className="font-medium whitespace-nowrap">
                                <div className="flex items-center gap-2.5">
                                    <Avatar className="h-8 w-8 rounded-md shrink-0 border border-border">
                                        <AvatarImage src={attempt.profile?.avatar_url} className="rounded-md" />
                                        <AvatarFallback className="rounded-md bg-muted" />
                                    </Avatar>
                                    <div className="flex flex-col min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="break-words">{capitalizeName(attempt.profile?.full_name)}</span>
                                            {isSecondTimer && (
                                                <div className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1" title="Second Timer">
                                                    <BadgeAlert className="h-3 w-3" />
                                                    <span className="hidden sm:inline">2nd Timer</span>
                                                </div>
                                            )}
                                            {attemptNumber}
                                        </div>
                                        <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-2">
                                            <span>{attempt.profile?.college_name || attempt.profile?.school || "-"}</span>
                                            {isStaff && (
                                                <>
                                                    <span className="hidden md:inline">•</span>
                                                    <span className="hidden md:inline">{formatDuration(attempt.time_taken_seconds)}</span>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </TableCell>
                            <TableCell className="text-right font-bold text-primary whitespace-nowrap">
                                {attempt.score}
                            </TableCell>
                            {isStaff && (
                                <TableCell className="text-right font-mono text-xs whitespace-nowrap hidden md:table-cell">
                                    {formatDuration(attempt.time_taken_seconds)}
                                </TableCell>
                            )}
                            {isStaff && (
                                <TableCell className="text-right text-xs whitespace-nowrap hidden md:table-cell">
                                    {attempt.violation_count > 0 ? (
                                        <span className="text-red-600 font-bold flex items-center justify-end gap-1"><BadgeAlert className="h-3 w-3"/> {attempt.violation_count}</span>
                                    ) : (
                                        <span className="text-muted-foreground">-</span>
                                    )}
                                </TableCell>
                            )}
                            <TableCell className="text-right text-xs text-muted-foreground whitespace-nowrap hidden md:table-cell">
                                {new Date(attempt.submitted_at).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right whitespace-nowrap">
                                <div className="flex items-center justify-end gap-1.5">
                                    {isStaff && (
                                        <Button variant="outline" size="sm" onClick={() => navigate(`/dashboard/exam-review/${attempt.id}`)}>
                                            Review
                                        </Button>
                                    )}
                                    {myAttemptId && !isMe && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 text-xs px-2 text-primary hover:scale-105 active:scale-95 transition-transform"
                                            onClick={() => openCompare(attempt.id)}
                                        >
                                            <Scale className="h-3.5 w-3.5 mr-1" /> তুলনা করো
                                        </Button>
                                    )}
                                </div>
                            </TableCell>
                        </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Total count */}
            <div className="flex items-center justify-between pt-4">
                 <div className="text-xs text-muted-foreground">
                     Showing all {totalCount} students
                 </div>
            </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Compare Dialog */}
      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" /> Detail Comparison
            </DialogTitle>
          </DialogHeader>

          {compareLoading ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Loading comparison...</div>
          ) : compareData && compareData.length === 2 ? (
            <div className="space-y-4">
              {/* Header with names */}
              <div className="grid grid-cols-2 gap-3">
                {compareData.map((c) => {
                  const d = getAttemptDisplay(c.attemptId);
                  return (
                    <div key={c.attemptId} className="flex flex-col items-center text-center gap-1.5 p-3 rounded-lg border bg-muted/30">
                      <Avatar className="h-12 w-12 rounded-md border">
                        <AvatarImage src={d?.profile?.avatar_url} className="rounded-md" />
                        <AvatarFallback className="rounded-md bg-muted">{(d?.profile?.full_name || "??").slice(0,2).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="font-semibold text-sm leading-tight break-words">{capitalizeName(d?.profile?.full_name)}</span>
                      <Badge variant="secondary" className="text-xs">Score: {c.score}</Badge>
                    </div>
                  );
                })}
              </div>

              {/* Comparison table */}
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    {[
                      { label: "Right", icon: <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />, key: "correct" },
                      { label: "Wrong", icon: <XCircle className="h-3.5 w-3.5 text-red-600" />, key: "wrong" },
                      { label: "Skipped", icon: <MinusCircle className="h-3.5 w-3.5 text-slate-500" />, key: "skipped" },
                      { label: "Time Taken", icon: <Clock className="h-3.5 w-3.5 text-blue-600" />, key: "time_taken_seconds" },
                    ].map((row) => {
                      const [a, b] = compareData;
                      const valA = row.key === "time_taken_seconds" ? formatDurationShort(a.time_taken_seconds) : a[row.key as keyof typeof a];
                      const valB = row.key === "time_taken_seconds" ? formatDurationShort(b.time_taken_seconds) : b[row.key as keyof typeof b];
                      const aWins = row.key === "wrong" || row.key === "skipped" || row.key === "time_taken_seconds"
                        ? Number(a[row.key as keyof typeof a]) < Number(b[row.key as keyof typeof b])
                        : Number(a[row.key as keyof typeof a]) > Number(b[row.key as keyof typeof b]);
                      const bWins = row.key === "wrong" || row.key === "skipped" || row.key === "time_taken_seconds"
                        ? Number(b[row.key as keyof typeof b]) < Number(a[row.key as keyof typeof a])
                        : Number(b[row.key as keyof typeof b]) > Number(a[row.key as keyof typeof a]);
                      return (
                        <tr key={row.key} className="border-b last:border-0">
                          <td className={`px-3 py-2 text-center font-medium ${aWins ? "text-green-600" : ""}`}>{valA}</td>
                          <td className="px-3 py-2 text-center text-xs text-muted-foreground flex items-center justify-center gap-1">
                            {row.icon} {row.label}
                          </td>
                          <td className={`px-3 py-2 text-center font-medium ${bWins ? "text-green-600" : ""}`}>{valB}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Verdict */}
              <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
                <div className="text-xs font-semibold text-primary mb-2">মতামত (ধাপে ধাপে)</div>
                <ol className="space-y-1.5 list-decimal list-inside">
                    {buildVerdict().map((point, i) => (
                        <li key={i} className="text-sm leading-relaxed">{point}</li>
                    ))}
                </ol>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground py-6 text-center">Comparison data load kora jayni.</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Leaderboard;
