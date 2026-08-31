import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { HelmetProvider } from "react-helmet-async";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import SyllabusTracker from "./pages/public/SyllabusTracker";
import PublicLayout from "./layouts/PublicLayout";
import ErrorBoundary from "@/components/ErrorBoundary";
import DashboardLayout from "./layouts/DashboardLayout";
import AdminLayout from "./layouts/AdminLayout";
import DashboardHome from "./pages/dashboard/DashboardHome";
import LiveClass from "./pages/dashboard/LiveClass";
import Recordings from "./pages/dashboard/Recordings";
import LiveExam from "./pages/dashboard/LiveExam";
import ExamResults from "./pages/dashboard/ExamResults";
import PastExamCatalog from "./pages/dashboard/PastExamCatalog";
import TakeExam from "./pages/dashboard/TakeExam";
import TakeMistakeExam from "./pages/dashboard/TakeMistakeExam";
import ExamReview from "./pages/dashboard/ExamReview";
import Leaderboard from "./pages/dashboard/Leaderboard";
import Bookmarks from "./pages/dashboard/Bookmarks";
import MyMistakes from "./pages/dashboard/MyMistakes";
import MyProgress from "./pages/dashboard/MyProgress";
import TopPerformer from "./pages/dashboard/TopPerformer";
import Routine from "./pages/dashboard/Routine";
import ClassNotes from "./pages/dashboard/ClassNotes";
import NoteDetails from "./pages/dashboard/NoteDetails";
import Community from "./pages/dashboard/Community";
import Announcements from "./pages/dashboard/Announcements";
import StudentProfile from "./pages/dashboard/StudentProfile";
import ExamAnalytics from "./pages/dashboard/ExamAnalytics";
import Archive from "./pages/dashboard/Archive";
import CustomExamBuilder from "./pages/dashboard/CustomExamBuilder";
import ExamCalendar from "./pages/dashboard/ExamCalendar";
import MyCourses from "./pages/dashboard/MyCourses";
import ExtraCourses from "./pages/dashboard/ExtraCourses";
import CourseView from "./pages/dashboard/CourseView";
import AdmissionTest from "./pages/dashboard/AdmissionTest";
import AdmissionTestPlay from "./pages/dashboard/AdmissionTestPlay";
import ClassPlayerPage from "./pages/dashboard/ClassPlayerPage";
import DemoClassPlayerPage from "./pages/dashboard/DemoClassPlayerPage";
import Program from "./pages/dashboard/Program";
import AdminDashboardHome from "./pages/dashboard/admin/AdminDashboardHome";
import AdminCourses from "./pages/dashboard/admin/AdminCourses";
import AdminStudents from "./pages/dashboard/admin/AdminStudents";
import AdminClasses from "./pages/dashboard/admin/AdminClasses";
import AdminRoutines from "./pages/dashboard/admin/AdminRoutines";
import AdminExams from "./pages/dashboard/admin/AdminExams";
import AdminAnnouncements from "./pages/dashboard/admin/AdminAnnouncements";
import AdminCommunity from "./pages/dashboard/admin/AdminCommunity";
import AdminOfficialLinks from "./pages/dashboard/admin/AdminOfficialLinks";
import AdminPayments from "./pages/dashboard/admin/AdminPayments";
import AdminPaymentHistory from "./pages/dashboard/admin/AdminPaymentHistory";
import AdminNotes from "./pages/dashboard/admin/AdminNotes";
import AdminArchiveManager from "./pages/dashboard/admin/ArchiveManager";
import AdminExamCalendar from "./pages/dashboard/admin/AdminExamCalendar";
import AdminFreeContent from "./pages/dashboard/admin/AdminFreeContent";
import AdminMentors from "./pages/dashboard/admin/AdminMentors";
import AdminSuccessGallery from "./pages/dashboard/admin/AdminSuccessGallery";
import AdminPromoCodes from "./pages/dashboard/admin/AdminPromoCodes";
import AdminHeroes from "./pages/dashboard/admin/AdminHeroes";
import AdminReviews from "./pages/dashboard/admin/AdminReviews";
import AdminReports from "./pages/dashboard/admin/AdminReports";
import AdminAdmissionTest from "./pages/dashboard/admin/AdminAdmissionTest";
import AdminSyllabusTracker from "./pages/dashboard/admin/AdminSyllabusTracker";
import AdminTelegramChannels from "./pages/dashboard/admin/AdminTelegramChannels";
import ExamCreator from "./pages/dashboard/admin/ExamCreator";
import QuestionBank from "./pages/dashboard/admin/QuestionBank";
import UnifiedContentCreator from "./pages/dashboard/admin/UnifiedContentCreator";
import CourseDashboard from "./pages/dashboard/admin/CourseDashboard";
import StudentProfileView from "./pages/dashboard/admin/StudentProfileView";
import StudentCourseResults from "./pages/dashboard/admin/StudentCourseResults";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

