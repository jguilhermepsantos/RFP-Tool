import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface User {
  id: string;
  email: string;
  name?: string;
}

interface UseUserCacheResult {
  getUserEmail: (userId: string | null) => string;
  getUserName: (userId: string | null) => string;
  isLoading: boolean;
  error: Error | null;
}

export function useUserCache(userIds: (string | null)[]): UseUserCacheResult {
  // Filter out null/undefined values and remove duplicates
  const validUserIds = Array.from(new Set(userIds.filter(Boolean))) as string[];

  const { data: usersData, isLoading, error } = useQuery<{ users: User[] }>({
    queryKey: ['/api/users/batch', validUserIds.sort().join(',')],
    queryFn: async () => {
      if (validUserIds.length === 0) {
        return { users: [] };
      }

      return await apiRequest('/api/users/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userIds: validUserIds }),
      }) as { users: User[] };
    },
    enabled: validUserIds.length > 0,
    staleTime: 10 * 60 * 1000, // Cache users for 10 minutes
  });

  // Create a lookup map for O(1) access
  const userMap = new Map<string, User>();
  if (usersData?.users) {
    usersData.users.forEach((user: User) => {
      userMap.set(user.id, user);
    });
  }

  const getUserEmail = (userId: string | null): string => {
    if (!userId) return 'Unknown User';
    const user = userMap.get(userId);
    return user?.email || 'Unknown User';
  };

  const getUserName = (userId: string | null): string => {
    if (!userId) return 'Unknown User';
    const user = userMap.get(userId);
    return user?.name || user?.email || 'Unknown User';
  };

  return {
    getUserEmail,
    getUserName,
    isLoading,
    error: error as Error | null,
  };
}