import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

interface QueryHealthState {
  stuckQueries: Set<string>;
  failedQueries: Set<string>;
  lastAuthChange: number;
  resetCount: number;
  lastResetTime: number;
}

class QueryHealthMonitor {
  private state: QueryHealthState = {
    stuckQueries: new Set(),
    failedQueries: new Set(),
    lastAuthChange: Date.now(),
    resetCount: 0,
    lastResetTime: 0
  };
  
  private queryStartTimes = new Map<string, number>();
  private monitorInterval: NodeJS.Timeout | null = null;
  private queryClient: any = null;
  private toast: any = null;
  
  private readonly STUCK_TIMEOUT = 30000; // 30 seconds
  private readonly CORRUPTION_THRESHOLD = 3; // 3 stuck queries = corruption
  private readonly RESET_COOLDOWN = 60000; // 1 minute between resets
  
  init(queryClient: any, toast: any) {
    this.queryClient = queryClient;
    this.toast = toast;
    this.startMonitoring();
  }
  
  cleanup() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
  }
  
  trackQueryStart(queryKey: string) {
    this.queryStartTimes.set(queryKey, Date.now());
    this.state.stuckQueries.delete(queryKey);
  }
  
  trackQueryComplete(queryKey: string) {
    this.queryStartTimes.delete(queryKey);
    this.state.stuckQueries.delete(queryKey);
    this.state.failedQueries.delete(queryKey);
  }
  
  trackQueryError(queryKey: string) {
    this.queryStartTimes.delete(queryKey);
    this.state.stuckQueries.delete(queryKey);
    this.state.failedQueries.add(queryKey);
  }
  
  trackAuthChange() {
    this.state.lastAuthChange = Date.now();
  }
  
  private startMonitoring() {
    this.monitorInterval = setInterval(() => {
      this.checkForStuckQueries();
      this.checkForCorruption();
    }, 10000); // Check every 10 seconds
  }
  
  private checkForStuckQueries() {
    const now = Date.now();
    
    // Convert to array to avoid iteration issues
    const entries = Array.from(this.queryStartTimes.entries());
    
    for (const [queryKey, startTime] of entries) {
      if (now - startTime > this.STUCK_TIMEOUT) {
        this.state.stuckQueries.add(queryKey);
        console.warn(`Query stuck for ${(now - startTime) / 1000}s:`, queryKey);
        
        // Cancel the stuck query
        this.queryClient?.cancelQueries({ queryKey: [queryKey] });
        this.queryStartTimes.delete(queryKey);
      }
    }
  }
  
  private checkForCorruption() {
    const stuckCount = this.state.stuckQueries.size;
    const failedCount = this.state.failedQueries.size;
    const now = Date.now();
    
    // Check if we meet corruption criteria
    const isCorrupted = stuckCount >= this.CORRUPTION_THRESHOLD || 
                       (stuckCount >= 2 && failedCount >= 2);
    
    if (isCorrupted && (now - this.state.lastResetTime) > this.RESET_COOLDOWN) {
      this.performQueryClientReset();
    }
  }
  
  private performQueryClientReset() {
    console.warn('Query client corruption detected, performing reset');
    
    try {
      // Clear all queries except auth-related ones
      this.queryClient?.removeQueries({
        predicate: (query: any) => {
          const queryKey = query.queryKey[0] as string;
          return !queryKey.includes('/auth') && !queryKey.includes('/users');
        }
      });
      
      // Reset internal state
      this.state.stuckQueries.clear();
      this.state.failedQueries.clear();
      this.queryStartTimes.clear();
      this.state.resetCount++;
      this.state.lastResetTime = Date.now();
      
      // Notify user
      this.toast?.({
        title: "Connection Restored",
        description: "Data synchronization has been reset to resolve loading issues.",
        variant: "default"
      });
      
    } catch (error) {
      console.error('Error during query client reset:', error);
    }
  }
  
  getHealthStats() {
    return {
      stuckQueries: Array.from(this.state.stuckQueries),
      failedQueries: Array.from(this.state.failedQueries),
      activeQueries: this.queryStartTimes.size,
      resetCount: this.state.resetCount,
      isHealthy: this.state.stuckQueries.size === 0 && this.state.failedQueries.size < 2
    };
  }
  
  forceReset() {
    this.state.lastResetTime = 0; // Reset cooldown
    this.performQueryClientReset();
  }
}

// Global instance
export const queryHealthMonitor = new QueryHealthMonitor();

// React hook for using the health monitor
export function useQueryHealthMonitor() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const initialized = useRef(false);
  
  useEffect(() => {
    if (!initialized.current) {
      queryHealthMonitor.init(queryClient, toast);
      initialized.current = true;
    }
    
    return () => {
      if (initialized.current) {
        queryHealthMonitor.cleanup();
        initialized.current = false;
      }
    };
  }, [queryClient, toast]);
  
  return {
    getHealthStats: () => queryHealthMonitor.getHealthStats(),
    forceReset: () => queryHealthMonitor.forceReset(),
    trackAuthChange: () => queryHealthMonitor.trackAuthChange()
  };
}