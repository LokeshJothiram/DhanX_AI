import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from './DashboardLayout';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user } = useAuth();
  const token = localStorage.getItem('token');

  // Only redirect to login if there's no token AND no user
  // If token exists, render the layout immediately (even if user is still loading)
  // This allows the page structure to show immediately while data loads
  if (!user && !token) {
    return <Navigate to="/login" replace />;
  }

  // Render layout immediately - let pages handle their own loading states
  // If user is still loading, the layout will show and pages will show loaders in data sections
  return <DashboardLayout>{children}</DashboardLayout>;
};

export default ProtectedRoute;

