/**
 * Pure, framework-free helpers for the interactive snapshot spreadsheet.
 *
 * Everything here is a pure function over plain data so it can be unit-tested in
 * isolation and reused by the view without pulling in Vue. No external
 * spreadsheet library — just numbers, strings and arrays.
 */

/** One spreadsheet cell value as the rows endpoint serialises it. */
export type Cell = string | number | null;

/** Per-column descriptive statistics over a set of numeric values. */
export interface ColumnStatistics {
  count: number;
  sum: number;
  mean: number;
  min: number;
  max: number;
  median: number;
  stddev: number;
}

/** A column-sort direction; ``null`` means "unsorted / original order". */
export type SortDirection = 'asc' | 'desc' | null;

// A leading comparator (``>``, ``<=`` …) followed by a plain number.
const COMPARATOR_PATTERN = /^\s*(>=|<=|>|<|=)\s*(-?\d+(?:\.\d+)?)\s*$/;

/** Parse a cell to a finite number, or ``null`` when it is not numeric/blank. */
export function parseNumber(cell: Cell): number | null {
  if (cell === null || cell === undefined) return null;
  if (typeof cell === 'number') return Number.isFinite(cell) ? cell : null;
  const trimmed = cell.trim();
  if (trimmed === '') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function isBlank(cell: Cell): boolean {
  return cell === null || cell === undefined || (typeof cell === 'string' && cell.trim() === '');
}

/** True when a column has at least one value and every value is numeric. */
export function isNumericColumn(rows: Cell[][], columnIndex: number): boolean {
  let sawValue = false;
  for (const row of rows) {
    const cell = row[columnIndex];
    if (isBlank(cell)) continue;
    sawValue = true;
    if (parseNumber(cell) === null) return false;
  }
  return sawValue;
}

/** The parseable numbers in a column (blanks and non-numeric cells dropped). */
export function columnNumbers(rows: Cell[][], columnIndex: number): number[] {
  const values: number[] = [];
  for (const row of rows) {
    const parsed = parseNumber(row[columnIndex]);
    if (parsed !== null) values.push(parsed);
  }
  return values;
}

/** Descriptive statistics for a set of numbers, or ``null`` when empty. */
export function computeStatistics(values: number[]): ColumnStatistics | null {
  if (!values.length) return null;
  const count = values.length;
  const sum = values.reduce((total, value) => total + value, 0);
  const mean = sum / count;

  const sorted = [...values].sort((left, right) => left - right);
  const min = sorted[0];
  const max = sorted[count - 1];
  const middle = Math.floor(count / 2);
  const median =
    count % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;

  const variance =
    values.reduce((total, value) => total + (value - mean) ** 2, 0) / count;
  const stddev = Math.sqrt(variance);

  return { count, sum, mean, min, max, median, stddev };
}

/** Compare two cells numerically (numeric column) or lexically (otherwise). */
export function compareCells(left: Cell, right: Cell, numeric: boolean): number {
  if (numeric) {
    const leftNumber = parseNumber(left);
    const rightNumber = parseNumber(right);
    if (leftNumber === null && rightNumber === null) return 0;
    if (leftNumber === null) return 1; // blanks sort last
    if (rightNumber === null) return -1;
    return leftNumber - rightNumber;
  }
  const leftText = left === null || left === undefined ? '' : String(left);
  const rightText = right === null || right === undefined ? '' : String(right);
  return leftText.localeCompare(rightText);
}

/**
 * Return the row order (as original indices) sorted by one column.
 *
 * Stable: equal cells keep their original relative order. ``direction === null``
 * yields the untouched original order.
 */
export function sortRowIndices(
  rows: Cell[][],
  columnIndex: number,
  direction: SortDirection,
  numeric: boolean,
): number[] {
  const indices = rows.map((_row, index) => index);
  if (!direction) return indices;
  const sign = direction === 'asc' ? 1 : -1;
  return indices.sort((leftIndex, rightIndex) => {
    const comparison = compareCells(
      rows[leftIndex][columnIndex],
      rows[rightIndex][columnIndex],
      numeric,
    );
    if (comparison !== 0) return sign * comparison;
    return leftIndex - rightIndex; // stable tie-break
  });
}

/**
 * Does a cell pass a column filter? Empty filter always matches. Numeric columns
 * accept a comparator (``>10``, ``<=5``, ``=3``) OR a plain substring; other
 * columns use a case-insensitive "contains".
 */
export function matchesFilter(cell: Cell, filter: string, numeric: boolean): boolean {
  const query = filter.trim();
  if (query === '') return true;

  if (numeric) {
    const match = COMPARATOR_PATTERN.exec(query);
    if (match) {
      const value = parseNumber(cell);
      if (value === null) return false;
      const operand = Number(match[2]);
      switch (match[1]) {
        case '>':
          return value > operand;
        case '<':
          return value < operand;
        case '>=':
          return value >= operand;
        case '<=':
          return value <= operand;
        case '=':
          return value === operand;
        default:
          return false;
      }
    }
  }

  const haystack = cell === null || cell === undefined ? '' : String(cell);
  return haystack.toLowerCase().includes(query.toLowerCase());
}

/** Serialise columns + rows back to CSV (RFC-style quoting, trailing newline). */
export function serializeCsv(columns: string[], rows: Cell[][]): string {
  const escapeField = (value: Cell): string => {
    const text = value === null || value === undefined ? '' : String(value);
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  const lines = [columns.map(escapeField).join(',')];
  for (const row of rows) lines.push(row.map(escapeField).join(','));
  return `${lines.join('\n')}\n`;
}

/**
 * Display text for a cell. Numeric cells are rounded to ``decimals`` places
 * (``null`` = show the raw value); other cells render as-is.
 */
export function formatCellDisplay(
  cell: Cell,
  numeric: boolean,
  decimals: number | null,
): string {
  if (numeric && decimals !== null) {
    const value = parseNumber(cell);
    if (value !== null) return value.toFixed(Math.max(0, decimals));
  }
  return cell === null || cell === undefined ? '' : String(cell);
}
