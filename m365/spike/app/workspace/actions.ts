"use server";

import { revalidatePath } from "next/cache";
import { saveAttachmentToDrive } from "@/lib/m365/mail";
import { createMatter, type MatterMember } from "@/lib/m365/matters";
import { assertCan } from "@/lib/m365/roles";
import { auth } from "@/auth";
import { getDriveContext } from "@/lib/m365/server";
import { createLink, invite, revokePermission, type LinkScope, type ShareRole } from "@/lib/m365/sharing";

// Every action is a public POST endpoint. Each one authenticates through
// getDriveContext() (which throws without a session) and the lib functions
// validate every argument, since TypeScript types are not enforced at runtime.

export async function inviteAction(itemId: string, email: string, role: ShareRole) {
  const { graph, driveId } = await getDriveContext();
  const result = await invite(graph, driveId, itemId, { emails: [email], role });
  revalidatePath("/workspace");
  return { granted: result.granted.length, failed: result.failed };
}

export async function createLinkAction(itemId: string, type: "view" | "edit", scope: LinkScope) {
  if (scope === "anonymous") throw new Error("Anonymous links are disabled in this app.");
  if (type !== "view" && type !== "edit") throw new Error("Invalid link type.");
  const { graph, driveId } = await getDriveContext();
  return (await createLink(graph, driveId, itemId, { type, scope })).webUrl;
}

export async function revokeAction(itemId: string, permissionId: string) {
  const { graph, driveId } = await getDriveContext();
  await revokePermission(graph, driveId, itemId, permissionId);
  revalidatePath("/workspace");
}

export async function saveAttachmentAction(messageId: string, attachmentId: string, folderId: string) {
  const { graph, driveId } = await getDriveContext();
  const item = await saveAttachmentToDrive(graph, { messageId, attachmentId, driveId, folderId });
  revalidatePath("/workspace");
  return { id: item.id, name: item.name };
}

export async function createMatterAction(number: string, title: string, team: MatterMember[]) {
  const session = await auth();
  assertCan(session?.user?.role, "matter.create");
  const creatorEmail = session?.user?.email;
  if (!creatorEmail) throw new Error("Your account has no email address, so you cannot be added to the matter.");
  if (!Array.isArray(team) || team.some((m) => m?.role !== "read" && m?.role !== "write")) throw new Error("Invalid team.");
  const { graph, driveId } = await getDriveContext();
  const matter = await createMatter(graph, driveId, { number, title, creatorEmail, team });
  revalidatePath("/workspace");
  return matter;
}
