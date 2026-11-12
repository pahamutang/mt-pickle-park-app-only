// Where players are sent when they tap "Contact the Owner" inside the
// Upcoming Reservations popup.
//
// Paste the owner's Facebook profile or page link between the quotes, e.g.
//   'https://www.facebook.com/your.name'
//   'https://m.me/your.name'   (opens Messenger straight to a new chat)
// Leave it as '' to hide the button until the link is ready.
export const OWNER_FACEBOOK_URL = 'https://www.facebook.com/doris.deloso';

// Turns whatever was pasted above into a safe web link. Returns null when
// nothing usable is set, so the app hides the button instead of erroring.
// A missing https:// is added, and anything that isn't http(s) is rejected.
export function ownerFacebookLink(raw: string = OWNER_FACEBOOK_URL): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return /^https?:\/\/[^\s]+$/i.test(withScheme) ? withScheme : null;
}
