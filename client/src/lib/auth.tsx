import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from './supabase';
import { useLocation } from 'wouter';
import { User as SupabaseUser } from '@supabase/supabase-js';

interface AuthUserData {
  id: string;
  email: string;
  role: string | null;
  name: string | null;
}

interface AuthContextType {
  user: AuthUserData | null;
  session: any | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUserData | null>(null);
  const [session, setSession] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [_, setLocation] = useLocation();

  useEffect(() => {
    // Check if the user is already logged in
    async function loadUser() {
      setLoading(true);
      
      // Get current session
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
      
      if (session) {
        // Try to get user profile data from the users table
        const { data: userData, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', session.user.id)
          .maybeSingle(); // Use maybeSingle instead of single to handle missing user
          
        if (userData && !error) {
          setUser(userData as AuthUserData);
        } else {
          // If no user profile exists, let's use the auth user data
          // This allows login to work even without a complete profile
          console.log('Using auth user data instead of profile:', session.user);
          setUser({
            id: session.user.id,
            email: session.user.email || '',
            name: session.user.user_metadata?.name,
            role: 'user'
          } as AuthUserData);
        }
      }
      
      setLoading(false);
      
      // Set up auth state change listener
      const { data: { subscription } } = await supabase.auth.onAuthStateChange(
        (_event, session) => {
          setSession(session);
          if (!session) {
            setUser(null);
          }
        }
      );
      
      // Clean up subscription
      return () => {
        subscription.unsubscribe();
      };
    }
    
    loadUser();
  }, []);

  async function login(email: string, password: string) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ 
        email, 
        password 
      });
      
      if (error) {
        return { success: false, error: error.message };
      }
      
      // Fetch user profile from users table
      const { data: userData, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('id', data.user.id)
        .maybeSingle(); // Use maybeSingle to handle cases where profile doesn't exist
        
      if (userData && !profileError) {
        setUser(userData as AuthUserData);
      } else {
        console.log('Using auth user data for login:', data.user);
        // If no user profile exists in the users table, create one from auth data
        setUser({
          id: data.user.id,
          email: data.user.email || '',
          name: data.user.user_metadata?.name,
          role: 'user'
        } as AuthUserData);
        
        // Optionally create a user profile record here if needed
        // This could be done via a server API endpoint
      }
      
      setSession(data.session);
      return { success: true };
    } catch (err) {
      console.error('Login error:', err);
      return { success: false, error: 'An unexpected error occurred' };
    }
  }

  async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error logging out:', error.message);
    }
    
    setUser(null);
    setSession(null);
    setLocation('/login');
  }

  const value = {
    user,
    session,
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
