import { NextRequest, NextResponse } from "next/server";

/**
 * HTTP Basic Auth on every route except the cron endpoint and static assets.
 * Single shared credential, expected in APP_USERNAME / APP_PASSWORD env vars.
 *
 * The cron route already has its own CRON_SECRET bearer check, so we skip
 * basic auth there — Vercel Cron doesn't send basic credentials.
 */
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Skip cron (has its own auth), the test-publish endpoint (curl smoke test),
  // and _next/static/etc which the matcher already excludes but doubly safe.
  if (
    pathname.startsWith("/api/cron/") ||
    pathname === "/api/test-publish" ||
    pathname.startsWith("/_next/") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const expectedUser = process.env.APP_USERNAME;
  const expectedPass = process.env.APP_PASSWORD;

  // Fail closed if creds aren't set on the deployment.
  if (!expectedUser || !expectedPass) {
    return new NextResponse("APP_USERNAME / APP_PASSWORD not configured.", {
      status: 500,
    });
  }

  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) {
    return unauthorized();
  }

  let decoded: string;
  try {
    decoded = atob(header.slice("Basic ".length).trim());
  } catch {
    return unauthorized();
  }

  const idx = decoded.indexOf(":");
  if (idx < 0) return unauthorized();
  const user = decoded.slice(0, idx);
  const pass = decoded.slice(idx + 1);

  if (user !== expectedUser || pass !== expectedPass) {
    return unauthorized();
  }

  return NextResponse.next();
}

function unauthorized() {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "www-authenticate": 'Basic realm="orchestration-economics", charset="UTF-8"',
    },
  });
}

export const config = {
  matcher: [
    // Everything except static assets & Next internals.
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
