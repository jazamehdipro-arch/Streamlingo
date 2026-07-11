import { NextRequest, NextResponse } from "next/server";

/**
 * docs/API.md requires CORS enabled for the extension's origin, since the
 * extension calls these same /api/* routes cross-origin (chrome-extension://).
 * The extension authenticates via `Authorization: Bearer <token>`, not
 * cookies, so a wildcard origin here doesn't open up a credentialed-request
 * CSRF surface — there's no `Access-Control-Allow-Credentials: true`.
 */
export function middleware(req: NextRequest) {
  const response = req.method === "OPTIONS" ? new NextResponse(null, { status: 204 }) : NextResponse.next();

  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");

  return response;
}

export const config = {
  matcher: "/api/:path*",
};
