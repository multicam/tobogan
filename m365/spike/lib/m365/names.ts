/** Validation for names and ids that end up in Graph URLs. */

export class InvalidInputError extends Error {
  override readonly name = "InvalidInputError";
}

const INVALID_CHARS = /["*:<>?/\\|\u0000-\u001f]/;
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9]|desktop\.ini|\.lock)$/i;

/** SharePoint / OneDrive for Business file and folder name rules. */
export function assertValidFileName(name: string): string {
  if (typeof name !== "string" || name.length === 0) throw new InvalidInputError("File name is empty.");
  if (name.length > 255) throw new InvalidInputError("File name is longer than 255 characters.");
  if (name !== name.trim()) throw new InvalidInputError("File name starts or ends with a space.");
  if (name.endsWith(".")) throw new InvalidInputError("File name ends with a period.");
  if (INVALID_CHARS.test(name)) throw new InvalidInputError('File name contains one of " * : < > ? / \\ |');
  if (RESERVED.test(name) || name.startsWith("~$") || name.includes("_vti_")) {
    throw new InvalidInputError("File name is reserved by SharePoint.");
  }
  return name;
}

/** Ids come from the browser: keep them to a single, sane path segment. */
export function assertId(value: unknown, label = "id"): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024 || /[\s/\\?#]/.test(value)) {
    throw new InvalidInputError(`Invalid ${label}.`);
  }
  return value;
}

export function assertEmail(value: unknown): string {
  if (typeof value !== "string" || value.length > 320 || !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(value)) {
    throw new InvalidInputError("Invalid email address.");
  }
  return value;
}
