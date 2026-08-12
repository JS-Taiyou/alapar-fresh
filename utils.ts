import { createDefine } from "fresh";
import type { Entity, Participant, Registry, User } from "./lib/types.ts";
import type { Locale } from "./lib/i18n.ts";

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
}

export const define = createDefine<State>();
