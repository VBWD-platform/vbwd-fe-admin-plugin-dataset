<template>
  <div class="dataset-view dataset-list">
    <div class="view-header">
      <h2>{{ $t('dataset.list.heading') }}</h2>
      <div class="view-header__actions">
        <!-- Unified data-exchange controls — driven by the permission-filtered manifest. -->
        <ImportExportControls
          v-if="showImportExport"
          :api="dataExchangeApi"
          entity-key="dataset"
          :selected-ids="selectedDatasetIds"
          :filter-state="filterParams()"
          :can-export="datasetCapabilities.can_export"
          :can-import="datasetCapabilities.can_import"
          :can-export-pii="datasetCapabilities.can_export_pii"
          :is-superadmin="isSuperadmin"
          :supported-formats="datasetCapabilities.supported_formats"
          @refresh="load"
        />
        <router-link
          v-if="canManage"
          :to="{ name: 'dataset-new' }"
          class="create-btn"
          data-testid="dataset-new"
        >
          {{ $t('dataset.list.new') }}
        </router-link>
      </div>
    </div>

    <!-- Filters: quicksearch (300ms debounce) + by-category selector. -->
    <div class="view-filters">
      <input
        v-model="search"
        type="text"
        class="search-input"
        data-testid="dataset-search"
        :placeholder="$t('dataset.list.search')"
        @input="onSearch"
      >
      <select
        v-model="filterCategory"
        class="filter-select"
        data-testid="filter-category"
        @change="applyFilters"
      >
        <option value="">
          {{ $t('dataset.list.allCategories') }}
        </option>
        <option
          v-for="category in store.categoryTerms"
          :key="category.id"
          :value="category.id"
        >
          {{ category.name }}
        </option>
      </select>
    </div>

    <!-- Bulk actions — only visible once a row is selected. -->
    <CmsBulkBar
      :count="bulk.selectedCount.value"
      :can-manage="canManage"
      :all-matching="bulk.allMatching.value"
      :total="store.datasets?.total ?? 0"
      @delete="bulkDelete"
      @clear="bulk.clear"
    >
      <template #actions>
        <select
          v-if="canManage"
          class="bulk-select"
          data-testid="bulk-assign-category"
          @change="onBulkAssignCategory($event)"
        >
          <option value="">
            + {{ $t('dataset.bulk.assignCategory') }}…
          </option>
          <option
            v-for="category in store.categoryTerms"
            :key="category.id"
            :value="category.id"
          >
            {{ category.name }}
          </option>
        </select>
        <button
          v-if="canManage"
          type="button"
          class="btn"
          data-testid="bulk-activate"
          @click="bulkSetActive(true)"
        >
          {{ $t('dataset.bulk.activate') }}
        </button>
        <button
          v-if="canManage"
          type="button"
          class="btn"
          data-testid="bulk-deactivate"
          @click="bulkSetActive(false)"
        >
          {{ $t('dataset.bulk.deactivate') }}
        </button>
      </template>
    </CmsBulkBar>

    <div
      v-if="store.error"
      class="dataset-list__error"
    >
      {{ store.error }}
    </div>

    <div
      v-if="store.loading"
      class="loading-state"
    >
      {{ $t('dataset.list.loading') }}
    </div>

    <div
      v-else-if="!store.datasets?.items?.length"
      class="empty-state"
    >
      <p>{{ $t('dataset.list.empty') }}</p>
    </div>

    <table
      v-else
      class="data-table"
    >
      <thead>
        <tr>
          <CmsSelectAllTh
            :all-page-selected="bulk.allPageSelected.value"
            :all-matching="bulk.allMatching.value"
            :show-scope-menu="bulk.showScopeMenu.value"
            :total="store.datasets?.total ?? 0"
            @toggle="bulk.onHeaderToggle"
            @select-page="bulk.selectPage"
            @select-all="bulk.selectAllMatching"
          />
          <CmsSortableTh
            col="title"
            :sort-by="sortBy"
            :sort-dir="sortDir"
            @sort="sort"
          >
            {{ $t('dataset.columns.title') }}
          </CmsSortableTh>
          <th>{{ $t('dataset.columns.slug') }}</th>
          <CmsSortableTh
            col="category"
            :sort-by="sortBy"
            :sort-dir="sortDir"
            @sort="sort"
          >
            {{ $t('dataset.columns.category') }}
          </CmsSortableTh>
          <CmsSortableTh
            col="price"
            :sort-by="sortBy"
            :sort-dir="sortDir"
            @sort="sort"
          >
            {{ $t('dataset.columns.price') }}
          </CmsSortableTh>
          <CmsSortableTh
            col="updated_at"
            :sort-by="sortBy"
            :sort-dir="sortDir"
            @sort="sort"
          >
            {{ $t('dataset.columns.updated') }}
          </CmsSortableTh>
          <CmsSortableTh
            col="is_active"
            :sort-by="sortBy"
            :sort-dir="sortDir"
            @sort="sort"
          >
            {{ $t('dataset.columns.active') }}
          </CmsSortableTh>
          <th>{{ $t('dataset.columns.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="dataset in store.datasets.items"
          :key="dataset.id"
          class="table-row"
          data-testid="dataset-row"
          @click="openEditor(dataset.id)"
        >
          <td
            class="select-col"
            @click.stop
          >
            <input
              type="checkbox"
              :data-testid="`row-select-${dataset.id}`"
              :checked="bulk.isSelected(dataset.id)"
              @change="bulk.toggleOne(dataset.id)"
            >
          </td>
          <td>{{ dataset.title }}</td>
          <td class="slug-cell">
            {{ dataset.slug }}
          </td>
          <td>{{ categoryNamesFor(dataset) }}</td>
          <td>{{ dataset.price }}</td>
          <td>{{ formatDate(dataset.updated_at) }}</td>
          <td>
            <span
              class="status-badge"
              :class="dataset.is_active ? 'active' : 'inactive'"
            >
              {{ dataset.is_active ? $t('dataset.status.active') : $t('dataset.status.inactive') }}
            </span>
          </td>
          <td @click.stop>
            <router-link
              :to="{ name: 'dataset-edit', params: { id: dataset.id } }"
              class="action-btn"
              :data-testid="`dataset-edit-${dataset.id}`"
            >
              {{ $t('dataset.editor.tabDetails') }}
            </router-link>
            &nbsp;
            <button
              v-if="canManage"
              type="button"
              class="action-btn danger"
              @click="deleteOne(dataset.id)"
            >
              {{ $t('dataset.archive.delete') }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Pagination -->
    <div
      v-if="store.datasets && store.datasets.pages > 1"
      class="pagination"
    >
      <button
        type="button"
        :disabled="currentPage <= 1"
        @click="changePage(currentPage - 1)"
      >
        ‹
      </button>
      <span>{{ currentPage }} / {{ store.datasets.pages }}</span>
      <button
        type="button"
        :disabled="currentPage >= store.datasets.pages"
        @click="changePage(currentPage + 1)"
      >
        ›
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useDatasetStore, type Dataset } from '../stores/useDatasetStore';
import { useCmsBulkSelection } from '../../../cms-admin/src/composables/useCmsBulkSelection';
import CmsBulkBar from '../../../cms-admin/src/components/CmsBulkBar.vue';
import CmsSelectAllTh from '../../../cms-admin/src/components/CmsSelectAllTh.vue';
import CmsSortableTh from '../../../cms-admin/src/components/CmsSortableTh.vue';
import { ImportExportControls } from 'vbwd-view-component';
import { createDataExchangeApi } from '@/api/dataExchangeApi';
import { useDataExchangeManifest } from '@/composables/useDataExchangeManifest';

const PER_PAGE = 20;
const SEARCH_DEBOUNCE_MS = 300;
const BULK_CATEGORY_RESET = '';
const DATASET_ENTITY_KEY = 'dataset';

const router = useRouter();
const store = useDatasetStore();
const authStore = useAuthStore();
const canManage = computed(() => authStore.hasPermission('dataset.manage'));

const search = ref('');
const filterCategory = ref('');
const currentPage = ref(1);
const sortBy = ref('updated_at');
const sortDir = ref<'asc' | 'desc'>('desc');

let searchTimer: ReturnType<typeof setTimeout>;

function filterParams(): Record<string, unknown> {
  const params: Record<string, unknown> = {};
  if (search.value) params.search = search.value;
  if (filterCategory.value) params.category = filterCategory.value;
  return params;
}

function load(): void {
  store.fetchDatasets({
    ...filterParams(),
    page: currentPage.value,
    per_page: PER_PAGE,
    sort_by: sortBy.value,
    sort_dir: sortDir.value,
  });
}

function applyFilters(): void {
  currentPage.value = 1;
  load();
}

function onSearch(): void {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(applyFilters, SEARCH_DEBOUNCE_MS);
}

function sort(col: string): void {
  if (sortBy.value === col) {
    sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc';
  } else {
    sortBy.value = col;
    sortDir.value = 'asc';
  }
  load();
}

function changePage(page: number): void {
  currentPage.value = page;
  load();
}

function formatDate(iso?: string): string {
  return iso ? iso.slice(0, 10) : '—';
}

function openEditor(id: string): void {
  router.push({ name: 'dataset-edit', params: { id } });
}

function categoryNamesFor(dataset: Dataset): string {
  const ids = new Set(dataset.term_ids ?? []);
  return store.categoryTerms
    .filter((term) => ids.has(term.id))
    .map((term) => term.name)
    .join(', ');
}

const bulk = useCmsBulkSelection({
  pageIds: () => (store.datasets?.items ?? []).map((dataset) => dataset.id),
  totalCount: () => store.datasets?.total ?? 0,
  fetchAllIds: () => store.fetchAllDatasetIds(filterParams()),
});

// ── Unified data-exchange controls ─────────────────────────────────────────
// The dataset backend registers a `dataset` exchanger; the per-list control
// derives its capabilities from the permission-filtered manifest and reuses
// the existing bulk selection for "Export selected".
const dataExchangeApi = createDataExchangeApi();
const isSuperadmin = computed(() => authStore.isSuperAdmin);
const { load: loadManifest, capabilitiesFor } = useDataExchangeManifest();
const datasetCapabilities = computed(() => capabilitiesFor(DATASET_ENTITY_KEY));
const showImportExport = computed(
  () => datasetCapabilities.value.can_export || datasetCapabilities.value.can_import,
);
const selectedDatasetIds = computed(() => [...bulk.selected.value]);

async function bulkDelete(): Promise<void> {
  const ids = await bulk.resolveIds();
  if (!ids.length || !confirm(`Delete ${ids.length} selected dataset(s)?`)) return;
  await store.bulkDeleteDatasets(ids);
  bulk.clear();
  load();
}

async function bulkSetActive(isActive: boolean): Promise<void> {
  const ids = await bulk.resolveIds();
  if (!ids.length) return;
  await store.bulkSetActive(ids, isActive);
  bulk.clear();
  load();
}

async function onBulkAssignCategory(event: Event): Promise<void> {
  const select = event.target as HTMLSelectElement;
  const termId = select.value;
  select.value = BULK_CATEGORY_RESET;
  if (!termId) return;
  const ids = await bulk.resolveIds();
  if (!ids.length) return;
  await store.bulkAssignTerm(ids, termId);
  bulk.clear();
  load();
}

async function deleteOne(id: string): Promise<void> {
  if (!confirm('Delete this dataset?')) return;
  await store.deleteDataset(id);
  load();
}

onMounted(async () => {
  await store.fetchCategoryTerms();
  void loadManifest();
  load();
});
</script>

<style scoped>
.dataset-list {
  background: white;
  padding: 20px;
  border-radius: 8px;
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.view-header__actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.view-header h2 {
  margin: 0;
  color: #2c3e50;
}

.dataset-list__error {
  background: #fee2e2;
  color: #991b1b;
  padding: 0.6rem 1rem;
  border-radius: 4px;
  margin-bottom: 1rem;
}

.create-btn {
  display: inline-block;
  padding: 10px 20px;
  background: #27ae60;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  text-decoration: none;
}

.create-btn:hover {
  background: #1e8449;
}

.view-filters {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.search-input {
  flex: 1;
  max-width: 300px;
  padding: 10px 15px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.filter-select {
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  background: white;
  cursor: pointer;
}

.btn {
  padding: 8px 16px;
  border: 1px solid var(--admin-border, #e0e0e0);
  border-radius: 4px;
  background: var(--admin-card-bg, #fff);
  color: var(--admin-text, #333);
  cursor: pointer;
  font-size: 14px;
  white-space: nowrap;
}

.btn:hover {
  background: var(--admin-row-hover, #f8f9fa);
}

.bulk-select {
  padding: 8px 10px;
  border: 1px solid var(--admin-input-border, #ddd);
  border-radius: 4px;
  font-size: 13px;
  background: var(--admin-card-bg, #fff);
  color: var(--admin-text, #333);
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 40px;
  color: #666;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  padding: 12px 15px;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.data-table th {
  background: #f8f9fa;
  font-weight: 600;
  color: #2c3e50;
  white-space: nowrap;
}

.select-col {
  width: 36px;
  text-align: center;
}

.table-row {
  cursor: pointer;
  transition: background-color 0.2s;
}

.table-row:hover {
  background-color: #f8f9fa;
}

.slug-cell {
  font-family: monospace;
  font-size: 0.85rem;
  color: #666;
}

.status-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 0.8rem;
  font-weight: 500;
}

.status-badge.active {
  background: #d4edda;
  color: #155724;
}

.status-badge.inactive {
  background: #f8d7da;
  color: #721c24;
}

.action-btn {
  padding: 5px 10px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  background: #e9ecef;
  color: #2c3e50;
  text-decoration: none;
  display: inline-block;
}

.action-btn.danger {
  background: none;
  color: #dc2626;
  text-decoration: underline;
  padding: 0;
}

.pagination {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-top: 20px;
  justify-content: center;
}

.pagination button {
  padding: 8px 14px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
  cursor: pointer;
  font-size: 14px;
}

.pagination button:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
