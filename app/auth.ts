const COOKIE_NAME = "unibench_session";
const SESSION_SECONDS = 60 * 60 * 12;

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sign(value: string) {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret) return "";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return bytesToHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value))));
}

function equal(a: string, b: string) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

export async function createSession(username: string) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = `${username}.${expires}`;
  return `${payload}.${await sign(payload)}`;
}

export async function validSession(token?: string) {
  if (!token) return false;
  const [username, expiresText, signature] = token.split(".");
  const expires = Number(expiresText);
  if (!username || !signature || !Number.isFinite(expires) || expires < Date.now() / 1000) return false;
  const expected = await sign(`${username}.${expiresText}`);
  return Boolean(expected) && equal(signature, expected);
}

export function secureSessionCookie(request?: Request) {
  const override = process.env.AUTH_COOKIE_SECURE;
  if (override === "true") return true;
  if (override === "false") return false;
  if (!request) return true;
  const forwardedProtocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  if (forwardedProtocol) return forwardedProtocol === "https";
  return new URL(request.url).protocol === "https:";
}

export const authConfig = { cookieName: COOKIE_NAME, sessionSeconds: SESSION_SECONDS };
