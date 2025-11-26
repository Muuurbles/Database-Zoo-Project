import { useQuery } from '@tanstack/react-query';
import { dashboardService } from '@/services/dashboard.service';
import { useAuth } from '@/context/AuthContext';

/**
 * Dashboard stats query
 * Cached for 2 minutes since stats don't change frequently
 */
export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => dashboardService.getStats(),
    staleTime: 2 * 60 * 1000, // 2 minutes
  });
}

/**
 * Recent activity query
 * Cached for 1 minute, refreshed more frequently
 */
export function useRecentActivity() {
  return useQuery({
    queryKey: ['dashboard', 'activity'],
    queryFn: () => dashboardService.getRecentActivity(),
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Keeper assignments query
 * Only called for keeper role
 */
export function useKeeperAssignments() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['dashboard', 'keeper-assignments'],
    queryFn: () => dashboardService.getKeeperAssignments(),
    enabled: user?.job_role === 'keeper', // Only fetch for keepers
    staleTime: 5 * 60 * 1000, // 5 minutes (doesn't change often)
  });
}

/**
 * Veterinarian animals query
 * Only called for veterinarian role
 */
export function useVeterinarianAnimals() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['dashboard', 'vet-animals'],
    queryFn: () => dashboardService.getVeterinarianAnimals(),
    enabled: user?.job_role === 'veterinarian', // Only fetch for vets
    staleTime: 3 * 60 * 1000, // 3 minutes
  });
}
