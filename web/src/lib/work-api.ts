import { NextResponse } from "next/server";
import { z } from "zod";

const UuidSchema = z.string().uuid();

export interface ProjectRecord {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface NoteRecord {
  id: string;
  user_id: string;
  project_id: string | null;
  name: string;
  content: string;
  note_type: "global" | "project_default" | "regular";
  version: number | string;
  content_hash: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export function privateJson(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function parseJson<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<{ ok: true; value: T } | { ok: false; response: NextResponse }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return {
      ok: false,
      response: privateJson({ error: "Request body must be valid JSON" }, 400),
    };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      response: privateJson(
        { error: "Invalid request body", details: parsed.error.flatten() },
        400,
      ),
    };
  }

  return { ok: true, value: parsed.data };
}

export function mapProject(project: ProjectRecord) {
  return {
    id: project.id,
    userId: project.user_id,
    name: project.name,
    createdAt: project.created_at,
    updatedAt: project.updated_at,
    deletedAt: project.deleted_at,
  };
}

export function mapNote(note: NoteRecord) {
  const version = Number(note.version);
  if (!Number.isSafeInteger(version)) {
    throw new Error(`Invalid note version for note ${note.id}`);
  }

  return {
    id: note.id,
    userId: note.user_id,
    projectId: note.project_id,
    name: note.name,
    content: note.content,
    noteType: note.note_type,
    version,
    contentHash: note.content_hash,
    createdAt: note.created_at,
    updatedAt: note.updated_at,
    deletedAt: note.deleted_at,
  };
}

export function databaseError(
  error: { code?: string; message?: string },
  context: string,
): NextResponse {
  if (error.code === "23505") {
    return privateJson(
      { error: "A record with these values already exists" },
      409,
    );
  }
  if (error.code === "23503" || error.code === "23514") {
    return privateJson({ error: "Invalid project or note data" }, 400);
  }

  console.error(`${context}:`, error);
  return privateJson({ error: "Database operation failed" }, 500);
}

export function notFound(): NextResponse {
  return privateJson({ error: "Resource not found" }, 404);
}

export function conflict(message = "The resource has changed; reload and retry"): NextResponse {
  return privateJson({ error: message }, 409);
}

export function getUuidFromPath(request: Request, reverseIndex = 1): string | null {
  const segments = new URL(request.url).pathname.split("/").filter(Boolean);
  const candidate = segments.at(-reverseIndex);
  const parsed = UuidSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

export function isUuid(value: string): boolean {
  return UuidSchema.safeParse(value).success;
}
