import { NextResponse } from "next/server";
import { authConfig, secureSessionCookie } from "../../auth";

export async function POST(request: Request) {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(authConfig.cookieName, "", { httpOnly: true, secure: secureSessionCookie(request), sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
