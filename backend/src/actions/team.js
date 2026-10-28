// Working together, for an organiser or their assistant: a brand's team (its
// head invites people, they work in the brand fully), one event's co-hosts,
// and the invites waiting for the signed-in address. lib/teams.js holds the
// rules; these are the same calls the Team page and the event page make.
import { z } from "zod";
import { defineAction } from "./registry.js";
import { brandInput, inBrand } from "./events.js";
import {
  acceptInvite, brandTeam, cancelInvite, declineInvite, eventTeam, inviteToBrand, inviteToEvent, myInvites, removeCohost, removeMember,
} from "../lib/teams.js";

const email = z.string().trim().min(3).max(254).describe("The person's email address. They sign in to PullUp with it to say yes.");
const eventId = z.guid().describe("The event's id (from list_my_events).");
const userId = z.guid().describe("The person's userId (from list_team or list_event_cohosts).");
const inviteId = z.guid().describe("The invite's id (from list_my_invites, list_team or list_event_cohosts).");

export const listTeam = defineAction({
  name: "list_team",
  title: "A brand's team",
  description: "Who works in a brand: its head (the account that owns it), the members the head invited (they work in the brand fully: events, guests, CRM, mail on the head's credits) and open invites. canManage says whether this person is the head, the only one who invites and removes.",
  access: "user",
  effect: "read",
  input: z.object({ brand: brandInput }),
  run: async ({ brand }, { caller }) => brandTeam(inBrand(caller, brand)),
});

export const inviteToBrandAction = defineAction({
  name: "invite_to_brand",
  title: "Invite someone to a brand's team",
  description: "The brand's head invites a person by email to work in the brand with them. PullUp mails the invite (reply goes to this person); it stays open 30 days and the invited person accepts after signing in with that address. Only invite addresses the person asked for. One event only? Use invite_cohost instead.",
  access: "user",
  effect: "send",
  input: z.object({ email, brand: brandInput }),
  run: async ({ email: to, brand }, { caller }) => inviteToBrand(inBrand(caller, brand), to),
});

export const removeFromTeam = defineAction({
  name: "remove_from_team",
  title: "Remove someone from a brand's team",
  description: "The head removes a member from the brand; their access ends at once. A member can pass their own userId to leave the brand. Ask the person before removing anyone.",
  access: "user",
  effect: "write",
  input: z.object({ userId, brand: brandInput }),
  run: async ({ userId: id, brand }, { caller }) => removeMember(inBrand(caller, brand), id),
});

export const listEventCohosts = defineAction({
  name: "list_event_cohosts",
  title: "An event's co-hosts",
  description: "The co-hosts of one event: people invited to that event only (they edit it and run its guest list, but can't mail guests or see the rest of the brand), plus open invites when this person may manage them.",
  access: "user",
  effect: "read",
  input: z.object({ eventId }),
  run: async ({ eventId: id }, { caller }) => eventTeam(caller, id),
});

export const inviteCohost = defineAction({
  name: "invite_cohost",
  title: "Invite a co-host to an event",
  description: "The brand's team invites a person by email to co-host one event: they can edit it and run its guest list, nothing else of the brand. PullUp mails the invite; it stays open 30 days. Only invite addresses the person asked for.",
  access: "user",
  effect: "send",
  input: z.object({ eventId, email }),
  run: async ({ eventId: id, email: to }, { caller }) => inviteToEvent(caller, id, to),
});

export const removeCohostAction = defineAction({
  name: "remove_cohost",
  title: "Remove a co-host from an event",
  description: "The brand's team removes a co-host from an event; their access ends at once. A co-host can pass their own userId to step down. Ask the person before removing anyone.",
  access: "user",
  effect: "write",
  input: z.object({ eventId, userId }),
  run: async ({ eventId: id, userId: uid }, { caller }) => removeCohost(caller, id, uid),
});

export const cancelInviteAction = defineAction({
  name: "cancel_invite",
  title: "Take back an invite",
  description: "Take back an invite that hasn't been answered yet (to a brand's team or to co-host an event), by its id from list_team or list_event_cohosts.",
  access: "user",
  effect: "write",
  idempotent: true,
  input: z.object({ inviteId }),
  run: async ({ inviteId: id }, { caller }) => cancelInvite(caller, id),
});

export const listMyInvites = defineAction({
  name: "list_my_invites",
  title: "Invites waiting for me",
  description: "Invites sent to this person's email address that they haven't answered: to join a brand's team, or to co-host one event. Each says the brand, the event and who sent it.",
  access: "user",
  effect: "read",
  input: z.object({}),
  run: async (_input, { caller }) => ({ invites: await myInvites(caller) }),
});

export const acceptInviteAction = defineAction({
  name: "accept_invite",
  title: "Accept an invite",
  description: "Say yes to an invite from list_my_invites, only when the person wants to: they join the brand's team, or become the event's co-host. Returns the brandId (and eventId) to work in.",
  access: "user",
  effect: "write",
  input: z.object({ inviteId }),
  run: async ({ inviteId: id }, { caller }) => acceptInvite(caller, id),
});

export const declineInviteAction = defineAction({
  name: "decline_invite",
  title: "Decline an invite",
  description: "Say no thanks to an invite from list_my_invites. The invite is removed; whoever sent it can invite again later.",
  access: "user",
  effect: "write",
  input: z.object({ inviteId }),
  run: async ({ inviteId: id }, { caller }) => declineInvite(caller, id),
});

export default [
  listTeam, inviteToBrandAction, removeFromTeam, listEventCohosts, inviteCohost, removeCohostAction,
  cancelInviteAction, listMyInvites, acceptInviteAction, declineInviteAction,
];
