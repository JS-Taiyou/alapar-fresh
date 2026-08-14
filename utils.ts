import { createDefine } from "fresh";
import type { Entity, Participant, Registry, User } from "./lib/types.ts";
import type { Locale } from "./lib/i18n.ts";
import type { RegistryPlanInfo } from "./lib/entitlements.ts";

export interface State {
  user: User | null;
  activeRegistry: Registry | null;
  registryUsers: User[];
  entities: Entity[];
  participants: Participant[];
  registries: Registry[];
  supabaseAuthId: string | null;
  accessToken: string | null;
  isOwner: boolean;
  ownerRegistryIds: Set<string>;
  locale: Locale;
  /** Plan of the ACTIVE registry (null on lightweight paths / no registry).
   * Populated by the middleware on full-state paths so pages/islands can
   * render upgrade CTAs without extra queries. */
  activeRegistryPlan: RegistryPlanInfo | null;
}

export const define = createDefine<State>();
