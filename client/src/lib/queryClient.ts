import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { supabase } from "./supabase";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

interface ApiRequestOptions extends RequestInit {
  params?: Record<string, any>;
}

export async function apiRequest(
  url: string,
  options?: ApiRequestOptions,
): Promise<Response> {
  // Add URL parameters if provided
  let finalUrl = url;
  if (options?.params) {
    const queryParams = new URLSearchParams();
    Object.entries(options.params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        queryParams.append(key, String(value));
      }
    });
    
    const queryString = queryParams.toString();
    if (queryString) {
      finalUrl = `${url}${url.includes('?') ? '&' : '?'}${queryString}`;
    }
  }

  // Prepare headers
  const headers: Record<string, string> = { ...options?.headers } || {};
  
  // For admin endpoints, include the user's email in the authorization header
  if (url.includes('/admin/') || url.includes('/projects/all')) {
    const userEmail = await getCurrentUserEmail();
    if (userEmail) {
      headers.authorization = userEmail;
    }
  }

  const res = await fetch(finalUrl, {
    method: options?.method || 'GET',
    headers,
    body: options?.body,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  
  // If it's a GET request, try to parse the JSON
  if (!options?.method || options.method === 'GET') {
    return await res.json();
  }
  
  return res;
}

// Helper function to get current user email for authorization
async function getCurrentUserEmail(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.email || null;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey[0] as string;
    const headers: Record<string, string> = {};
    
    // For admin endpoints, include the user's email in the authorization header
    if (url.includes('/admin/') || url.includes('/projects/all')) {
      const userEmail = await getCurrentUserEmail();
      if (userEmail) {
        headers.authorization = userEmail;
      }
    }
    
    const res = await fetch(url, {
      credentials: "include",
      headers,
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      // Changed from Infinity to 5 minutes for user-dependent data
      staleTime: 5 * 60 * 1000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
