import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import DashboardLayout from './DashboardLayout';

interface AdminProtectedRouteProps {
  children: React.ReactNode;
}

const AdminProtectedRoute: React.FC<AdminProtectedRouteProps> = ({ children }) => {
  const { user, isAdmin } = useAuth();
  const token = localStorage.getItem('token');

  // Check if user is authenticated
  if (!user && !token) {
    return <Navigate to="/login" replace />;
  }

  // Check if user is admin
  if (user && !isAdmin()) {
    return <Navigate to="/dashboard" replace />;
  }

  // Render layout for admin users
  return <DashboardLayout>{children}</DashboardLayout>;
};

export default AdminProtectedRoute;

