import { useState, useEffect } from 'react';
import { useQueryHealthMonitor } from '@/lib/queryHealthMonitor';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RefreshCw, AlertTriangle } from 'lucide-react';

export function QueryRecoveryUI() {
  const { getHealthStats, forceReset } = useQueryHealthMonitor();
  const [showRecovery, setShowRecovery] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    const checkHealth = () => {
      const stats = getHealthStats();
      // Show recovery UI if there are stuck queries or many failures
      setShowRecovery(stats.stuckQueries.length > 0 || stats.failedQueries.length >= 3);
    };

    const interval = setInterval(checkHealth, 5000); // Check every 5 seconds
    return () => clearInterval(interval);
  }, [getHealthStats]);

  const handleReset = async () => {
    setIsResetting(true);
    try {
      forceReset();
      // Wait a moment for the reset to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      setShowRecovery(false);
    } catch (error) {
      console.error('Error during manual reset:', error);
    } finally {
      setIsResetting(false);
    }
  };

  if (!showRecovery) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-sm">
      <Alert className="border-orange-200 bg-orange-50">
        <AlertTriangle className="h-4 w-4 text-orange-600" />
        <AlertDescription className="text-orange-800">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">
              Data loading issues detected
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={handleReset}
              disabled={isResetting}
              className="w-fit text-orange-700 border-orange-300 hover:bg-orange-100"
            >
              {isResetting ? (
                <RefreshCw className="mr-2 h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-3 w-3" />
              )}
              {isResetting ? 'Resetting...' : 'Reset Connection'}
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}