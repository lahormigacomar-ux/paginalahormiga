import {
  EntityType,
  ENTITY_CONFIGS,
  extractValueForHeader,
  getSmartColumnMapping,
  normalizeHeaderKey,
} from '../services/importExportService';

export interface DetectedHeaderResult {
  headerRowIndex: number;
  headers: string[];
  matchedFieldsCount: number;
}

function buildUniqueHeadersFromRow(row: string[]): string[] {
  const seen = new Map<string, number>();
  const result: string[] = [];

  for (let c = 0; c < row.length; c++) {
    const raw = String(row[c] ?? '').trim();
    if (!raw) {
      result.push('');
      continue;
    }
    const count = seen.get(raw) || 0;
    seen.set(raw, count + 1);
    result.push(count === 0 ? raw : `${raw}_${count + 1}`);
  }

  // Trim trailing empty header slots
  while (result.length > 0 && result[result.length - 1] === '') {
    result.pop();
  }
  return result;
}

export function detectBestHeaderRow(
  grid: string[][],
  entity: EntityType
): DetectedHeaderResult {
  if (!Array.isArray(grid) || grid.length === 0) {
    return { headerRowIndex: 0, headers: [], matchedFieldsCount: 0 };
  }

  const maxScan = Math.min(15, grid.length);
  let bestRowIdx = 0;
  let bestHeaders: string[] = [];
  let bestScore = -1;
  let bestMatchedCount = 0;

  for (let r = 0; r < maxScan; r++) {
    const row = Array.isArray(grid[r]) ? grid[r] : [];
    const candidateHeaders = buildUniqueHeadersFromRow(row).filter(Boolean);
    if (candidateHeaders.length < 2) continue;

    // Penalize rows that are mostly pure numbers or dates (unlikely to be headers)
    const numericLikeCount = candidateHeaders.filter(h =>
      /^[\d.,/\-$:\s]+$/.test(h)
    ).length;
    if (numericLikeCount > candidateHeaders.length / 2) continue;

    const smartMap = getSmartColumnMapping(entity, candidateHeaders);
    const matchedFieldsCount = Object.values(smartMap).filter(Boolean).length;
    const score = matchedFieldsCount * 10 + candidateHeaders.length - r * 0.25;

    if (score > bestScore) {
      bestScore = score;
      bestRowIdx = r;
      bestHeaders = buildUniqueHeadersFromRow(row);
      bestMatchedCount = matchedFieldsCount;
    }
  }

  if (bestHeaders.length === 0 && grid[0]) {
    bestHeaders = buildUniqueHeadersFromRow(grid[0]);
  }

  return {
    headerRowIndex: bestRowIdx,
    headers: bestHeaders.filter(Boolean),
    matchedFieldsCount: bestMatchedCount,
  };
}

export function sheetGridToRawObjects(
  grid: string[][],
  headerRowIndex: number
): { headers: string[]; rawRows: Record<string, string>[]; rowNumbers: number[] } {
  if (!Array.isArray(grid) || grid.length === 0) {
    return { headers: [], rawRows: [], rowNumbers: [] };
  }

  const safeIdx = Math.max(0, Math.min(headerRowIndex, grid.length - 1));
  const rawHeaderRow = Array.isArray(grid[safeIdx]) ? grid[safeIdx] : [];
  const alignedHeaders = buildUniqueHeadersFromRow(rawHeaderRow);

  const colEntries: Array<{ colIndex: number; header: string }> = [];
  for (let c = 0; c < alignedHeaders.length; c++) {
    const h = alignedHeaders[c];
    if (h) {
      colEntries.push({ colIndex: c, header: h });
    }
  }

  const headers = colEntries.map(e => e.header);
  if (headers.length === 0) {
    return { headers: [], rawRows: [], rowNumbers: [] };
  }

  const rawRows: Record<string, string>[] = [];
  const rowNumbers: number[] = [];
  for (let r = safeIdx + 1; r < grid.length; r++) {
    const row = Array.isArray(grid[r]) ? grid[r] : [];
    const obj: Record<string, string> = {};
    let nonEmptyCells = 0;

    for (const { colIndex, header } of colEntries) {
      const val = String(row[colIndex] ?? '').trim();
      obj[header] = val;
      if (val !== '') {
        nonEmptyCells++;
      }
    }

    if (nonEmptyCells === 0) continue;

    // Skip footer total/summary rows
    const firstNonEmpty = Object.values(obj).find(v => v !== '') || '';
    const firstNorm = normalizeHeaderKey(firstNonEmpty);
    if (
      (firstNorm === 'TOTAL' || firstNorm === 'TOTALES' || firstNorm === 'SUBTOTAL') &&
      nonEmptyCells <= 4
    ) {
      continue;
    }

    rawRows.push(obj);
    rowNumbers.push(r + 1);
  }

  return { headers, rawRows, rowNumbers };
}

export function buildSheetMatrixFromEntities(
  entity: EntityType,
  items: any[],
  customHeaders?: string[]
): { headers: string[]; matrix: (string | number)[][] } {
  const base = ENTITY_CONFIGS[entity]?.baseHeaders || [];
  const headers =
    Array.isArray(customHeaders) && customHeaders.length > 0
      ? customHeaders.filter(h => String(h || '').trim() !== '')
      : base;

  const matrix: (string | number)[][] = items.map(item =>
    headers.map(h => {
      const val = extractValueForHeader(entity, item, h);
      return val === undefined || val === null ? '' : val;
    })
  );

  return { headers, matrix };
}
