import { z } from "zod";

export const NoteTypeSchema = z.enum(["global", "project_default", "regular"]);

export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(
  itemSchema: T,
) =>
  z.object({
    items: z.array(itemSchema),
    hasMore: z.boolean().optional(),
  });

export const UserSchema = z.object({
  id: z.string(),
  google_id: z.string(),
  email: z.string().email(),
  name: z.string().nullable(),
  avatar_url: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const SessionSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  token_hash: z.string(),
  expires_at: z.string(),
  revoked_at: z.string().nullable(),
  created_at: z.string(),
  users: UserSchema,
});

export const WorkProjectSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  name: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
});

export const WorkNoteSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  project_id: z.string().nullable(),
  name: z.string(),
  content: z.string(),
  note_type: NoteTypeSchema,
  version: z.number().int().nonnegative(),
  content_hash: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
});

export const CreateProjectInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z
    .string()
    .trim()
    .min(1, "Project name is required")
    .max(120, "Project name is too long")
    .regex(/^[a-zA-Z0-9 _.&-]+$/, "Project name contains invalid characters"),
});

export const RenameProjectInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Project name is required")
    .max(120, "Project name is too long")
    .regex(/^[a-zA-Z0-9 _.&-]+$/, "Project name contains invalid characters"),
});

export const CreateNoteInputSchema = z.object({
  project_id: z.string().uuid().nullable().optional(),
  name: z
    .string()
    .trim()
    .min(1, "Note name is required")
    .max(120, "Note name is too long")
    .regex(/^[a-zA-Z0-9 _.&-]+$/, "Note name contains invalid characters"),
  note_type: NoteTypeSchema.default("regular"),
}).refine(
  (note) => {
    if (note.note_type === "project_default") {
      return note.project_id !== null && note.project_id !== undefined;
    }
    if (note.note_type === "global") {
      return note.project_id === null || note.project_id === undefined;
    }
    return true;
  },
  "Note type and project must be consistent",
);

export const UpdateNoteContentSchema = z.object({
  content: z.string().max(10 * 1024 * 1024, "Note content is too large"),
  version: z.number().int().positive().optional(),
  contentHash: z.string().nullable().optional(),
});

export const RenameNoteInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Note name is required")
    .max(120, "Note name is too long")
    .regex(/^[a-zA-Z0-9 _.&-]+$/, "Note name contains invalid characters"),
  version: z.number().int().positive().optional(),
  contentHash: z.string().nullable().optional(),
});

export const DeleteNoteInputSchema = z.object({
  version: z.number().int().positive().optional(),
  contentHash: z.string().nullable().optional(),
});

export const SyncChangeSchema = z
  .object({
    id: z.string().uuid(),
    type: z.enum(["upsert", "delete"]),
    project_id: z.string().uuid().nullable(),
    name: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .regex(/^[a-zA-Z0-9 _.&-]+$/),
    note_type: NoteTypeSchema,
    content: z.string().max(10 * 1024 * 1024).optional(),
    base_version: z.number().int().nonnegative(),
    base_content_hash: z.string().nullable(),
  })
  .superRefine((change, context) => {
    if (change.type === "upsert" && change.content === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["content"],
        message: "Content is required for an upsert",
      });
    }
    if (
      change.type === "upsert" &&
      change.base_version === 0 &&
      change.base_content_hash !== null
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["base_content_hash"],
        message: "A new note must not have a base content hash",
      });
    }
    if (
      change.note_type === "project_default" &&
      change.project_id === null
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["project_id"],
        message: "Project-default notes require a project",
      });
    }
    if (change.note_type === "global" && change.project_id !== null) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["project_id"],
        message: "Global notes cannot belong to a project",
      });
    }
  });

export const SyncRequestSchema = z.object({
  changes: z.array(SyncChangeSchema).max(100),
}).superRefine((request, context) => {
  const ids = new Set<string>();
  request.changes.forEach((change, index) => {
    if (ids.has(change.id)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["changes", index, "id"],
        message: "A note may only appear once per sync request",
      });
    }
    ids.add(change.id);
  });
});

export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;
export type RenameProjectInput = z.infer<typeof RenameProjectInputSchema>;
export type CreateNoteInput = z.infer<typeof CreateNoteInputSchema>;
export type UpdateNoteContent = z.infer<typeof UpdateNoteContentSchema>;
export type RenameNoteInput = z.infer<typeof RenameNoteInputSchema>;
export type SyncChange = z.infer<typeof SyncChangeSchema>;
export type SyncRequest = z.infer<typeof SyncRequestSchema>;
