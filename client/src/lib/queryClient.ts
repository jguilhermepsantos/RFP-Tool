import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

interface ApiRequestOptions extends RequestInit {
  params?: Record<string, any>;
}

export async function apiRequest<T = any>(
  url: string,
  options?: ApiRequestOptions,
): Promise<T> {
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

  console.log(`🔍 API Request: ${options?.method || 'GET'} ${finalUrl}`);
  
  const startTime = performance.now();
  const res = await fetch(finalUrl, {
    method: options?.method || 'GET',
    headers: options?.headers || {},
    body: options?.body,
    credentials: "include",
  });
  
  const endTime = performance.now();
  console.log(`✅ API Response: ${options?.method || 'GET'} ${finalUrl} - ${res.status} in ${Math.round(endTime - startTime)}ms`);

  await throwIfResNotOk(res);
  
  // If it's a GET request, try to parse the JSON
  if (!options?.method || options.method === 'GET') {
    return await res.json();
  }
  
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey[0] as string;
    console.log(`🔍 QueryFn Request: GET ${url}`);
    
    const startTime = performance.now();
    const res = await fetch(url, {
      credentials: "include",
    });
    
    const endTime = performance.now();
    console.log(`✅ QueryFn Response: GET ${url} - ${res.status} in ${Math.round(endTime - startTime)}ms`);

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
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
