<template>
  <div class="dataset-spreadsheet-wrap">
    <p
      v-if="loading"
      class="spreadsheet-state spreadsheet-state--loading"
      data-testid="spreadsheet-loading"
    >
      {{ $t('dataset.spreadsheet.loading') }}
    </p>

    <p
      v-else-if="error"
      class="spreadsheet-state spreadsheet-state--error"
      data-testid="spreadsheet-error"
    >
      {{ error }}
    </p>

    <p
      v-else-if="!columns.length"
      class="spreadsheet-state spreadsheet-state--empty"
      data-testid="spreadsheet-empty"
    >
      {{ $t('dataset.spreadsheet.empty') }}
    </p>

    <div
      v-else
      class="spreadsheet-scroll"
    >
      <table
        class="spreadsheet"
        data-testid="dataset-spreadsheet"
      >
        <thead>
          <tr>
            <th class="spreadsheet__rownum spreadsheet__rownum--head" />
            <th
              v-for="(column, columnIndex) in columns"
              :key="columnIndex"
              class="spreadsheet__col"
              :class="{ 'is-sortable': sortable }"
              data-testid="spreadsheet-col"
              @click="sortable && emit('sort', columnIndex)"
            >
              <span>{{ column }}</span>
              <span
                v-if="sortColumn === columnIndex && sortDirection"
                class="sort-indicator"
                data-testid="sort-indicator"
              >{{ sortDirection === 'asc' ? '▲' : '▼' }}</span>
            </th>
          </tr>
          <tr
            v-if="showFilters"
            class="filter-row"
          >
            <th class="spreadsheet__rownum" />
            <th
              v-for="columnIndex in columnIndexes"
              :key="`filter-${columnIndex}`"
            >
              <input
                class="filter-input"
                data-testid="spreadsheet-filter"
                :value="filters[columnIndex] ?? ''"
                :placeholder="numericColumns[columnIndex] ? '>0, =5, text…' : '…'"
                @input="onFilter(columnIndex, $event)"
              >
            </th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(row, rowIndex) in rows"
            :key="rowIndex"
            data-testid="spreadsheet-row"
          >
            <td class="spreadsheet__rownum">
              {{ rowIndex + 1 }}
            </td>
            <td
              v-for="(cell, cellIndex) in row"
              :key="cellIndex"
              class="spreadsheet__cell"
              :class="{ 'align-right': numericColumns[cellIndex] }"
            >
              <input
                v-if="editable"
                class="cell-input"
                data-testid="spreadsheet-cell-input"
                :value="displayValue(cell, cellIndex)"
                @change="onCellEdit(rowKeyFor(rowIndex), cellIndex, $event)"
              >
              <template v-else>
                {{ displayValue(cell, cellIndex) }}
              </template>
            </td>
          </tr>
        </tbody>
        <tfoot v-if="footerLabel">
          <tr data-testid="spreadsheet-stat-row">
            <td class="spreadsheet__rownum spreadsheet__stat-label">
              {{ footerLabel }}
            </td>
            <td
              v-for="columnIndex in columnIndexes"
              :key="`stat-${columnIndex}`"
              class="spreadsheet__cell spreadsheet__stat-cell align-right"
              data-testid="spreadsheet-stat-cell"
            >
              {{ statText(footerValues[columnIndex]) }}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { formatCellDisplay, type Cell, type SortDirection } from '../utils/spreadsheet';

const props = withDefaults(
  defineProps<{
    columns: string[];
    rows: Cell[][];
    loading?: boolean;
    error?: string | null;
    editable?: boolean;
    decimals?: number | null;
    numericColumns?: boolean[];
    sortable?: boolean;
    sortColumn?: number | null;
    sortDirection?: SortDirection;
    showFilters?: boolean;
    filters?: string[];
    rowKeys?: (number | string)[];
    footerLabel?: string | null;
    footerValues?: (number | null)[];
  }>(),
  {
    loading: false,
    error: null,
    editable: false,
    decimals: null,
    numericColumns: () => [],
    sortable: false,
    sortColumn: null,
    sortDirection: null,
    showFilters: false,
    filters: () => [],
    rowKeys: () => [],
    footerLabel: null,
    footerValues: () => [],
  },
);

