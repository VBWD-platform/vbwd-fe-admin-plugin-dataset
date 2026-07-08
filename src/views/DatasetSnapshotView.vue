<template>
  <div
    class="dataset-view snapshot-view"
    data-testid="snapshot-view"
  >
    <div class="view-header">
      <div>
        <router-link
          :to="{ name: 'dataset-edit', params: { id: datasetId } }"
          class="back-link"
          data-testid="snapshot-view-back"
        >
          {{ $t('dataset.snapshotView.back') }}
        </router-link>
        <h2 data-testid="snapshot-view-title">
          {{ title }}
        </h2>
        <p
          v-if="takenAt"
          class="snapshot-view__subtitle"
          data-testid="snapshot-view-taken-at"
        >
          {{ $t('dataset.snapshotView.snapshot') }}: {{ takenAt }}
        </p>
      </div>
    </div>

    <!-- Toolbar: display + editing controls. -->
    <div class="toolbar">
      <label class="toolbar__field">
        {{ $t('dataset.snapshotView.decimals') }}
        <input
          v-model.number="decimals"
          type="number"
          min="0"
          max="10"
          class="field-input toolbar__decimals"
          data-testid="decimals-control"
        >
      </label>

      <label class="toolbar__field">
        {{ $t('dataset.snapshotView.statistic') }}
        <select
          v-model="selectedStatistic"
          class="field-input"
          data-testid="stat-select"
        >
          <option
            v-for="option in STAT_OPTIONS"
            :key="option"
            :value="option"
          >
            {{ $t(`dataset.snapshotView.stats.${option}`) }}
          </option>
        </select>
      </label>

      <span class="toolbar__spacer" />

      <span
        class="toolbar__count"
        data-testid="filtered-count"
      >
        {{ $t('dataset.snapshotView.rows') }}: {{ displayRows.length }}
      </span>

      <template v-if="editable">
        <button
          type="button"
          class="btn"
          data-testid="reset-edits"
          :disabled="!isDirty || saving"
          @click="resetEdits"
        >
          {{ $t('dataset.snapshotView.reset') }}
        </button>
        <button
          type="button"
          class="btn btn--primary"
          data-testid="save-snapshot"
          :disabled="!isDirty || saving"
          @click="save"
        >
          {{ $t('dataset.snapshotView.save') }}
        </button>
      </template>
      <span
        v-else
        class="toolbar__note"
        data-testid="readonly-note"
      >
        {{ $t('dataset.snapshotView.tooLargeToEdit') }}
      </span>
    </div>

    <DatasetSpreadsheet
      :columns="columns"
      :rows="displayRows"
      :row-keys="displayRowKeys"
      :loading="loading"
      :error="error"
      :editable="editable"
      :decimals="decimals"
      :numeric-columns="numericColumns"
      sortable
      :sort-column="sortColumn"
      :sort-direction="sortDirection"
      show-filters
      :filters="filters"
      :footer-label="footerLabel"
      :footer-values="footerValues"
      @sort="cycleSort"
      @filter="applyFilter"
      @cell-edit="editCell"
    />

    <!-- Pagination — only in the oversized read-only mode. -->
    <div
      v-if="!editable"
      class="pager"
      data-testid="snapshot-pager"
    >
      <button
        type="button"
        class="btn"
        data-testid="snapshot-page-prev"
        :disabled="loading || offset === 0"
        @click="previousPage"
      >
        {{ $t('dataset.snapshotView.prev') }}
      </button>
      <span
        class="pager__range"
        data-testid="snapshot-row-range"
      >
        {{ rangeLabel }}
      </span>
      <button
        type="button"
        class="btn"
        data-testid="snapshot-page-next"
        :disabled="loading || !hasMore"
        @click="nextPage"
      >
        {{ $t('dataset.snapshotView.next') }}
      </button>

      <label class="pager__size">
        {{ $t('dataset.snapshotView.pageSize') }}
        <select
          v-model.number="limit"
          class="field-input"
          data-testid="snapshot-page-size"
          @change="changePageSize"
        >
          <option
            v-for="size in PAGE_SIZES"
            :key="size"
            :value="size"
          >
            {{ size }}
          </option>
        </select>
      </label>
    </div>

    <!-- Issue bundle: the primary data file plus any attached members (S124). -->
    <DatasetIssueFiles
      :key="snapshotId"
      :dataset-id="datasetId"
      :snapshot-id="snapshotId"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import DatasetSpreadsheet from '../components/DatasetSpreadsheet.vue';
import DatasetIssueFiles from '../components/DatasetIssueFiles.vue';
import { useDatasetStore } from '../stores/useDatasetStore';
import {
  isNumericColumn,
  columnNumbers,
  computeStatistics,
  compareCells,
  matchesFilter,
  serializeCsv,
  formatCellDisplay,
  type Cell,
  type ColumnStatistics,
  type SortDirection,
} from '../utils/spreadsheet';

