import type { SessionUser } from "@/lib/types";

export interface TenantScope {
  organizationId: string;
  branchId: string;
}

export function tenantScopeFromUser(user: SessionUser): TenantScope {
  if (!user.organizationId || !user.branchId) {
    throw new Error("El usuario no tiene una organizacion o sucursal activa.");
  }

  return {
    organizationId: user.organizationId,
    branchId: user.branchId,
  };
}
