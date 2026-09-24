/* Reading a salon's join token out of whatever a QR code turned out to say.

   The code encodes `{JOIN_URL_BASE}/join/{token}` — the backend builds it in
   `Apps/tenants/views.py::join_url`. `JOIN_URL_BASE` is a server setting and
   differs between development, staging and production, so matching on the
   origin would mean the app refusing codes printed by its own backend. The
   path is the part that is actually the contract, and it is what this matches.

   The token is `secrets.token_urlsafe(32)` — always 43 characters from the
   URL-safe base64 alphabet. Checking the shape is not security (the server
   decides what is valid) but it is what stops a poster, a wifi code or a
   payment QR being sent to the join endpoint as if it might work. */

/** `secrets.token_urlsafe(32)` is always this long and this alphabet. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

/** The join token a scanned QR carries, or null if it is not one of ours. */
export function joinTokenFrom(scanned: string): string | null {
  const text = scanned.trim();
  if (!text) return null;

  let path: string;
  try {
    // A relative URL would be a QR that is not a link at all; the base is only
    // here so `URL` can parse one without throwing, and the origin is ignored.
    path = new URL(text, 'https://scanned.invalid').pathname;
  } catch {
    return null;
  }

  const parts = path.split('/').filter(Boolean);
  if (parts.length !== 2 || parts[0] !== 'join') return null;
  return TOKEN.test(parts[1]) ? parts[1] : null;
}
