import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { queryHealthMonitor } from "./queryHealthMonitor";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

interface ApiRequestOptions extends RequestInit {
  params?: Record<string, any>;
  timeout?: number;
}

// Create timeout promise helper
function createTimeoutPromise(timeout: number) {
  return new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error('Request timeout')), timeout);
  });
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

  const timeout = options?.timeout || 30000; // 30 second default timeout
  
  const fetchPromise = fetch(finalUrl, {
    method: options?.method || 'GET',
    headers: options?.headers || {},
    body: options?.body,
    credentials: "include",
  });

  // Race between fetch and timeout
  const res = await Promise.race([
    fetchPromise,
    createTimeoutPromise(timeout)
  ]);

  await throwIfResNotOk(res);
  
  // Parse JSON for all successful requests
  try {
    return await res.json();
  } catch (e) {
    // If JSON parsing fails, return the response object
    return res;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";

// Enhanced query function with health monitoring and timeout
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey, signal }) => {
    const queryKeyStr = queryKey[0] as string;
    
    // Track query start
    queryHealthMonitor.trackQueryStart(queryKeyStr);
    
    try {
      // Create timeout promise with longer timeout for chat endpoints
      const isChatEndpoint = queryKeyStr.includes('/chat');
      const timeoutMs = isChatEndpoint ? 90000 : 30000; // 90 seconds for chat, 30 for others
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Query timeout after ${timeoutMs/1000} seconds`)), timeoutMs);
      });
      
      // Create fetch promise
      const fetchPromise = fetch(queryKeyStr, {
        credentials: "include",
        signal, // Respect abort signal from React Query
      });
      
      // Race between fetch and timeout
      const res = await Promise.race([fetchPromise, timeoutPromise]);

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        queryHealthMonitor.trackQueryComplete(queryKeyStr);
        return null;
      }

      await throwIfResNotOk(res);
      const result = await res.json();
      
      // Track successful completion
      queryHealthMonitor.trackQueryComplete(queryKeyStr);
      return result;
      
    } catch (error) {
      // Track query error
      queryHealthMonitor.trackQueryError(queryKeyStr);
      throw error;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000,
      retry: (failureCount, error) => {
        // Don't retry timeouts or 401/403 errors
        if (error.message.includes('timeout') || 
            error.message.includes('401') || 
            error.message.includes('403')) {
          return false;
        }
        // Retry up to 2 times for other errors
        return failureCount < 2;
      },
      retryDelay: attemptIndex => Math.min(1000 * 2 ** attemptIndex, 30000),
      // Network mode to prevent hanging on network issues
      networkMode: 'always',
    },
    mutations: {
      retry: false,
    },
  },
});
