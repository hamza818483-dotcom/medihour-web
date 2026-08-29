import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Search, Users } from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";

const PAGE_SIZE = 30;

interface HistoryRow {
  id: string;
  created_at: string;
  updated_at: string | null;
  amount_paid: number | null;
  amount_sent: number | null;
  due_amount: number | null;
  due_date: string | null;
  course_id: string;
  profile_id: string;
  courses?: { name: string; price: number | null } | null;
  profiles?: {
    full_name: string | null;
    registration_id: string;
    college_name: string | null;
    hsc_batch: string | null;
  } | null;
}

function studentTableCells(row: HistoryRow) {
  const paymentTime = row.updated_at || row.created_at;
  const paid = row.amount_paid ?? row.amount_sent ?? 0;
  const due = row.due_amount ?? 0;
  const daysLeft = row.due_date ? differenceInCalendarDays(new Date(row.due_date), new Date()) : null;

  return (
    <>
      <TableCell className="p-1 text-[9px] font-medium truncate max-w-[70px]">{row.profiles?.full_name || "—"}</TableCell>
      <TableCell className="p-1 text-[9px] truncate max-w-[50px]">{row.profiles?.hsc_batch || "—"}</TableCell>
      <TableCell className="p-1 text-[9px] truncate max-w-[70px]">{row.profiles?.college_name || "—"}</TableCell>
      <TableCell className="p-1 text-[9px] whitespace-nowrap">{format(new Date(paymentTime), "dd MMM")}</TableCell>
      <TableCell className="p-1 text-[9px] whitespace-nowrap">{format(new Date(paymentTime), "hh:mma")}</TableCell>
      <TableCell className="p-1 text-[9px] font-medium text-emerald-600 dark:text-emerald-400 whitespace-nowrap">৳{paid.toLocaleString("en-BD")}</TableCell>
      <TableCell className="p-1 text-[9px] whitespace-nowrap">
        {due > 0 ? <span className="text-amber-600 dark:text-amber-400">৳{due.toLocaleString("en-BD")}</span> : <span className="text-muted-foreground">—</span>}
      </TableCell>
      <TableCell className="p-1 text-[9px] whitespace-nowrap">
        {due > 0 && row.due_date ? (
          <span className={daysLeft !== null && daysLeft < 0 ? "text-destructive" : ""}>
            {format(new Date(row.due_date), "dd MMM")}
            {daysLeft !== null && ` (${daysLeft < 0 ? `${Math.abs(daysLeft)}দি লেট` : `${daysLeft}দি`})`}
          </span>
        ) : due > 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="text-emerald-600 dark:text-emerald-400">সম্পূর্ণ</span>
        )}
      </TableCell>
    </>
  );
}

function DatewiseTab() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-payment-history-datewise", page],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from("payment_requests")
        .select(
          "id, created_at, updated_at, amount_paid, amount_sent, due_amount, due_date, course_id, profile_id, courses(name, price), profiles(full_name, registration_id, college_name, hsc_batch)",
          { count: "exact" }
        )
        .eq("status", "approved")
        .order("updated_at", { ascending: false })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: (data || []) as HistoryRow[], count: count || 0 };
    },
  });

  const filteredRows = (data?.rows || []).filter((row) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (
      row.profiles?.full_name?.toLowerCase().includes(q) ||
      row.profiles?.registration_id?.toLowerCase().includes(q) ||
      row.courses?.name?.toLowerCase().includes(q)
    );
  });

  const totalPages = Math.ceil((data?.count || 0) / PAGE_SIZE);

  return (
    <div>
      <div className="relative mb-2">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="নাম, রেজি. আইডি বা কোর্স দিয়ে খুঁজুন"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          className="pl-8 h-8 text-xs"
        />
      </div>

      {isLoading ? (
        <div className="text-xs text-muted-foreground p-4">লোড হচ্ছে...</div>
      ) : filteredRows.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-xs text-muted-foreground">কোনো পেমেন্ট পাওয়া যায়নি</CardContent></Card>
      ) : (
        <Card className="w-full overflow-hidden">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="p-1 text-[9px] max-w-[70px]">কোর্স</TableHead>
                  <TableHead className="p-1 text-[9px]">নাম</TableHead>
                  <TableHead className="p-1 text-[9px]">ব্যাচ</TableHead>
                  <TableHead className="p-1 text-[9px]">কলেজ</TableHead>
                  <TableHead className="p-1 text-[9px]">তারিখ</TableHead>
                  <TableHead className="p-1 text-[9px]">সময়</TableHead>
                  <TableHead className="p-1 text-[9px]">পেইড</TableHead>
                  <TableHead className="p-1 text-[9px]">বাকি</TableHead>
                  <TableHead className="p-1 text-[9px]">শেষ তারিখ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="p-1 text-[9px] font-medium text-primary truncate max-w-[70px]">{row.courses?.name || "Unknown"}</TableCell>
                    {studentTableCells(row)}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-3">
          <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>পূর্বের</Button>
          <span className="text-xs text-muted-foreground">{page + 1} / {totalPages}</span>
          <Button variant="outline" size="sm" className="h-7 text-xs" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>পরের</Button>
        </div>
      )}
    </div>
  );
}

