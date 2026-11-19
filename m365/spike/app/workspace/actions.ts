"use server";

import { redirect } from "next/navigation";
import { authorizeItemAction, provisioningGraph } from "@/lib/m365/authorize";
import { config, firmDomains, firmWideGroupIds } from "@/lib/m365/config";
import { resolveDrive } from "@/lib/m365/drive";
import { ensureLibrary } from "@/lib/m365/libraries";
import { GraphError } from "@/lib/m365/graph-client";
import { saveAttachmentToDrive } from "@/lib/m365/mail";
import { closeMatter, createMatter, ensureMatterColumns, type MatterMember } from "@/lib/m365/matters";
import { InvalidInputError, isFirmEmail } from "@/lib/m365/names";
import { assertCan, ForbiddenError } from "@/lib/m365/roles";
import { getDriveContext, getUserGraph } from "@/lib/m365/server";
import { createLink, invite, revokePermission } from "@/lib/m365/sharing";

// Every action is a public POST endpoint: each one authenticates, checks the
// role policy on the server (POLICY-5) and validates its input (NEXT-1).

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/** Message shown to the user. Graph's own wording is kept (SHARE-7). */
function describe(error: unknown): string {
  if (error instanceof ForbiddenError || error instanceof InvalidInputError) return error.message;
  if (error instanceof GraphError) return `${error.message} (${error.code})`;
  console.error(error);
  return "Something went wrong. Try again.";
}

function back(form: FormData, result: { msg?: string; err?: string }): never {
  const params = new URLSearchParams();
  for (const key of ["folderId", "shareId"]) {
    const value = field(form, key);
    if (value) params.set(key, value);
  }
  if (result.msg) params.set("msg", result.msg);
  if (result.err) params.set("err", result.err);
  redirect(`/workspace?${params}`);
}

async function attempt(form: FormData, work: () => Promise<string>): Promise<never> {
  let result: { msg?: string; err?: string };
  try {
    result = { msg: await work() };
  } catch (error) {
    result = { err: describe(error) };
  }
  back(form, result);
}

export async function inviteFormAction(form: FormData) {
  await attempt(form, async () => {
    const itemId = field(form, "shareId");
    const role = field(form, "role") === "write" ? "write" : "read";
    const email = field(form, "email");
    // Inside the firm: anyone on the matter (POLICY-9). Outside: admins and the lead (POLICY-4).
    const action = isFirmEmail(email, firmDomains()) ? "share.internal" : "share.external";
    const { admin, driveId } = await authorizeItemAction(action, itemId);
    const result = await invite(admin, driveId, itemId, { emails: [email], role, sendInvitation: true });
    if (result.failed.length > 0) throw new InvalidInputError(`Not shared: ${result.failed.map((f) => f.message).join("; ")}`);
    return `Shared with ${email} (${role}).`;
  });
}

export async function createLinkFormAction(form: FormData) {
  await attempt(form, async () => {
    const itemId = field(form, "shareId");
    const type = field(form, "type") === "edit" ? "edit" : "view";
    // Anonymous links are never offered (SHARE-2); the remaining scopes stay inside the firm.
    const scope = field(form, "scope") === "users" ? "users" : "organization";
    const { admin, driveId } = await authorizeItemAction("share.internal", itemId);
    const link = await createLink(admin, driveId, itemId, { type, scope });
    return `Link (${type}, ${scope}): ${link.webUrl}`;
  });
}

export async function revokeFormAction(form: FormData) {
  await attempt(form, async () => {
    const itemId = field(form, "shareId");
    const { admin, driveId } = await authorizeItemAction("matter.manageTeam", itemId);
    await revokePermission(admin, driveId, itemId, field(form, "permissionId"));
    return "Access removed.";
  });
}

export async function closeMatterFormAction(form: FormData) {
  await attempt(form, async () => {
    const itemId = field(form, "shareId");
    const { admin, driveId, matterId } = await authorizeItemAction("matter.close", itemId);
    if (matterId !== itemId) throw new InvalidInputError("Only a matter folder can be closed.");
    const label = process.env.MATTER_CLOSED_RETENTION_LABEL || undefined;
    const result = await closeMatter(admin, driveId, itemId, { retentionLabel: label });
    return `Matter closed: ${result.downgraded} people set to read-only, ${result.linksRemoved} links removed.`;
  });
}

export async function createMatterFormAction(form: FormData) {
  await attempt(form, async () => {
    const ctx = await getUserGraph();
    assertCan(ctx.role, "matter.create");
    if (!ctx.email) throw new InvalidInputError("Your account has no email address, so you cannot be added to the matter.");
    const groups = firmWideGroupIds();
    const admin = provisioningGraph(ctx.graph);
    // This year's library (MATTER-10), created with its columns on first use.
    const target = config.sharePoint;
    const { siteId } = await resolveDrive(admin, { hostname: target.hostname, sitePath: target.sitePath });
    const driveId = target.libraryName ? await ensureLibrary(admin, siteId, target.libraryName) : (await resolveDrive(admin, target)).driveId;
    await ensureMatterColumns(admin, driveId);
    const emails = (name: string) => field(form, name).split(/[\s,;]+/).filter(Boolean);
    const team: MatterMember[] = [
      ...emails("writers").map((email) => ({ email, role: "write" as const })),
      ...emails("readers").map((email) => ({ email, role: "read" as const })),
    ];
    // Only admins may name someone else as lead; a team leader leads what they create.
    const leadEmail = ctx.role === "admin" ? field(form, "lead") || undefined : undefined;
    const matter = await createMatter(admin, driveId, {
      number: field(form, "number"),
      title: field(form, "title"),
      creatorEmail: ctx.email,
      leadEmail,
      team,
      firmWideGroupIds: groups,
    });
    return `Matter ${matter.number} created.`;
  });
}

export async function saveAttachmentAction(messageId: string, attachmentId: string, folderId: string) {
  const { graph, driveId, role } = await getDriveContext();
  assertCan(role, "mail.file");
  const item = await saveAttachmentToDrive(graph, { messageId, attachmentId, driveId, folderId });
  return { id: item.id, name: item.name };
}
