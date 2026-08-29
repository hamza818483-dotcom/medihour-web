import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  allowedRoles?: string[];
}

const ProtectedRoute = ({ children, requireAdmin = false, allowedRoles = [] }: ProtectedRouteProps) => {
  const { user, isAdmin, isTeacher, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // If user is not logged in, redirect to login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // If user is logged in but requires admin rights and doesn't have them, redirect to dashboard
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  // Check generic allowed roles (e.g. ['admin', 'teacher'])
  if (allowedRoles.length > 0) {
      const hasRole = (allowedRoles.includes('admin') && isAdmin) ||
                      (allowedRoles.includes('teacher') && isTeacher);

      if (!hasRole) {
          return <Navigate to="/dashboard" replace />;
      }
  }

  // If user is logged in (and has rights if needed), render children
  return <>{children}</>;
};

export default ProtectedRoute;
