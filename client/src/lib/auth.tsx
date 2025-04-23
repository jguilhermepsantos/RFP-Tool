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
        try {
          // Create or retrieve user profile - this ensures auth users always have a profile
          const userData = await ensureUserProfile(session.user);
          setUser(userData);
        } catch (error) {
          console.error("Error ensuring user profile:", error);
          // Fallback to basic auth data if profile creation fails
          setUser({
            id: session.user.id,
            email: session.user.email || '',
            name: session.user.user_metadata?.name,
            role: 'user'
          } as AuthUserData);
        }
      }
      
      setLoading(false);
      
      // Set up auth state change listener for real-time auth status changes
      const { data: { subscription } } = await supabase.auth.onAuthStateChange(
        async (event, session) => {
          console.log('Auth state changed:', event);
          setSession(session);
          
          if (!session) {
            setUser(null);
          } else if (event === 'SIGNED_IN') {
            // When user signs in, ensure they have a profile
            try {
              const userData = await ensureUserProfile(session.user);
              setUser(userData);
            } catch (error) {
              console.error("Error in auth change handler:", error);
            }
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

  // Helper function to create a user profile if it doesn't exist
  async function ensureUserProfile(authUser: SupabaseUser): Promise<AuthUserData> {
    // First try to get user by ID
    const { data: existingUserById, error: userByIdError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .maybeSingle();
      
    if (existingUserById) {
      return existingUserById as AuthUserData;
    }
    
    // Also try by email, in case the ID changed but email is the same
    const { data: existingUserByEmail, error: userByEmailError } = await supabase
      .from('users')
      .select('*')
      .eq('email', authUser.email)
      .maybeSingle();
      
    if (existingUserByEmail) {
      // If found by email but ID is different, we should update the ID
      if (existingUserByEmail.id !== authUser.id) {
        const { error: updateError } = await supabase
          .from('users')
          .update({ id: authUser.id })
          .eq('email', authUser.email);
          
        if (updateError) {
          console.error('Error updating user ID:', updateError);
        }
      }
      return existingUserByEmail as AuthUserData;
    }
    
    // If no profile exists, create one
    console.log('Creating user profile for:', authUser.email);
    
    const newUser = {
      id: authUser.id,
      email: authUser.email || '',
      name: authUser.user_metadata?.name || authUser.email?.split('@')[0] || null,
      role: 'admin', // Using 'admin' since that's what exists in your Supabase schema
      created_at: new Date().toISOString() // Using snake_case to match Supabase table column
    };
    
    const { data: createdUser, error: insertError } = await supabase
      .from('users')
      .insert([newUser])
      .select()
      .single();
      
    if (insertError) {
      console.error('Error creating user profile:', insertError);
      
      // If it's a duplicate key error, try to get the existing user
      if (insertError.code === '23505') {
        console.log('User already exists, fetching profile...');
        const { data: existingUser, error: fetchError } = await supabase
          .from('users')
          .select('*')
          .eq('email', authUser.email)
          .single();
          
        if (existingUser && !fetchError) {
          return existingUser as AuthUserData;
        }
      }
      
      // Return the constructed user as a fallback
      return newUser as AuthUserData;
    }
    
    return createdUser as AuthUserData;
  }

  async function login(email: string, password: string) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ 
        email, 
        password 
      });
      
      if (error) {
        return { success: false, error: error.message };
      }
      
      // Create or retrieve user profile
      const userData = await ensureUserProfile(data.user);
      setUser(userData);
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
