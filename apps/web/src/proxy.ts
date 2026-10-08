// Copyright (c) 2026 Team of Wakers
// SPDX-License-Identifier: MIT
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Tells the server code which method and path a request used, in headers the browser cannot set
 * (they are overwritten here on every request). Support access (FR-ADM-07) needs the method to be
 * read-only and the path for its log entry; route handlers and pages cannot see the method otherwise.
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set('x-easemuse-method', request.method);
  headers.set('x-easemuse-path', request.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
