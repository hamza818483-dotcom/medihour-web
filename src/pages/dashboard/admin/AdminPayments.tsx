import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  Loader2, Check, X, RefreshCw, Inbox, ChevronLeft, ChevronRight,
  Volume2, VolumeX, Search, AlertTriangle, Clock, DollarSign, Users,
  ExternalLink, TrendingDown, Calendar, Eye, Edit2, MessageCircle, Send
} from "lucide-react";
import { toast } from "sonner";
import { format, isPast, isBefore, addDays } from "date-fns";

const PAGE_SIZE = 10;

// Extends PaymentRequest with new fields
interface EnrichedPaymentRequest {
  id: string;
  created_at: string;
  updated_at?: string;
  phone: string;
  trx_id: string;
  payment_method: string;
  status: string;
  profile_id: string;
  course_id: string;
  amount_sent?: number | null;
  due_amount?: number | null;
  due_date?: string | null;
  sender_last5?: string | null;
  social_link?: string | null;
  contact_number?: string | null;
  admin_note?: string | null;
  amount_paid?: number | null;
  profiles?: { full_name: string; registration_id: string };
  courses?: { name: string; price: number };
}

const isDueCritical = (due_date?: string | null) => {
  if (!due_date) return false;
  return isPast(new Date(due_date));
};

const isDueWarning = (due_date?: string | null) => {
  if (!due_date) return false;
  const dueDate = new Date(due_date);
  return !isPast(dueDate) && isBefore(dueDate, addDays(new Date(), 3));
};

// Safe date formatter — never throws. A malformed/missing timestamp from the
// database used to crash this entire page to a blank white screen (no error
// boundary on this route), because date-fns' format() throws on invalid
// dates. This renders a fallback instead of crashing.
const safeFormat = (value?: string | null, pattern = "dd MMM yyyy") => {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  try {
    return format(d, pattern);
  } catch {
    return "—";
  }
};