const PAGE_SIZES = [50, 100, 250, 500];
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_DECIMALS = 3;
// Snapshots at or below this size are loaded whole so they can be edited safely.
const EDIT_SIZE_CAP = 2 * 1024 * 1024;
const FULL_LOAD_PAGE_SIZE = 500;
const STAT_OPTIONS: (keyof ColumnStatistics)[] = [
  'count',
  'sum',
  'mean',
  'min',
  'max',
  'median',
  'stddev',
];

const route = useRoute();
const router = useRouter();
const store = useDatasetStore();

const datasetId = ref<string>((route.params.datasetId as string) ?? '');
const snapshotId = ref<string>((route.params.snapshotId as string) ?? '');

const title = ref<string>('');
const takenAt = ref<string>('');
const sizeBytes = ref<number | null>(null);

const columns = ref<string[]>([]);
const loadedRows = ref<Cell[][]>([]);
const edits = ref<Record<string, string>>({});

const sortColumn = ref<number | null>(null);
const sortDirection = ref<SortDirection>(null);
const filters = ref<string[]>([]);
const decimals = ref<number>(DEFAULT_DECIMALS);
const selectedStatistic = ref<keyof ColumnStatistics>('mean');

// Pagination (read-only oversized mode only).
const offset = ref(0);
const limit = ref(DEFAULT_PAGE_SIZE);
const hasMore = ref(false);

const loading = ref(false);
const saving = ref(false);
const error = ref<string | null>(null);

const editable = computed(
  () => sizeBytes.value !== null && sizeBytes.value <= EDIT_SIZE_CAP,
);

function editKey(rowIndex: number, columnIndex: number): string {
  return `${rowIndex}:${columnIndex}`;
}

// loadedRows with any in-flight cell edits applied, in the original row order.
const effectiveRows = computed<Cell[][]>(() =>
  loadedRows.value.map((row, rowIndex) =>
    row.map((cell, columnIndex) => {
      const key = editKey(rowIndex, columnIndex);
      return key in edits.value ? edits.value[key] : cell;
    }),
  ),
);

const numericColumns = computed<boolean[]>(() =>
  columns.value.map((_column, columnIndex) =>
    isNumericColumn(effectiveRows.value, columnIndex),
  ),
);

// Original-row indices that pass every column filter (AND across columns).
const filteredIndices = computed<number[]>(() => {
  const result: number[] = [];
  effectiveRows.value.forEach((row, rowIndex) => {
    const passes = columns.value.every((_column, columnIndex) =>
      matchesFilter(row[columnIndex], filters.value[columnIndex] ?? '', numericColumns.value[columnIndex]),
    );
    if (passes) result.push(rowIndex);
  });
  return result;
});

// The filtered indices in the active sort order (stable).
const displayOrder = computed<number[]>(() => {
  const activeColumn = sortColumn.value;
  if (activeColumn === null || !sortDirection.value) return filteredIndices.value;
  const numeric = numericColumns.value[activeColumn];
  const sign = sortDirection.value === 'asc' ? 1 : -1;
  return [...filteredIndices.value].sort((leftIndex, rightIndex) => {
    const comparison = compareCells(
      effectiveRows.value[leftIndex][activeColumn],
      effectiveRows.value[rightIndex][activeColumn],
      numeric,
    );
    if (comparison !== 0) return sign * comparison;
    return leftIndex - rightIndex;
  });
});

const displayRows = computed<Cell[][]>(() =>
  displayOrder.value.map((rowIndex) => effectiveRows.value[rowIndex]),
);
const displayRowKeys = computed<number[]>(() => displayOrder.value);

const filteredRows = computed<Cell[][]>(() =>
  filteredIndices.value.map((rowIndex) => effectiveRows.value[rowIndex]),
);

const statistics = computed<(ColumnStatistics | null)[]>(() =>
  columns.value.map((_column, columnIndex) =>
    numericColumns.value[columnIndex]
      ? computeStatistics(columnNumbers(filteredRows.value, columnIndex))
      : null,
  ),
);

const footerLabel = computed<string | null>(() =>
  statistics.value.some((entry) => entry !== null) ? selectedStatistic.value : null,
);
const footerValues = computed<(number | null)[]>(() =>
  statistics.value.map((entry) => (entry ? entry[selectedStatistic.value] : null)),
);

const isDirty = computed(() => Object.keys(edits.value).length > 0);

const rangeLabel = computed(() => {
  if (!displayRows.value.length) return '0 – 0';
  const start = offset.value + 1;
  const end = offset.value + displayRows.value.length;
  return `${start} – ${end}`;
});

function cycleSort(columnIndex: number): void {
  if (sortColumn.value !== columnIndex) {
    sortColumn.value = columnIndex;
    sortDirection.value = 'asc';
  } else if (sortDirection.value === 'asc') {
    sortDirection.value = 'desc';
  } else {
    sortColumn.value = null;
    sortDirection.value = null;
  }
}

