// This is a mock implementation for the Supabase client
// In a real project, you would use the actual Supabase client

interface User {
  id: number;
  email: string;
  isAdmin: boolean;
}

interface AuthResponse {
  user: User | null;
  error: Error | null;
}

export class SupabaseClient {
  private currentUser: User | null = null;

  auth = {
    signInWithPassword: async (credentials: { email: string; password: string }): Promise<AuthResponse> => {
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(credentials),
        });

        if (!response.ok) {
          const errorData = await response.json();
          return { user: null, error: new Error(errorData.message || 'Failed to login') };
        }

        const data = await response.json();
        this.currentUser = data.user;
        
        // Save user to localStorage to persist session
        localStorage.setItem('supabase.auth.user', JSON.stringify(data.user));
        
        return { user: data.user, error: null };
      } catch (error) {
        return { user: null, error: error as Error };
      }
    },

    signOut: async (): Promise<{ error: Error | null }> => {
      this.currentUser = null;
      localStorage.removeItem('supabase.auth.user');
      return { error: null };
    },

    getUser: async (): Promise<{ user: User | null; error: Error | null }> => {
      // Get user from localStorage
      const storedUser = localStorage.getItem('supabase.auth.user');
      if (storedUser) {
        try {
          this.currentUser = JSON.parse(storedUser);
          return { user: this.currentUser, error: null };
        } catch (error) {
          return { user: null, error: error as Error };
        }
      }
      return { user: null, error: null };
    }
  };
}

// Create a singleton instance
export const supabase = new SupabaseClient();