const App = () => {
  return (
    <HelmetProvider>
    <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <NotificationProvider>
            <Routes>
              <Route element={<ErrorBoundary><PublicLayout /></ErrorBoundary>}>
                <Route path="/" element={<ErrorBoundary><Index /></ErrorBoundary>} />
                <Route path="/login" element={<ErrorBoundary><Login /></ErrorBoundary>} />
                <Route path="/register" element={<ErrorBoundary><Register /></ErrorBoundary>} />
                <Route path="/forgot-password" element={<ErrorBoundary><ForgotPassword /></ErrorBoundary>} />
                <Route path="/reset-password" element={<ErrorBoundary><ResetPassword /></ErrorBoundary>} />
                <Route path="/syllabus-tracker" element={<ErrorBoundary><SyllabusTracker /></ErrorBoundary>} />
              </Route>

              <Route path="/dashboard" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
                <Route index element={<ErrorBoundary><DashboardHome /></ErrorBoundary>} />
                <Route path="live-class" element={<ErrorBoundary><LiveClass /></ErrorBoundary>} />
                <Route path="class/:classId" element={<ErrorBoundary><ClassPlayerPage /></ErrorBoundary>} />
                <Route path="recordings" element={<ErrorBoundary><Recordings /></ErrorBoundary>} />
                <Route path="live-exam" element={<ErrorBoundary><LiveExam /></ErrorBoundary>} />
                <Route path="take-exam/:examId" element={<ErrorBoundary><TakeExam /></ErrorBoundary>} />
                <Route path="take-mistakes" element={<ErrorBoundary><TakeMistakeExam /></ErrorBoundary>} />
                <Route path="past-exam" element={<ErrorBoundary><PastExamCatalog /></ErrorBoundary>} />
                <Route path="results" element={<ErrorBoundary><ExamResults /></ErrorBoundary>} />
                <Route path="exam-review/:attemptId" element={<ErrorBoundary><ExamReview /></ErrorBoundary>} />
                <Route path="leaderboard/:examId" element={<ErrorBoundary><Leaderboard /></ErrorBoundary>} />
                <Route path="bookmarks" element={<ErrorBoundary><Bookmarks /></ErrorBoundary>} />
                <Route path="my-mistakes" element={<ErrorBoundary><MyMistakes /></ErrorBoundary>} />
                <Route path="my-progress" element={<ErrorBoundary><MyProgress /></ErrorBoundary>} />
                <Route path="top-performer" element={<ErrorBoundary><TopPerformer /></ErrorBoundary>} />
                <Route path="routine" element={<ErrorBoundary><Routine /></ErrorBoundary>} />
                <Route path="class-notes" element={<ErrorBoundary><ClassNotes /></ErrorBoundary>} />
                <Route path="class-notes/:noteId" element={<ErrorBoundary><NoteDetails /></ErrorBoundary>} />
                <Route path="community" element={<ErrorBoundary><Community /></ErrorBoundary>} />
                <Route path="announcements" element={<ErrorBoundary><Announcements /></ErrorBoundary>} />
                <Route path="profile" element={<ErrorBoundary><StudentProfile /></ErrorBoundary>} />
                <Route path="analytics" element={<ErrorBoundary><ExamAnalytics /></ErrorBoundary>} />
                <Route path="program" element={<ErrorBoundary><Program /></ErrorBoundary>} />
                <Route path="calendar" element={<ErrorBoundary><ExamCalendar /></ErrorBoundary>} />
                <Route path="admission-test" element={<ErrorBoundary><AdmissionTest /></ErrorBoundary>} />
                <Route path="admission-test/play" element={<ErrorBoundary><AdmissionTestPlay /></ErrorBoundary>} />
                <Route path="readymade/custom-exam" element={<ErrorBoundary><CustomExamBuilder /></ErrorBoundary>} />
                <Route path="archive" element={<ErrorBoundary><Archive /></ErrorBoundary>} />
                <Route path="my-courses" element={<ErrorBoundary><MyCourses /></ErrorBoundary>} />
                <Route path="extra-courses" element={<ErrorBoundary><ExtraCourses /></ErrorBoundary>} />
                <Route path="course/:courseId" element={<ErrorBoundary><CourseView /></ErrorBoundary>} />
              </Route>

              <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><AdminLayout /></ProtectedRoute>}>
                <Route index element={<ErrorBoundary><AdminDashboardHome /></ErrorBoundary>} />
                <Route path="courses" element={<ProtectedRoute requireAdmin><AdminCourses /></ProtectedRoute>} />
                <Route path="students" element={<ProtectedRoute requireAdmin><AdminStudents /></ProtectedRoute>} />
                <Route path="classes" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><AdminClasses /></ProtectedRoute>} />
                <Route path="routines" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><AdminRoutines /></ProtectedRoute>} />
                <Route path="exams" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><AdminExams /></ProtectedRoute>} />
                <Route path="exams/question-maker" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><ExamCreator /></ProtectedRoute>} />
                <Route path="exams/question-maker/:examId" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><ExamCreator /></ProtectedRoute>} />
                <Route path="question-bank" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><QuestionBank /></ProtectedRoute>} />
                <Route path="announcements" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><AdminAnnouncements /></ProtectedRoute>} />
                <Route path="community" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><AdminCommunity /></ProtectedRoute>} />
                <Route path="official-links" element={<ProtectedRoute allowedRoles={['admin']}><AdminOfficialLinks /></ProtectedRoute>} />
                <Route path="notes" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><AdminNotes /></ProtectedRoute>} />
                <Route path="archive" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><AdminArchiveManager /></ProtectedRoute>} />
                <Route path="calendar" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><AdminExamCalendar /></ProtectedRoute>} />
                <Route path="free-content" element={<ProtectedRoute requireAdmin><AdminFreeContent /></ProtectedRoute>} />
                <Route path="payments" element={<ProtectedRoute requireAdmin><ErrorBoundary><AdminPayments /></ErrorBoundary></ProtectedRoute>} />
                <Route path="payments/history" element={<ProtectedRoute requireAdmin><AdminPaymentHistory /></ProtectedRoute>} />
                <Route path="mentors" element={<ProtectedRoute requireAdmin><AdminMentors /></ProtectedRoute>} />
                <Route path="success-gallery" element={<ProtectedRoute requireAdmin><AdminSuccessGallery /></ProtectedRoute>} />
                <Route path="promos" element={<ProtectedRoute requireAdmin><AdminPromoCodes /></ProtectedRoute>} />
                <Route path="heroes" element={<ProtectedRoute requireAdmin><AdminHeroes /></ProtectedRoute>} />
                <Route path="reviews" element={<ProtectedRoute requireAdmin><AdminReviews /></ProtectedRoute>} />
                <Route path="reports" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><AdminReports /></ProtectedRoute>} />
                <Route path="admission-test" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><AdminAdmissionTest /></ProtectedRoute>} />
                <Route path="syllabus-tracker" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><AdminSyllabusTracker /></ProtectedRoute>} />
                <Route path="telegram-channels" element={<ProtectedRoute requireAdmin><AdminTelegramChannels /></ProtectedRoute>} />
                <Route path="content-creator" element={<ProtectedRoute allowedRoles={['admin', 'teacher']}><UnifiedContentCreator /></ProtectedRoute>} />
                <Route path="course-dashboard/:courseId" element={<ProtectedRoute requireAdmin><CourseDashboard /></ProtectedRoute>} />
                <Route path="student/:studentId" element={<ProtectedRoute requireAdmin><StudentProfileView /></ProtectedRoute>} />
                <Route path="student/:studentId/course-results/:courseId" element={<ProtectedRoute requireAdmin><StudentCourseResults /></ProtectedRoute>} />
              </Route>

              <Route path="/take-exam/:examId" element={<ErrorBoundary><TakeExam /></ErrorBoundary>} />
              <Route path="/exam-review/:attemptId" element={<ErrorBoundary><ExamReview /></ErrorBoundary>} />

              <Route path="*" element={<ErrorBoundary><NotFound /></ErrorBoundary>} />
            </Routes>
            </NotificationProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
    </QueryClientProvider>
    </HelmetProvider>
  );
};

export default App;