function applyFilter(columnIndex: number, value: string): void {
  const next = [...filters.value];
  next[columnIndex] = value;
  filters.value = next;
}

function editCell(rowKey: number | string, columnIndex: number, value: string): void {
  const rowIndex = Number(rowKey);
  const original = loadedRows.value[rowIndex]?.[columnIndex] ?? null;
  const originalDisplay = formatCellDisplay(original, numericColumns.value[columnIndex], decimals.value);
  const key = editKey(rowIndex, columnIndex);
  const next = { ...edits.value };
  if (value === originalDisplay || value === String(original ?? '')) {
    delete next[key];
  } else {
    next[key] = value;
  }
  edits.value = next;
}

function resetEdits(): void {
  edits.value = {};
  filters.value = columns.value.map(() => '');
  sortColumn.value = null;
  sortDirection.value = null;
}

async function loadHeader(): Promise<void> {
  if (!datasetId.value) return;
  try {
    const dataset = await store.fetchDataset(datasetId.value);
    title.value = dataset.title ?? '';
    const snapshots = await store.fetchSnapshots(datasetId.value);
    const snapshot = snapshots.find((snap) => snap.id === snapshotId.value);
    takenAt.value = snapshot?.taken_at ?? '';
    sizeBytes.value = snapshot ? snapshot.size_bytes : null;
  } catch {
    // A header lookup failure must not block the data grid; leave labels blank.
    title.value = title.value || '';
  }
}

function ensureFilters(columnCount: number): void {
  if (filters.value.length !== columnCount) {
    filters.value = Array.from({ length: columnCount }, () => '');
  }
}

async function loadPage(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const page = await store.fetchRows(
      datasetId.value,
      snapshotId.value,
      offset.value,
      limit.value,
    );
    columns.value = page.columns;
    loadedRows.value = page.rows;
    offset.value = page.offset;
    limit.value = page.limit;
    hasMore.value = page.has_more;
    ensureFilters(page.columns.length);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    loading.value = false;
  }
}

async function loadAllRows(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    const all = await store.fetchAllRows(datasetId.value, snapshotId.value, FULL_LOAD_PAGE_SIZE);
    columns.value = all.columns;
    loadedRows.value = all.rows;
    ensureFilters(all.columns.length);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    loading.value = false;
  }
}

async function loadData(): Promise<void> {
  edits.value = {};
  if (editable.value) {
    await loadAllRows();
  } else {
    offset.value = 0;
    await loadPage();
  }
}

async function nextPage(): Promise<void> {
  if (!hasMore.value) return;
  offset.value += limit.value;
  await loadPage();
}

async function previousPage(): Promise<void> {
  if (offset.value === 0) return;
  offset.value = Math.max(0, offset.value - limit.value);
  await loadPage();
}

async function changePageSize(): Promise<void> {
  offset.value = 0;
  await loadPage();
}

async function save(): Promise<void> {
  if (!editable.value || !isDirty.value) return;
  saving.value = true;
  error.value = null;
  try {
    const csv = serializeCsv(columns.value, effectiveRows.value);
    const formData = new FormData();
    formData.append('file', new File([csv], `${snapshotId.value}-edited.csv`, { type: 'text/csv' }));
    const created = await store.uploadSnapshot(datasetId.value, formData);
    edits.value = {};
    if (created && created.id) {
      snapshotId.value = created.id;
      await router.replace({
        name: 'dataset-snapshot-view',
        params: { datasetId: datasetId.value, snapshotId: created.id },
      });
    }
    await loadHeader();
    await loadData();
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await loadHeader();
  await loadData();
});
</script>

<style scoped>
.snapshot-view {
  background: white;
  padding: 20px;
  border-radius: 8px;
}

.view-header {
  margin-bottom: 16px;
}

.view-header h2 {
  margin: 4px 0 0;
  color: #2c3e50;
}

.back-link {
  font-size: 0.85rem;
  color: #1d4ed8;
  text-decoration: none;
}

.snapshot-view__subtitle {
  margin: 6px 0 0;
  color: #6b7280;
  font-size: 0.9rem;
}

.toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.toolbar__field {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #374151;
  font-size: 0.85rem;
}

.toolbar__decimals {
  width: 64px;
}

.toolbar__spacer {
  flex: 1;
}

.toolbar__count {
  color: #374151;
  font-size: 0.85rem;
}

.toolbar__note {
  color: #b45309;
  font-size: 0.8rem;
  font-style: italic;
}

.pager {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
}

.pager__range {
  color: #374151;
  font-size: 0.85rem;
  min-width: 80px;
  text-align: center;
}

.pager__size {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #374151;
  font-size: 0.85rem;
}

.btn {
  padding: 8px 16px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  background: #fff;
  color: #333;
  cursor: pointer;
  font-size: 14px;
}

.btn--primary {
  background: #27ae60;
  color: white;
  border-color: #27ae60;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.field-input {
  padding: 0.35rem 0.5rem;
  font-size: 0.9rem;
  color: #374151;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
}
</style>
