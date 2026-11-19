/**
 * One document library per year (MATTER-10). The configured library name may
 * contain "{year}", e.g. "Matters {year}".
 */
import { GraphError, seg, type GraphClient } from "./graph-client";
import { assertId, InvalidInputError } from "./names";

export function libraryForYear(template: string | undefined, year: number): string | undefined {
  if (!template) return undefined;
  if (!Number.isInteger(year) || year < 2000 || year > 9999) throw new InvalidInputError("Invalid year.");
  return template.replaceAll("{year}", String(year));
}

/** Libraries on the site that match the template, newest year first. */
export async function listYearLibraries(
  graph: GraphClient,
  siteId: string,
  template: string,
): Promise<{ year: number; name: string; driveId: string }[]> {
  if (!template.includes("{year}")) throw new InvalidInputError('The library name has no "{year}".');
  const [before, after] = template.split("{year}") as [string, string];
  const drives = await graph.getAll<{ id: string; name: string }>(`/sites/${seg(assertId(siteId, "site id"))}/drives`, {
    query: { $select: "id,name" },
  });
  return drives
    .flatMap((d) => {
      if (!d.name.startsWith(before) || !d.name.endsWith(after)) return [];
      const middle = d.name.slice(before.length, d.name.length - after.length);
      return /^\d{4}$/.test(middle) ? [{ year: Number(middle), name: d.name, driveId: d.id }] : [];
    })
    .sort((a, b) => b.year - a.year);
}

/**
 * Make sure the library exists, creating it if needed. Returns its drive id.
 * Run as the app or a site owner; ordinary users cannot create libraries.
 */
export async function ensureLibrary(graph: GraphClient, siteId: string, name: string): Promise<string> {
  const site = seg(assertId(siteId, "site id"));
  const drives = await graph.getAll<{ id: string; name: string }>(`/sites/${site}/drives`, { query: { $select: "id,name" } });
  const existing = drives.find((d) => d.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;
  const list = await graph.request<{ id: string }>("POST", `/sites/${site}/lists`, {
    json: { displayName: name, list: { template: "documentLibrary" } },
  });
  const drive = await graph.request<{ id?: string }>("GET", `/sites/${site}/lists/${seg(list.id)}/drive`, { query: { $select: "id" } });
  if (!drive?.id) throw new GraphError(502, "noDrive", "Library created but Graph returned no drive.");
  return drive.id;
}
