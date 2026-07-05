import { describe, it, expect } from 'vitest';
import {
  parseNumber,
  isNumericColumn,
  columnNumbers,
  computeStatistics,
  compareCells,
  sortRowIndices,
  matchesFilter,
  serializeCsv,
  formatCellDisplay,
  type Cell,
} from '../../src/utils/spreadsheet';

describe('parseNumber', () => {
  it('parses numeric strings and numbers, rejects the rest', () => {
    expect(parseNumber('42')).toBe(42);
    expect(parseNumber(' 3.5 ')).toBe(3.5);
    expect(parseNumber(7)).toBe(7);
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('')).toBeNull();
    expect(parseNumber(null)).toBeNull();
  });
});

describe('isNumericColumn', () => {
  const rows: Cell[][] = [
    ['Berlin', '20.3', ''],
    ['Paris', '17', 'note'],
    ['Rome', null, '3'],
  ];
  it('detects an all-numeric column (ignoring blanks/nulls)', () => {
    expect(isNumericColumn(rows, 1)).toBe(true);
  });
  it('rejects a column with a non-numeric value', () => {
    expect(isNumericColumn(rows, 0)).toBe(false);
    expect(isNumericColumn(rows, 2)).toBe(false);
  });
  it('is false for a column with no values at all', () => {
    expect(isNumericColumn([[''], [null]], 0)).toBe(false);
  });
});

describe('columnNumbers', () => {
  it('collects only the parseable numbers', () => {
    const rows: Cell[][] = [['1'], ['x'], [3], [null]];
    expect(columnNumbers(rows, 0)).toEqual([1, 3]);
  });
});

describe('computeStatistics', () => {
  it('returns count/sum/mean/min/max/median/stddev', () => {
    const stats = computeStatistics([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(stats).not.toBeNull();
    expect(stats?.count).toBe(8);
    expect(stats?.sum).toBe(40);
    expect(stats?.mean).toBe(5);
    expect(stats?.min).toBe(2);
    expect(stats?.max).toBe(9);
    expect(stats?.median).toBe(4.5);
    // population standard deviation of the classic example is 2.
    expect(stats?.stddev).toBeCloseTo(2, 10);
  });
  it('handles a single value', () => {
    const stats = computeStatistics([42]);
    expect(stats?.count).toBe(1);
    expect(stats?.median).toBe(42);
    expect(stats?.stddev).toBe(0);
  });
  it('odd-length median is the middle value', () => {
    expect(computeStatistics([1, 3, 2])?.median).toBe(2);
  });
  it('returns null for an empty set (non-numeric guard)', () => {
    expect(computeStatistics([])).toBeNull();
  });
});

describe('compareCells', () => {
  it('compares numerically for numeric columns', () => {
    expect(compareCells('9', '10', true)).toBeLessThan(0);
    expect(compareCells('10', '9', true)).toBeGreaterThan(0);
  });
  it('compares lexically for non-numeric columns', () => {
    expect(compareCells('apple', 'banana', false)).toBeLessThan(0);
    expect(compareCells('9', '10', false)).toBeGreaterThan(0); // '9' > '1'
  });
  it('sorts nulls last for numeric', () => {
    expect(compareCells(null, '1', true)).toBeGreaterThan(0);
  });
});

describe('sortRowIndices', () => {
  const rows: Cell[][] = [['b', '10'], ['a', '2'], ['c', '2']];
  it('ascending numeric with a stable tie-break', () => {
    expect(sortRowIndices(rows, 1, 'asc', true)).toEqual([1, 2, 0]);
  });
  it('descending numeric', () => {
    expect(sortRowIndices(rows, 1, 'desc', true)).toEqual([0, 1, 2]);
  });
  it('lexical ascending', () => {
    expect(sortRowIndices(rows, 0, 'asc', false)).toEqual([1, 0, 2]);
  });
  it('no direction returns the original order', () => {
    expect(sortRowIndices(rows, 0, null, false)).toEqual([0, 1, 2]);
  });
});

describe('matchesFilter', () => {
  it('empty filter matches everything', () => {
    expect(matchesFilter('anything', '', false)).toBe(true);
    expect(matchesFilter(null, '   ', true)).toBe(true);
  });
  it('substring contains (case-insensitive) for strings', () => {
    expect(matchesFilter('Berlin', 'ber', false)).toBe(true);
    expect(matchesFilter('Paris', 'xyz', false)).toBe(false);
  });
  it('numeric comparators > < >= <= =', () => {
    expect(matchesFilter('10', '>5', true)).toBe(true);
    expect(matchesFilter('3', '>5', true)).toBe(false);
    expect(matchesFilter('5', '<=5', true)).toBe(true);
    expect(matchesFilter('5', '>=5', true)).toBe(true);
    expect(matchesFilter('4', '<5', true)).toBe(true);
    expect(matchesFilter('3', '=3', true)).toBe(true);
    expect(matchesFilter('4', '=3', true)).toBe(false);
  });
  it('numeric column still supports plain substring', () => {
    expect(matchesFilter('123', '2', true)).toBe(true);
  });
});

describe('serializeCsv', () => {
  it('serializes columns + rows with a trailing newline', () => {
    const csv = serializeCsv(['a', 'b'], [['1', '2'], ['3', '4']]);
    expect(csv).toBe('a,b\n1,2\n3,4\n');
  });
  it('quotes values containing comma, quote or newline', () => {
    const csv = serializeCsv(['x'], [['a,b'], ['he said "hi"'], ['line\nbreak']]);
    expect(csv).toBe('x\n"a,b"\n"he said ""hi"""\n"line\nbreak"\n');
  });
  it('renders null as an empty field', () => {
    expect(serializeCsv(['a'], [[null]])).toBe('a\n\n');
  });
});

describe('formatCellDisplay', () => {
  it('rounds numeric cells to the requested decimals', () => {
    expect(formatCellDisplay('20.299999999999997', true, 3)).toBe('20.300');
    expect(formatCellDisplay(1.23456, true, 2)).toBe('1.23');
  });
  it('leaves non-numeric cells untouched', () => {
    expect(formatCellDisplay('Berlin', false, 3)).toBe('Berlin');
    expect(formatCellDisplay(null, false, 3)).toBe('');
  });
  it('with null decimals shows the raw value', () => {
    expect(formatCellDisplay('20.299999999999997', true, null)).toBe('20.299999999999997');
  });
});
