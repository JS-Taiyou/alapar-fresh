import { createDefine } from "fresh";
import type { Entity, Participant, Registry, User } from "./lib/types.ts";

export interface State {
  user: User | null;
  activeRegistry: Registry | null;
  registryUsers: User[];
  entities: Entity[];
  participants: Participant[];
  registries: Registry[];
  supabaseAuthId: string | null;
  /**
   * The current Supabase access token, validated (and possibly refreshed) by
   * the middleware. Consumed by `/api/auth/token` so it doesn't re-validate
   * with possibly-spent cookies.
   */
  accessToken: string | null;
  isOwner: boolean;
  ownerRegistryIds: Set<string>;
}

export const define = createDefine<State>();
