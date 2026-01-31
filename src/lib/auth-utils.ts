import { useUser } from "@clerk/nextjs";

export type UserRole = 'org:super_admin' | 'org:admin' | 'org:user';

// Clerk organization roles (for Clerk's <Protect> component)
export const ROLES = {
  SUPER_ADMIN: 'org:super_admin',
  ADMIN: 'org:admin',
  USER: 'org:user'
} as const;

// Database roles (for clerk_users.role column)
export type DbUserRole = 'guest' | 'user' | 'admin' | 'superadmin';

export const DB_ROLES = {
  SUPER_ADMIN: 'superadmin',
  ADMIN: 'admin',
  USER: 'user',
  GUEST: 'guest'
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