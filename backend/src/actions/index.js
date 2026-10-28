// The one list. Adding a capability to PullUp for assistants = one
// defineAction in one of these files; every door picks it up.
import { canRun } from "./registry.js";
import publicActions from "./public.js";
import eventActions from "./events.js";
import mailActions from "./mail.js";
import ownerActions from "./owner.js";
import teamActions from "./team.js";

export const ACTIONS = new Map([...publicActions, ...eventActions, ...mailActions, ...teamActions, ...ownerActions].map((a) => [a.name, a]));
if (ACTIONS.size !== publicActions.length + eventActions.length + mailActions.length + teamActions.length + ownerActions.length) {
  throw new Error("two actions share a name");
}

// What this caller may run (signed out: the public ones).
export const actionsFor = (caller) => [...ACTIONS.values()].filter((a) => canRun(a, caller));
