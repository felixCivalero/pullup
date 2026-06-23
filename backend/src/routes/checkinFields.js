// Pure helper: tell a check-in (pull-up counts only) apart from a guest-list
// EDIT (rename, move, cancel, party size, answers). The RSVP-update route is
// shared between both; a check-in needs only the lighter canCheckIn (so
// reception / room curator can pull people up), while any guest-record edit
// needs full canEditGuests. Authorization hinges on this, so it lives alone and
// is tested in isolation.

// Fields that make a PUT a guest-list EDIT. If a request touches ANY of these,
// it is NOT a check-in and requires canEditGuests.
export const GUEST_EDIT_FIELDS = [
  "name",
  "email",
  "plusOnes",
  "bookingStatus",
  "status",
  "wantsDinner",
  "dinnerTimeSlot",
  "dinner.slotTime",
  "dinnerPartySize",
  "dinner.bookingStatus",
  "forceConfirm",
  "customAnswers",
];

// True only when the body carries at least one field and every defined field is
// a pull-up count (i.e. none of GUEST_EDIT_FIELDS). An empty body is not a
// check-in (nothing to do → fall through to the stricter gate).
export function isCheckinOnlyUpdate(body) {
  if (!body || typeof body !== "object") return false;
  const touched = Object.keys(body).filter((k) => body[k] !== undefined);
  if (touched.length === 0) return false;
  return touched.every((k) => !GUEST_EDIT_FIELDS.includes(k));
}
