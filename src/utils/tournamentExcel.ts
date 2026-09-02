/**
 * Excel template download + import parsing for tournament group-stage teams.
 * One row per team: column A = team name, column B = group. Parsing is
 * position-based (not header-text matching), so it works regardless of the
 * app's current language or a renamed header cell.
 */

export interface TeamImportRow {
  teamName: string;
  group: string;
}

export interface TeamsTemplateLabels {
  fileName: string;
  sheetName: string;
  teamNameHeader: string;
  groupHeader: string;
  exampleTeams: [string, string][];
  instructionsSheetName: string;
  instructions: string[];
}

export async function downloadTeamsTemplate(labels: TeamsTemplateLabels): Promise<void> {
  const XLSX = await import('xlsx');

  const teamsData = [[labels.teamNameHeader, labels.groupHeader], ...labels.exampleTeams];
  const teamsSheet = XLSX.utils.aoa_to_sheet(teamsData);
  teamsSheet['!cols'] = [{ wch: 28 }, { wch: 12 }];

  const instructionsSheet = XLSX.utils.aoa_to_sheet(labels.instructions.map(line => [line]));
  instructionsSheet['!cols'] = [{ wch: 90 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, teamsSheet, labels.sheetName);
  XLSX.utils.book_append_sheet(wb, instructionsSheet, labels.instructionsSheetName);
  XLSX.writeFile(wb, labels.fileName);
}

export async function parseTeamsWorkbook(file: File, sheetName: string): Promise<TeamImportRow[]> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[sheetName] || wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
  // Row 0 is the header — skip it.
  return rows
    .slice(1)
    .map(r => ({ teamName: String(r[0] ?? '').trim(), group: String(r[1] ?? '').trim() }))
    .filter(r => r.teamName && r.group);
}

/**
 * Same file shape as parseTeamsWorkbook, but the Group column is optional —
 * used by the standalone-tournament wizard, where grouping is decided in a
 * later step (all-in-one, or split by whatever's already in the file).
 */
export async function parseTeamsWorkbookAnyGroup(file: File, sheetName: string): Promise<TeamImportRow[]> {
  const XLSX = await import('xlsx');
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  const sheet = wb.Sheets[sheetName] || wb.Sheets[wb.SheetNames[0]];
  if (!sheet) return [];

  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
  return rows
    .slice(1)
    .map(r => ({ teamName: String(r[0] ?? '').trim(), group: String(r[1] ?? '').trim() }))
    .filter(r => r.teamName);
}
