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

      const response = await apiRequest('/api/users/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userIds: validUserIds }),
      });
      console.log('useUserCache API response:', response);
      return response as { users: User[] };
    },
    enabled: validUserIds.length > 0,
    staleTime: 10 * 60 * 1000, // Cache users for 10 minutes
  });

  // Create a lookup map for O(1) access
  const userMap = new Map<string, User>();
  console.log('useUserCache usersData:', usersData);
  if (usersData?.users) {
    console.log('useUserCache processing users:', usersData.users);
    usersData.users.forEach((user: User) => {
      console.log('useUserCache adding user to map:', user);
      userMap.set(user.id, user);
    });
  } else {
    console.log('useUserCache no users data available');
  }
  console.log('useUserCache final userMap size:', userMap.size);

  const getUserEmail = (userId: string | null): string => {
    console.log('getUserEmail called with userId:', userId);
    if (!userId) {
      console.log('getUserEmail returning Unknown User (null userId)');
      return 'Unknown User';
    }
    const user = userMap.get(userId);
    console.log('getUserEmail userMap lookup result:', user);
    console.log('getUserEmail userMap contents:', Array.from(userMap.entries()));
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