const AdminPayments = () => {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [page, setPage] = useState(0);
  const [duePage, setDuePage] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeTab, setActiveTab] = useState("pending");
  const [selectedRequest, setSelectedRequest] = useState<EnrichedPaymentRequest | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [reduceDialogOpen, setReduceDialogOpen] = useState(false);
  const [reduceAmount, setReduceAmount] = useState("");
  const [adminNote, setAdminNote] = useState("");
  const [emiPage, setEmiPage] = useState(0);
  const [emiSearch, setEmiSearch] = useState("");

  useEffect(() => {
      const timer = setTimeout(() => {
          setDebouncedSearch(searchQuery);
          if (searchQuery !== debouncedSearch) setPage(0);
      }, 500);
      return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const checkForPending = async () => {
        const { count } = await supabase
            .from("payment_requests")
            .select("*", { count: 'exact', head: true })
            .eq("status", "pending");

        if (count && count > 0 && !isMuted) {
            const audio = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
            audio.play().catch(e => console.error("Audio play failed", e));
        }
    };

    const interval = setInterval(checkForPending, 60000);
    checkForPending();
    return () => clearInterval(interval);
  }, [isMuted]);

  // Pending requests query
  const { data: requestsData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["admin-payment-requests", page, debouncedSearch],
    queryFn: async () => {
      let query = (supabase.from as any)("payment_requests")
        .select(`
            id, created_at, updated_at, phone, trx_id, payment_method, status, profile_id, course_id,
            amount_sent, due_amount, due_date, sender_last5, social_link, contact_number, admin_note, amount_paid,
            profiles (full_name, registration_id),
            courses (name, price)
        `, { count: 'exact' })
        .eq("status", "pending");

      if (debouncedSearch) {
          query = query.or(`trx_id.ilike.%${debouncedSearch}%,phone.ilike.%${debouncedSearch}%,sender_last5.ilike.%${debouncedSearch}%,contact_number.ilike.%${debouncedSearch}%`);
      }

      // Also search by name or reg_id via profiles join is complex; we do client-side filter for now
      const { data, error, count } = await query
        .order("created_at", { ascending: false })
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (error) throw error;
      return { data: (data || []) as EnrichedPaymentRequest[], count: count || 0 };
    },
  });

  // Due payments query (approved requests with outstanding due)
  const { data: dueData, isLoading: isDueLoading } = useQuery({
    queryKey: ["admin-due-payments", duePage, debouncedSearch],
    queryFn: async () => {
      let query = (supabase.from as any)("payment_requests")
        .select(`
            id, created_at, updated_at, phone, trx_id, payment_method, status, profile_id, course_id,
            amount_sent, due_amount, due_date, sender_last5, social_link, contact_number, admin_note, amount_paid,
            profiles (full_name, registration_id),
            courses (name, price)
        `, { count: 'exact' })
        .eq("status", "approved")
        .not("due_amount", "is", null)
        .gt("due_amount", 0);

      if (debouncedSearch) {
          query = query.or(`contact_number.ilike.%${debouncedSearch}%,sender_last5.ilike.%${debouncedSearch}%`);
      }

      const { data, error, count } = await query
        .order("due_date", { ascending: true })
        .range(duePage * PAGE_SIZE, (duePage + 1) * PAGE_SIZE - 1);

      if (error) throw error;

      // Filter out fully paid (where amount_paid >= due_amount)
      const filtered = (data || []).filter((r: EnrichedPaymentRequest) => {
        const remaining = (r.due_amount || 0) - (r.amount_paid || 0);
        return remaining > 0;
      });
      
      return { data: filtered as EnrichedPaymentRequest[], count: count || 0 };
    },
    enabled: activeTab === "due",
  });

  // Stats
  const { data: stats } = useQuery({
    queryKey: ["admin-payment-stats"],
    queryFn: async () => {
      const { count: pendingCount } = await (supabase.from as any)("payment_requests")
        .select("*", { count: 'exact', head: true })
        .eq("status", "pending");

      const { data: dueResults } = await (supabase.from as any)("payment_requests")
        .select("due_amount, amount_paid, due_date")
        .eq("status", "approved")
        .not("due_amount", "is", null)
        .gt("due_amount", 0);

      const activeDue = (dueResults || []).filter((r: any) => {
        const remaining = (r.due_amount || 0) - (r.amount_paid || 0);
        return remaining > 0;
      });

      const criticalDue = activeDue.filter((r: any) => isDueCritical(r.due_date));
      const totalDueAmount = activeDue.reduce((sum: number, r: any) => {
        return sum + ((r.due_amount || 0) - (r.amount_paid || 0));
      }, 0);

      return {
        pending: pendingCount || 0,
        activeDue: activeDue.length,
        criticalDue: criticalDue.length,
        totalDueAmount,
      };
    },
  });

  const requests = requestsData?.data || [];
  const totalCount = requestsData?.count || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const dueRequests = dueData?.data || [];
  const dueTotalCount = dueData?.count || 0;
  const dueTotalPages = Math.ceil(dueTotalCount / PAGE_SIZE);

  const approveMutation = useMutation({
    mutationFn: async (requestId: string) => {
        const { error } = await supabase.rpc("approve_payment_request", { p_request_id: requestId });
        if (error) throw error;
    },
    onSuccess: () => {
        toast.success("Request approved and student enrolled.");
        queryClient.invalidateQueries({ queryKey: ["admin-payment-requests"] });
        queryClient.invalidateQueries({ queryKey: ["admin-payment-stats"] });
    },
    onError: (error) => {
        toast.error("Failed to approve: " + error.message);
    }
  });

  const rejectMutation = useMutation({
    mutationFn: async (requestId: string) => {
        const { error } = await supabase.rpc("reject_payment_request", { p_request_id: requestId });
        if (error) throw error;
    },
    onSuccess: () => {
        toast.success("Request rejected.");
        queryClient.invalidateQueries({ queryKey: ["admin-payment-requests"] });
        queryClient.invalidateQueries({ queryKey: ["admin-payment-stats"] });
    },
    onError: (error) => {
        toast.error("Failed to reject: " + error.message);
    }
  });

  const reduceDueMutation = useMutation({
    mutationFn: async ({ requestId, amount, note }: { requestId: string; amount: number; note: string }) => {
        const request = dueRequests.find(r => r.id === requestId) || selectedRequest;
        if (!request) throw new Error("Request not found");
        const currentPaid = request.amount_paid || 0;
        const newPaid = currentPaid + amount;
        const remaining = (request.due_amount || 0) - newPaid;

        const updatePayload: any = {
          amount_paid: newPaid,
          admin_note: note || request.admin_note,
          updated_at: new Date().toISOString(),
        };

        if (remaining <= 0) {
          updatePayload.due_amount = 0;
        }

        const { error } = await (supabase.from as any)("payment_requests")
          .update(updatePayload)
          .eq("id", requestId);
        if (error) throw error;

        // Log this EMI payment in emi_logs
        await (supabase.from as any)("emi_logs").insert({
          payment_request_id: requestId,
          profile_id: request.profile_id,
          course_id: request.course_id,
          amount,
          admin_note: note || null,
        });
    },
    onSuccess: () => {
        toast.success("Due reduced successfully.");
        setReduceDialogOpen(false);
        setReduceAmount("");
        setAdminNote("");
        queryClient.invalidateQueries({ queryKey: ["admin-due-payments"] });
        queryClient.invalidateQueries({ queryKey: ["admin-payment-stats"] });
        queryClient.invalidateQueries({ queryKey: ["admin-emi-logs"] });
    },
    onError: (error) => {
        toast.error("Failed to reduce due: " + (error as any).message);
    }
  });

  // EMI Logs Query
  const { data: emiLogsData, isLoading: isEmiLoading } = useQuery({
    queryKey: ["admin-emi-logs", emiPage, emiSearch],
    queryFn: async () => {
      let query = (supabase.from as any)("emi_logs")
        .select(`
          id, amount, admin_note, recorded_at,
          payment_request_id,
          profile:profiles(full_name, registration_id),
          course:courses(name)
        `, { count: 'exact' })
        .order("recorded_at", { ascending: false });

      if (emiSearch) {
        // search by profile name via client-side filter
      }

      const { data, error, count } = await query
        .range(emiPage * PAGE_SIZE, (emiPage + 1) * PAGE_SIZE - 1);
      if (error) throw error;
      return { data: (data || []) as any[], count: count || 0 };
    },
    enabled: activeTab === "emi",
  });

  const emiLogs = emiLogsData?.data || [];
  const emiTotalCount = emiLogsData?.count || 0;
  const emiTotalPages = Math.ceil(emiTotalCount / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-card p-4 rounded-lg border shadow-sm gap-4">
        <div>
            <h1 className="text-xl font-bold tracking-tight">Payment Dashboard</h1>
            <p className="text-sm text-muted-foreground">Review, approve, and manage student payments & dues.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto items-end sm:items-center">
            <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                    placeholder="Search by number, last5, reg..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-9"
                />
            </div>
            <div className="flex gap-2 shrink-0">
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate("/admin/payments/history")}
                    className="gap-2 h-9"
                >
                    <Calendar className="h-4 w-4" />
                    <span className="hidden sm:inline">Payment History</span>
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsMuted(!isMuted)}
                    className="gap-2 h-9"
                    title={isMuted ? "Unmute notification sound" : "Mute notification sound"}
                >
                    {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    <span className="hidden sm:inline">{isMuted ? "Muted" : "Sound On"}</span>
                </Button>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setPage(0); refetch(); }}
                    disabled={isRefetching || isLoading}
                    className="gap-2 h-9"
                >
                    <RefreshCw className={`h-4 w-4 ${isRefetching ? 'animate-spin' : ''}`} />
                    <span className="hidden sm:inline">Refresh</span>
                </Button>
            </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{stats?.pending ?? "..."}</div>
              <div className="text-xs text-muted-foreground">Pending</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold">{stats?.activeDue ?? "..."}</div>
              <div className="text-xs text-muted-foreground">Active Dues</div>
            </div>
          </CardContent>
        </Card>
        <Card className={`border-2 ${stats?.criticalDue && stats.criticalDue > 0 ? 'bg-red-50 dark:bg-red-950/20 border-red-300 dark:border-red-800 animate-pulse' : 'border-border'}`}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`p-2 rounded-lg ${stats?.criticalDue && stats.criticalDue > 0 ? 'bg-red-100 dark:bg-red-900/30' : 'bg-muted'}`}>
              <AlertTriangle className={`h-5 w-5 ${stats?.criticalDue && stats.criticalDue > 0 ? 'text-red-600' : 'text-muted-foreground'}`} />
            </div>
            <div>
              <div className="text-2xl font-bold text-red-600">{stats?.criticalDue ?? "..."}</div>
              <div className="text-xs text-muted-foreground">Critical Dues</div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
              <DollarSign className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <div className="text-xl font-bold">৳{(stats?.totalDueAmount || 0).toLocaleString("en-BD")}</div>
              <div className="text-xs text-muted-foreground">Total Due</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="pending" className="gap-2">
            <Clock className="h-4 w-4" />
            Pending
            {stats?.pending ? <Badge variant="destructive" className="ml-1 text-xs px-1.5 py-0.5">{stats.pending}</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="due" className="gap-2">
            <TrendingDown className="h-4 w-4" />
            Due Payments
            {stats?.criticalDue ? <Badge variant="destructive" className="ml-1 text-xs px-1.5 py-0.5 animate-pulse">{stats.criticalDue} ⚠️</Badge> : null}
          </TabsTrigger>
          <TabsTrigger value="emi" className="gap-2">
            <Calendar className="h-4 w-4" />
            EMI History
          </TabsTrigger>
        </TabsList>

        {/* Pending Tab */}
        <TabsContent value="pending">
          <div className="border rounded-lg overflow-hidden bg-card shadow-sm">
            {isLoading ? (
              <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>
            ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Payment Info</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.length > 0 ? (
                  requests.map((request) => (
                    <TableRow key={request.id} className={request.due_amount && request.due_amount > 0 ? "bg-amber-50/50 dark:bg-amber-950/10" : ""}>
                      <TableCell className="whitespace-nowrap text-xs">
                          {safeFormat(request.created_at, "dd MMM, hh:mm a")}
                      </TableCell>
                      <TableCell>
                          <div className="font-medium text-sm">{request.profiles?.full_name || "Unknown"}</div>
                          <div className="text-xs text-muted-foreground">{request.profiles?.registration_id}</div>
                          {request.contact_number && <div className="text-xs text-blue-600 mt-0.5">{request.contact_number}</div>}
                      </TableCell>
                      <TableCell>
                          <div className="font-medium text-sm max-w-[150px] truncate">{request.courses?.name || "Unknown"}</div>
                          <div className="text-xs text-muted-foreground">৳{request.courses?.price}</div>
                      </TableCell>
                      <TableCell>
                          <div className="font-mono text-xs font-bold">Last5: {request.sender_last5 || request.trx_id}</div>
                          <div className="text-xs capitalize text-muted-foreground">{request.payment_method}</div>
                          {request.social_link && (
                            <a href={request.social_link} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline flex items-center gap-1 mt-0.5">
                              <ExternalLink className="h-3 w-3" /> Profile
                            </a>
                          )}
                      </TableCell>
                      <TableCell>
                          {request.amount_sent ? (
                            <span className="font-semibold text-green-700">৳{request.amount_sent}</span>
                          ) : (
                            <span className="text-muted-foreground text-xs">N/A</span>
                          )}
                      </TableCell>
                      <TableCell>
                          {request.due_amount && request.due_amount > 0 ? (
                            <div className="space-y-0.5">
                              <span className="text-amber-700 font-semibold text-sm">৳{request.due_amount}</span>
                              {request.due_date && (
                                <div className={`text-xs flex items-center gap-1 ${isDueCritical(request.due_date) ? 'text-red-600 font-bold' : isDueWarning(request.due_date) ? 'text-amber-600' : 'text-muted-foreground'}`}>
                                  <Calendar className="h-3 w-3" />
                                  {safeFormat(request.due_date, "dd MMM")}
                                  {isDueCritical(request.due_date) && <AlertTriangle className="h-3 w-3" />}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-green-600 font-medium">No Due</span>
                          )}
                      </TableCell>
                      <TableCell className="text-right">
                          <div className="flex justify-end gap-1 flex-wrap">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-blue-500"
                                onClick={() => { setSelectedRequest(request); setDetailDialogOpen(true); }}
                                title="View Details"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="destructive"
                                className="h-8 w-8"
                                onClick={() => { if(confirm("Reject this payment?")) rejectMutation.mutate(request.id); }}
                                disabled={rejectMutation.isPending || approveMutation.isPending}
                                title="Reject"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                className="h-8 w-8 bg-green-600 hover:bg-green-700"
                                onClick={() => approveMutation.mutate(request.id)}
                                disabled={rejectMutation.isPending || approveMutation.isPending}
                                title="Approve"
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                          </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} className="h-48 text-center">
                        <div className="flex flex-col items-center justify-center text-muted-foreground gap-2">
                            <Inbox className="h-10 w-10 opacity-20" />
                            <p>No pending payment requests.</p>
                            <p className="text-xs">New requests will appear here automatically.</p>
                        </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            )}

            <div className="flex items-center justify-between p-4 border-t">
              <div className="text-xs text-muted-foreground">
                  Page {page + 1} of {totalPages || 1} ({totalCount} items)
              </div>
              <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}>
                      <ChevronLeft className="h-4 w-4" />Previous
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>
                      Next<ChevronRight className="h-4 w-4" />
                  </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Due Payments Tab */}
        <TabsContent value="due">
          <div className="border rounded-lg overflow-hidden bg-card shadow-sm">
            {isDueLoading ? (
              <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>
            ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Course</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Amount Sent</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead>Remaining</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dueRequests.length > 0 ? (
                  dueRequests.map((request) => {
                    const remaining = (request.due_amount || 0) - (request.amount_paid || 0);
                    const isCritical = isDueCritical(request.due_date);
                    const isWarning = isDueWarning(request.due_date);
                    return (
                      <TableRow key={request.id} className={`${isCritical ? 'bg-red-50 dark:bg-red-950/20' : isWarning ? 'bg-amber-50 dark:bg-amber-950/10' : ''}`}>
                        <TableCell>
                            <div className="font-medium text-sm">{request.profiles?.full_name || "Unknown"}</div>
                            <div className="text-xs text-muted-foreground">{request.profiles?.registration_id}</div>
                        </TableCell>
                        <TableCell>
                            <div className="text-sm max-w-[120px] truncate">{request.courses?.name}</div>
                        </TableCell>
                        <TableCell>
                            <div className="text-xs">{request.contact_number || request.phone}</div>
                            {request.social_link && (
                              <a href={request.social_link} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                                <ExternalLink className="h-3 w-3" />Profile
                              </a>
                            )}
                        </TableCell>
                        <TableCell>
                          <span className="text-green-700 font-medium">৳{request.amount_sent || 0}</span>
                        </TableCell>
                        <TableCell>
                          <span className="font-semibold">৳{request.due_amount}</span>
                        </TableCell>
                        <TableCell>
                          <span className={`font-bold ${remaining > 0 ? 'text-amber-700' : 'text-green-600'}`}>৳{remaining}</span>
                        </TableCell>
                        <TableCell>
                          {request.due_date ? (
                            <div className={`text-xs font-medium flex items-center gap-1 ${isCritical ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-muted-foreground'}`}>
                              {isCritical && <AlertTriangle className="h-3.5 w-3.5" />}
                              {safeFormat(request.due_date, "dd MMM yyyy")}
                              {isCritical && <span className="text-[10px] bg-red-100 text-red-700 px-1 rounded">OVERDUE</span>}
                              {isWarning && !isCritical && <span className="text-[10px] bg-amber-100 text-amber-700 px-1 rounded">DUE SOON</span>}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">No deadline</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 text-xs gap-1 text-green-700 border-green-200 hover:bg-green-50"
                              onClick={() => { setSelectedRequest(request); setReduceDialogOpen(true); }}
                            >
                              <TrendingDown className="h-3.5 w-3.5" />
                              EMI/Pay
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-blue-500"
                              onClick={() => { setSelectedRequest(request); setDetailDialogOpen(true); }}
                              title="View Details"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="h-48 text-center">
                        <div className="flex flex-col items-center justify-center text-muted-foreground gap-2">
                            <Check className="h-10 w-10 text-green-500 opacity-50" />
                            <p className="font-medium">No outstanding dues!</p>
                            <p className="text-xs">All enrolled students have cleared their payments.</p>
                        </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            )}

            <div className="flex items-center justify-between p-4 border-t">
              <div className="text-xs text-muted-foreground">
                  Page {duePage + 1} of {dueTotalPages || 1}
              </div>
              <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setDuePage(p => Math.max(0, p - 1))} disabled={duePage === 0}>
                      <ChevronLeft className="h-4 w-4" />Previous
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setDuePage(p => p + 1)} disabled={duePage >= dueTotalPages - 1}>
                      Next<ChevronRight className="h-4 w-4" />
                  </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* EMI History Tab */}
        <TabsContent value="emi">
          <div className="border rounded-lg overflow-hidden bg-card shadow-sm">
            <div className="p-4 border-b flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div>
                <h2 className="font-semibold">EMI Payment History</h2>
                <p className="text-xs text-muted-foreground">All partial payments recorded by admin.</p>
              </div>
              <div className="relative w-full sm:w-56">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by student..."
                  value={emiSearch}
                  onChange={e => setEmiSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
            </div>
            {isEmiLoading ? (
              <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-primary" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Student</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead>Amount Paid</TableHead>
                    <TableHead>Admin Note</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {emiLogs.length > 0 ? emiLogs.filter(l =>
                    !emiSearch || l.profile?.full_name?.toLowerCase().includes(emiSearch.toLowerCase())
                  ).map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {safeFormat(log.recorded_at, "dd MMM yyyy, hh:mm a")}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{log.profile?.full_name || "Unknown"}</div>
                        <div className="text-xs text-muted-foreground">{log.profile?.registration_id}</div>
                      </TableCell>
                      <TableCell className="text-sm">{log.course?.name || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400">
                          ৳{(log.amount || 0).toLocaleString("en-BD")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
                        {log.admin_note || <span className="italic">No note</span>}
                      </TableCell>
                    </TableRow>
                  )) : (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                        No EMI payment logs recorded yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
            <div className="flex items-center justify-between p-4 border-t">
              <div className="text-xs text-muted-foreground">Page {emiPage + 1} of {emiTotalPages || 1}</div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setEmiPage(p => Math.max(0, p - 1))} disabled={emiPage === 0}>
                  <ChevronLeft className="h-4 w-4" />Previous
                </Button>
                <Button variant="outline" size="sm" onClick={() => setEmiPage(p => p + 1)} disabled={emiPage >= emiTotalPages - 1}>
                  Next<ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Payment Request Details</DialogTitle>
            <DialogDescription>Full details submitted by the student.</DialogDescription>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Student</p>
                  <p className="font-semibold">{selectedRequest.profiles?.full_name}</p>
                  <p className="text-xs text-muted-foreground">{selectedRequest.profiles?.registration_id}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Course</p>
                  <p className="font-semibold">{selectedRequest.courses?.name}</p>
                  <p className="text-xs text-muted-foreground">Price: ৳{selectedRequest.courses?.price}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Amount Sent</p>
                  <p className="font-bold text-green-700">৳{selectedRequest.amount_sent || "N/A"}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Payment Method</p>
                  <p className="capitalize font-medium">{selectedRequest.payment_method}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Sender Last 5 Digits</p>
                  <p className="font-mono font-bold">{selectedRequest.sender_last5 || selectedRequest.trx_id}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Contact Number</p>
                  <p className="font-medium">{selectedRequest.contact_number || selectedRequest.phone}</p>
                </div>
                {selectedRequest.due_amount && selectedRequest.due_amount > 0 ? (
                  <>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Due Amount</p>
                      <p className="font-bold text-amber-700">৳{selectedRequest.due_amount}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">Due Date</p>
                      <p className={`font-semibold ${isDueCritical(selectedRequest.due_date) ? 'text-red-600' : ''}`}>
                        {selectedRequest.due_date ? safeFormat(selectedRequest.due_date, "PPP") : "Not set"}
                        {isDueCritical(selectedRequest.due_date) && " ⚠️ OVERDUE"}
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="col-span-2 text-green-600 font-medium text-xs">✅ No outstanding due</div>
                )}
                {selectedRequest.status === 'approved' && selectedRequest.updated_at && (
                  <div className="space-y-1 col-span-2 pt-2 border-t mt-2">
                    <p className="text-xs text-muted-foreground">Approved On</p>
                    <p className="font-semibold text-green-700 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" />
                      {safeFormat(selectedRequest.updated_at, "PPP, hh:mm a")}
                    </p>
                  </div>
                )}
              </div>
              {selectedRequest.social_link && (
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Social Link</p>
                  <a href={selectedRequest.social_link} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline flex items-center gap-1">
                    <ExternalLink className="h-3.5 w-3.5" />
                    {selectedRequest.social_link}
                  </a>
                </div>
              )}
              {selectedRequest.admin_note && (
                <div className="space-y-1 p-3 bg-muted/40 rounded-md border">
                  <p className="text-xs text-muted-foreground">Admin Note</p>
                  <p className="text-sm">{selectedRequest.admin_note}</p>
                </div>
              )}
              <div className="flex gap-2 pt-2">
                {selectedRequest.contact_number && (
                  <Button size="sm" variant="outline" asChild className="gap-2 bg-green-50 border-green-200 text-green-700 hover:bg-green-100">
                    <a href={`https://wa.me/88${selectedRequest.contact_number.replace(/^0/, '')}`} target="_blank" rel="noreferrer">
                      <MessageCircle className="h-4 w-4" />WhatsApp
                    </a>
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => navigate(`/admin/student/${selectedRequest.profile_id}`)}>
                  View Student Profile
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Reduce Due (EMI) Dialog */}
      <Dialog open={reduceDialogOpen} onOpenChange={setReduceDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TrendingDown className="h-5 w-5 text-green-600" />
              Record EMI / Partial Payment
            </DialogTitle>
            <DialogDescription>
              Student: <strong>{selectedRequest?.profiles?.full_name}</strong> — Remaining due: 
              <strong className="text-amber-700 ml-1">৳{((selectedRequest?.due_amount || 0) - (selectedRequest?.amount_paid || 0))}</strong>
            </DialogDescription>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Amount Received (EMI)</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground font-bold">৳</span>
                  <Input
                    type="number"
                    placeholder="e.g. 500"
                    className="pl-7"
                    value={reduceAmount}
                    onChange={e => setReduceAmount(e.target.value)}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  After this payment: ৳{Math.max(0, (selectedRequest.due_amount || 0) - (selectedRequest.amount_paid || 0) - Number(reduceAmount || 0))} remaining
                </p>
              </div>
              <div className="space-y-2">
                <Label>Admin Note (Optional)</Label>
                <Input
                  placeholder="e.g. EMI received via bKash on Apr 25"
                  value={adminNote}
                  onChange={e => setAdminNote(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setReduceDialogOpen(false)}>Cancel</Button>
                <Button
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={() => {
                    if (!reduceAmount || Number(reduceAmount) <= 0) {
                      toast.error("Enter a valid amount");
                      return;
                    }
                    reduceDueMutation.mutate({
                      requestId: selectedRequest.id,
                      amount: Number(reduceAmount),
                      note: adminNote,
                    });
                  }}
                  disabled={reduceDueMutation.isPending}
                >
                  {reduceDueMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Record Payment
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPayments;
