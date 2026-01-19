import { useUser } from "@clerk/nextjs";

export type UserRole = 'org:super_admin' | 'org:admin' | 'org:user';

export const ROLES = {
  SUPER_ADMIN: 'org:super_admin',
  ADMIN: 'org:admin',
  USER: 'org:user'
} as const;

export function useUserRole(): UserRole | null {
  const { user } = useUser();
  const membership = user?.organizationMemberships?.[0];
  return membership?.role as UserRole || null;
}

export function useHasRole(requiredRole: UserRole | UserRole[]): boolean {
  const userRole = useUserRole();
  if (!userRole) return false;
  
  if (Array.isArray(requiredRole)) {
    return requiredRole.includes(userRole);
  }
  
  return userRole === requiredRole;
}

export function useIsAdmin(): boolean {
  return useHasRole([ROLES.SUPER_ADMIN, ROLES.ADMIN]);
}

export function useIsSuperAdmin(): boolean {
  return useHasRole(ROLES.SUPER_ADMIN);
}

// For server-side role checking, use these non-hook functions
// that accept the role directly instead of calling hooks
export function checkRole(userRole: UserRole | null, requiredRole: UserRole | UserRole[]): boolean {
  if (!userRole) return false;

  if (Array.isArray(requiredRole)) {
    return requiredRole.includes(userRole);
  }

  return userRole === requiredRole;
}

export function checkIsAdmin(userRole: UserRole | null): boolean {
  return checkRole(userRole, [ROLES.SUPER_ADMIN, ROLES.ADMIN]);
}

export function checkIsSuperAdmin(userRole: UserRole | null): boolean {
  return checkRole(userRole, ROLES.SUPER_ADMIN);
} 