// Error envelope `{error: {code, message, retryable}}` + CORS helpers (SPEC §13).

import type { ErrorBody } from "./types.ts";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (message: string, code = "bad_request") =>
  new HttpError(400, code, message);
export const unauthorized = (message = "Unauthorized", code = "unauthorized") =>
  new HttpError(401, code, message);
export const forbidden = (message = "Forbidden", code = "forbidden") =>
  new HttpError(403, code, message);
export const notFound = (message = "Not found", code = "not_found") =>
  new HttpError(404, code, message);
export const conflict = (message: string, code = "conflict") => new HttpError(409, code, message);

export function corsHeaders(origin = "*"): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, accept",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function jsonResponse(
  body: unknown,
  status = 200,
  origin = "*",
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...corsHeaders(origin), ...extraHeaders },
  });
}

export function toErrorBody(err: unknown): { status: number; body: ErrorBody } {
  if (err instanceof HttpError) {
    return {
      status: err.status,
      body: { error: { code: err.code, message: err.message, retryable: err.retryable } },
    };
  }
  // Never leak stack traces; log server-side only.
  console.error("unhandled error", err);
  return {
    status: 500,
    body: { error: { code: "internal", message: "Internal error", retryable: true } },
  };
}

export function errorResponse(err: unknown, origin = "*"): Response {
  const { status, body } = toErrorBody(err);
  return jsonResponse(body, status, origin);
}

/** Wraps a handler with OPTIONS preflight, JSON body parsing errors and the error envelope. */
export function serveWithErrors(
  origin: string,
  handler: (req: Request) => Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req) => {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    try {
      return await handler(req);
    } catch (err) {
      return errorResponse(err, origin);
    }
  };
}

export async function readJsonBody<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw badRequest("Body must be valid JSON", "invalid_json");
  }
}
