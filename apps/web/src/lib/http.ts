import { NextResponse } from "next/server";

export function unauthorized(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFound(message = "Not found"): NextResponse {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function forbidden(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function serverError(message: string | undefined): NextResponse {
  return NextResponse.json({ error: message ?? "Internal error" }, { status: 500 });
}
