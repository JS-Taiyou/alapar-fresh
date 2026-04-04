import { createDefine } from "fresh";
import type { Registry, SystemUser, User } from "./lib/types.ts";

export interface State {
  systemUser: SystemUser | null;
  activeRegistry: Registry | null;
  registryUsers: User[];
  registries: Registry[];
  supabaseAuthId: string | null;
  isOwner: boolean;
}

export const define = createDefine<State>();