const emit = defineEmits<{
  (event: 'sort', columnIndex: number): void;
  (event: 'filter', columnIndex: number, value: string): void;
  (event: 'cell-edit', rowKey: number | string, columnIndex: number, value: string): void;
}>();

const DEFAULT_STAT_DECIMALS = 3;

// Column positions to iterate for the filter row and stats footer (the header
// row iterates ``columns`` directly since it renders each column's name).
const columnIndexes = computed(() => props.columns.map((_column, index) => index));

function displayValue(cell: Cell, columnIndex: number): string {
  return formatCellDisplay(cell, Boolean(props.numericColumns[columnIndex]), props.decimals);
}

function rowKeyFor(rowIndex: number): number | string {
  const key = props.rowKeys[rowIndex];
  return key === undefined ? rowIndex : key;
}

function onFilter(columnIndex: number, event: Event): void {
  emit('filter', columnIndex, (event.target as HTMLInputElement).value);
}

function onCellEdit(rowKey: number | string, columnIndex: number, event: Event): void {
  emit('cell-edit', rowKey, columnIndex, (event.target as HTMLInputElement).value);
}

function statText(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(props.decimals ?? DEFAULT_STAT_DECIMALS);
}
</script>

<style scoped>
.dataset-spreadsheet-wrap {
  width: 100%;
}

.spreadsheet-state {
  padding: 16px;
  color: #6b7280;
}

.spreadsheet-state--error {
  color: #991b1b;
}

.spreadsheet-scroll {
  max-height: 60vh;
  overflow: auto;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
}

.spreadsheet {
  border-collapse: collapse;
  width: max-content;
  min-width: 100%;
  font-size: 0.85rem;
}

.spreadsheet thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f9fafb;
  border-bottom: 2px solid #e5e7eb;
  padding: 0.4rem 0.75rem;
  text-align: left;
  font-weight: 600;
  color: #374151;
  white-space: nowrap;
}

.spreadsheet__col.is-sortable {
  cursor: pointer;
  user-select: none;
}

.sort-indicator {
  margin-left: 4px;
  color: #1d4ed8;
}

.filter-row th {
  top: 33px;
  padding: 0.2rem 0.4rem;
}

.filter-input {
  width: 100%;
  min-width: 80px;
  padding: 0.2rem 0.35rem;
  font-size: 0.75rem;
  border: 1px solid #e5e7eb;
  border-radius: 4px;
}

.spreadsheet__rownum {
  position: sticky;
  left: 0;
  z-index: 1;
  background: #f9fafb;
  color: #9ca3af;
  text-align: right;
  padding: 0.35rem 0.6rem;
  border-right: 1px solid #e5e7eb;
  white-space: nowrap;
}

.spreadsheet__rownum--head {
  z-index: 2;
}

.spreadsheet__cell {
  padding: 0.35rem 0.75rem;
  border-bottom: 1px solid #f3f4f6;
  white-space: nowrap;
  color: #374151;
}

.spreadsheet__cell.align-right {
  text-align: right;
}

.cell-input {
  width: 100%;
  min-width: 70px;
  padding: 0.15rem 0.35rem;
  font: inherit;
  color: inherit;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
}

.cell-input:focus {
  border-color: #1d4ed8;
  background: #fff;
  outline: none;
}

.spreadsheet tfoot td {
  position: sticky;
  bottom: 0;
  background: #f3f4f6;
  border-top: 2px solid #e5e7eb;
  font-weight: 600;
  color: #1f2937;
}

.spreadsheet__stat-label {
  background: #f3f4f6;
  text-transform: capitalize;
}
</style>
