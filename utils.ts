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
  isOwner: boolean;
}

export const define = createDefine<State>();