function CoursewiseTab() {
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);

  const { data: courseStats, isLoading: loadingStats } = useQuery({
    queryKey: ["admin-payment-history-course-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_requests")
        .select("course_id, courses(name)")
        .eq("status", "approved");
      if (error) throw error;

      const counts: Record<string, { name: string; count: number }> = {};
      (data || []).forEach((row: any) => {
        const cid = row.course_id;
        if (!cid) return;
        if (!counts[cid]) counts[cid] = { name: row.courses?.name || "Unknown", count: 0 };
        counts[cid].count += 1;
      });
      return Object.entries(counts)
        .map(([course_id, v]) => ({ course_id, ...v }))
        .sort((a, b) => b.count - a.count);
    },
  });

  const { data: courseRows, isLoading: loadingRows } = useQuery({
    queryKey: ["admin-payment-history-course-rows", selectedCourseId],
    queryFn: async () => {
      if (!selectedCourseId) return [];
      const { data, error } = await supabase
        .from("payment_requests")
        .select(
          "id, created_at, updated_at, amount_paid, amount_sent, due_amount, due_date, course_id, profile_id, courses(name, price), profiles(full_name, registration_id, college_name, hsc_batch)"
        )
        .eq("status", "approved")
        .eq("course_id", selectedCourseId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data || []) as HistoryRow[];
    },
    enabled: !!selectedCourseId,
  });

  if (selectedCourseId) {
    const courseName = courseStats?.find((c) => c.course_id === selectedCourseId)?.name;
    return (
      <div>
        <Button variant="outline" size="sm" className="h-7 text-xs mb-2" onClick={() => setSelectedCourseId(null)}>
          <ArrowLeft className="h-3 w-3 mr-1" /> সব কোর্স
        </Button>
        <div className="text-xs font-semibold mb-2 text-primary">{courseName}</div>
        {loadingRows ? (
          <div className="text-xs text-muted-foreground p-4">লোড হচ্ছে...</div>
        ) : !courseRows || courseRows.length === 0 ? (
          <Card><CardContent className="p-6 text-center text-xs text-muted-foreground">কোনো শিক্ষার্থী নেই</CardContent></Card>
        ) : (
          <Card className="w-full overflow-hidden">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="p-1 text-[9px]">নাম</TableHead>
                    <TableHead className="p-1 text-[9px]">ব্যাচ</TableHead>
                    <TableHead className="p-1 text-[9px]">কলেজ</TableHead>
                    <TableHead className="p-1 text-[9px]">তারিখ</TableHead>
                    <TableHead className="p-1 text-[9px]">সময়</TableHead>
                    <TableHead className="p-1 text-[9px]">পেইড</TableHead>
                    <TableHead className="p-1 text-[9px]">বাকি</TableHead>
                    <TableHead className="p-1 text-[9px]">শেষ তারিখ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {courseRows.map((row) => (
                    <TableRow key={row.id}>
                      {studentTableCells(row)}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div>
      {loadingStats ? (
        <div className="text-xs text-muted-foreground p-4">লোড হচ্ছে...</div>
      ) : courseStats && courseStats.length > 0 ? (
        <div className="grid grid-cols-1 gap-2">
          {courseStats.map((c) => (
            <Card
              key={c.course_id}
              className="cursor-pointer hover:bg-muted/40 transition-colors"
              onClick={() => setSelectedCourseId(c.course_id)}
            >
              <CardContent className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0 text-xs font-medium truncate">{c.name}</div>
                <div className="flex items-center gap-1.5 shrink-0 bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                  <Users className="h-3 w-3" />
                  <span className="font-bold text-xs">{c.count}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card><CardContent className="p-6 text-center text-xs text-muted-foreground">কোনো অনুমোদিত পেমেন্ট নেই</CardContent></Card>
      )}
    </div>
  );
}

const AdminPaymentHistory = () => {
  const navigate = useNavigate();

  return (
    <div className="space-y-4 max-w-full">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => navigate("/admin/payments")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-lg font-bold tracking-tight">Payment History</h1>
          <p className="text-xs text-muted-foreground">সব অনুমোদিত পেমেন্ট এবং কোর্স-ভিত্তিক ভর্তির তথ্য</p>
        </div>
      </div>

      <Tabs defaultValue="datewise">
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="datewise" className="text-xs">Datewise History</TabsTrigger>
          <TabsTrigger value="coursewise" className="text-xs">Coursewise History</TabsTrigger>
        </TabsList>
        <TabsContent value="datewise" className="mt-3">
          <DatewiseTab />
        </TabsContent>
        <TabsContent value="coursewise" className="mt-3">
          <CoursewiseTab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminPaymentHistory;
