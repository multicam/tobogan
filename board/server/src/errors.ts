/** Status codes the protocol answers with. */
export const HTTP = {
  ok: 200,
  created: 201,
  badRequest: 400,
  unauthorized: 401,
  forbidden: 403,
  notFound: 404,
  methodNotAllowed: 405,
  conflict: 409,
  internal: 500,
  notImplemented: 501,
  unavailable: 503,
} as const;

/**
 * A refusal the board answers as `{ error: { code, message } }` with `status`. The Board client
 * reads `error.code` (the CLI prints it as `reason`) and needs a non-empty `message`.
 */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (message: string, code = "invalid_request") => new HttpError(HTTP.badRequest, code, message);
export const forbidden = (message: string, code = "forbidden") => new HttpError(HTTP.forbidden, code, message);
export const notFound = (message: string, code = "not_found") => new HttpError(HTTP.notFound, code, message);
export const conflict = (code: string, message: string) => new HttpError(HTTP.conflict, code, message);
export const notKept = (code: string, message: string) => new HttpError(HTTP.notImplemented, code, message);
export const messageNotFound = (id: string) => notFound(`message not found: ${id}`, "message_not_found");

export function errorResponse(error: HttpError): Response {
  return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
}
