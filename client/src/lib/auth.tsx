import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from './supabase';
import { useLocation } from 'wouter';

interface User {
  id: number;
  email: string;
  isAdmin: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [_, setLocation] = useLocation();

  useEffect(() => {
    // Check if the user is already logged in
    async function loadUser() {
      setLoading(true);
      const { user, error } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
    }
    
    loadUser();
  }, []);

  async function login(email: string, password: string) {
    try {
      const { user, error } = await supabase.auth.signInWithPassword({ email, password });
      
      if (error) {
        return { success: false, error: error.message };
      }
      
      setUser(user);
      return { success: true };
    } catch (err) {
      return { success: false, error: 'An unexpected error occurred' };
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    setUser(null);
    setLocation('/login');
  }

  const value = {
    user,
    loading,
    login,
    logout
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [location, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !user && location !== '/login') {
      setLocation('/login');
    }
  }, [user, loading, location, setLocation]);

  if (loading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
  }

  if (!user && location !== '/login') {
    return null;
  }

  return <>{children}</>;
}
