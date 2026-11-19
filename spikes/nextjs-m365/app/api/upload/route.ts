import { NextResponse, type NextRequest } from "next/server";
import { uploadLarge } from "@/lib/m365/drive";
import { GraphError } from "@/lib/m365/graph-client";
import { InvalidInputError } from "@/lib/m365/names";
import { getDriveContext } from "@/lib/m365/server";
import { ReauthRequiredError } from "@/lib/m365/tokens";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * Streaming upload: PUT /api/upload?folderId=...&name=... with the raw file as
 * the body and an exact Content-Length. The body is piped to a Graph upload
 * session 5 MiB at a time, so memory use does not grow with file size and the
 * 1 MB Server Action limit does not apply.
 */
export async function PUT(request: NextRequest) {
  try {
    // Cross-site form posts cannot set this header; browsers preflight it.
    if (request.headers.get("x-requested-with") !== "fetch") {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }
    const name = request.nextUrl.searchParams.get("name") ?? "";
    const folderId = request.nextUrl.searchParams.get("folderId") || "root";
    const size = Number(request.headers.get("content-length"));
    if (!request.body || !Number.isSafeInteger(size) || size <= 0) {
      return NextResponse.json({ error: "Content-Length is required" }, { status: 411 });
    }
    if (size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "File too large" }, { status: 413 });

    const { graph, driveId } = await getDriveContext();
    const item = await uploadLarge(graph, driveId, folderId, name, request.body as unknown as AsyncIterable<Uint8Array>, size, {
      conflictBehavior: "rename",
      signal: request.signal,
    });
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return toResponse(error);
  }
}

function toResponse(error: unknown) {
  if (error instanceof ReauthRequiredError) return NextResponse.json({ error: "Sign-in required" }, { status: 401 });
  if (error instanceof InvalidInputError) return NextResponse.json({ error: error.message }, { status: 400 });
  if (error instanceof GraphError) {
    const status = error.status >= 400 && error.status < 500 ? error.status : 502;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  console.error("upload failed", error);
  return NextResponse.json({ error: "Upload failed" }, { status: 500 });
}
