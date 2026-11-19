/**
 * Firm roles and what each may do in the app.
 *
 * This policy decides what the app offers and accepts. It is not the security
 * boundary for documents: users can open SharePoint directly, so access to a
 * matter is enforced by the permissions on its folder.
 */

export type Role = "admin" | "teamLeader" | "associate";

export type Action =
  | "matter.create"
  | "matter.read"
  | "matter.manageTeam"
  | "matter.close"
  | "document.write"
  | "mail.file"
  | "share.external";

/** Entra app role values (the `roles` claim) mapped to app roles, highest first. */
const CLAIM_TO_ROLE: [claim: string, role: Role][] = [
  ["Admin", "admin"],
  ["TeamLeader", "teamLeader"],
  ["Associate", "associate"],
];

/** Highest role present in the claim, or undefined: no role means no access. */
export function roleFromClaims(claim: unknown): Role | undefined {
  if (!Array.isArray(claim)) return undefined;
  return CLAIM_TO_ROLE.find(([name]) => claim.includes(name))?.[1];
}

export function isRole(value: unknown): value is Role {
  return value === "admin" || value === "teamLeader" || value === "associate";
}

export interface MatterContext {
  /** The user leads this particular matter. */
  isMatterLead?: boolean;
}

export function can(role: Role | undefined, action: Action, context: MatterContext = {}): boolean {
  switch (role) {
    case "admin":
      return true;
    case "teamLeader":
      switch (action) {
        case "matter.create":
        case "matter.read":
        case "document.write":
        case "mail.file":
          return true;
        case "matter.manageTeam":
        case "matter.close":
        case "share.external":
          return context.isMatterLead === true;
      }
      return false;
    case "associate":
      return action === "matter.read" || action === "document.write" || action === "mail.file";
    default:
      return false;
  }
}

export class ForbiddenError extends Error {
  override readonly name = "ForbiddenError";
}

export function assertCan(role: Role | undefined, action: Action, context?: MatterContext): void {
  if (!can(role, action, context)) throw new ForbiddenError(`Your role does not allow: ${action}`);
}
