import { useAuth } from '../contexts/AuthContext';

export const ProtectedRoute = ({ children, requiredRole }: { 
  children: React.ReactNode; 
  requiredRole?: string 
}) => {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) return <div>Loading...</div>;
  if (!isAuthenticated) return <div>Unauthorized - Please login</div>;
  
  // Role-based guard
  if (requiredRole && user?.role !== requiredRole) {
    return <div>Unauthorized - Insufficient permissions</div>;
  }

  return <>{children}</>;
};