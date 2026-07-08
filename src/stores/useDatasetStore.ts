/**
 * Dataset admin store (S110 · T12/T13).
 *
 * Drives the fe-admin Datasets catalogue — the Pages-style list page plus the
 * tabbed editor. Mirrors `useCmsContentStore` (paged/sorted/filtered list, bulk
 * ops, taxonomy) but talks to the dataset plugin's own admin API. Categories are
 * the shared `dataset_category` term type (the cms term engine), so the term
 * lookups reuse the `/admin/cms/terms` route.
 */
import { defineStore } from 'pinia';
import { api } from '@/api';
import type { CmsTerm } from '../../../cms-admin/src/stores/useCmsContentStore';

export const DATASET_CATEGORY_TERM_TYPE = 'dataset_category';
export const DATASET_ENTITY_TYPE = 'dataset';

/** One assigned core tax as the dataset serializer returns it. */
export interface DatasetTaxRef {
  id: string;
  code: string;
  name: string;
  rate: string;
}

/** A dataset catalogue row (a Priceable sellable). */
export interface Dataset {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  source_attribution: string | null;
  // The serializer returns the stored price under `price` (not `raw_price`).
  price: number;
  taxes?: DatasetTaxRef[] | null;
  price_display_mode?: string | null;
  last_snapshot_id: string | null;
  tariff_plan_id: string | null;
  is_active: boolean;
  term_ids?: string[];
  updated_at?: string;
}

/** One timestamped version of a dataset held on a storage backend. */
export interface DatasetSnapshot {
  id: string;
  dataset_id: string;
  taken_at: string;
  storage_backend: string;
  location: string;
  ext: string;
  size_bytes: number;
  checksum: string | null;
  ingested_via: string;
}

/**
 * The fixed set of roles a file inside an issue bundle can carry (S124). The
 * primary data file is synthesised by the backend with role `data`; members are
 * attached as document/chart/other (and may also be additional data files).
 */
export const SNAPSHOT_FILE_ROLES = ['data', 'document', 'chart', 'other'] as const;
export type SnapshotFileRole = (typeof SNAPSHOT_FILE_ROLES)[number];

/** Stable id the backend uses for the synthesised primary data entry. */
export const PRIMARY_SNAPSHOT_FILE_ID = 'primary';

/**
 * One file inside an issue (snapshot) bundle as the admin files endpoint
 * projects it. The primary data file appears as `{ id: "primary", role: "data" }`
 * followed by the child member rows. The backend never leaks a raw `location`.
 */
export interface DatasetSnapshotFile {
  id: string;
  role: SnapshotFileRole | string;
  filename: string;
  ext: string;
  content_type: string | null;
  size_bytes: number;
  checksum: string | null;
}

/** One spreadsheet cell value as the row endpoint serialises it. */
export type SpreadsheetCell = string | number | null;

/** One server-paginated page of a snapshot's data rows. */
export interface DatasetRowsPage {
  columns: string[];
  rows: SpreadsheetCell[][];
  offset: number;
  limit: number;
  has_more: boolean;
}

export interface PaginatedDatasets {
  items: Dataset[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

/** A tariff plan reference for the "plan that grants access" picker. */
export interface TariffPlanRef {
  id: string;
  name: string;
}

/** Query parameters accepted by the list endpoint. */
export interface DatasetListParams {
  page?: number;
  per_page?: number;
  sort_by?: string;
  sort_dir?: 'asc' | 'desc';
  search?: string;
  category?: string;
}

interface DatasetStoreState {
  datasets: PaginatedDatasets | null;
  currentDataset: Dataset | null;
  categoryTerms: CmsTerm[];
  snapshots: DatasetSnapshot[];
  plans: TariffPlanRef[];
  loading: boolean;
  error: string | null;
}

function asArray<T>(res: unknown, key: string): T[] {
  if (Array.isArray(res)) return res as T[];
  const obj = res as Record<string, unknown> | null;
  const list = obj?.[key] ?? obj?.items;
  return Array.isArray(list) ? (list as T[]) : [];
}

function unwrapEntity<T>(res: unknown, key: string): T {
  const obj = res as Record<string, unknown> | null;
  return ((obj && key in obj ? obj[key] : res) as T);
}

export const useDatasetStore = defineStore('dataset-admin', {
  state: (): DatasetStoreState => ({
    datasets: null,
    currentDataset: null,
    categoryTerms: [],
    snapshots: [],
    plans: [],
    loading: false,
    error: null,
  }),

  actions: {
    // ── List ────────────────────────────────────────────────────────────────
    async fetchDatasets(params: DatasetListParams = {}): Promise<void> {
      this.loading = true;
      this.error = null;
      try {
        const res = await api.get<unknown>('/admin/datasets', {
          params: params as Record<string, unknown>,
        });
        const raw = res as Record<string, unknown> | null;
        this.datasets = {
          items: asArray<Dataset>(res, 'datasets'),
          total: (raw?.total as number) ?? 0,
          page: (raw?.page as number) ?? params.page ?? 1,
          per_page: (raw?.per_page as number) ?? params.per_page ?? 20,
          pages: (raw?.pages as number) ?? 1,
        };
      } catch (caught) {
        this.error = caught instanceof Error ? caught.message : String(caught);
      } finally {
        this.loading = false;
      }
    },

    /** Every dataset id matching the filter — the "totally all" bulk scope. */
    async fetchAllDatasetIds(params: DatasetListParams = {}): Promise<string[]> {
      const ids: string[] = [];
      let page = 1;
      for (;;) {
        const res = await api.get<unknown>('/admin/datasets', {
          params: { ...params, page, per_page: 100 },
        });
        const raw = res as Record<string, unknown> | null;
        const items = asArray<Dataset>(res, 'datasets');
        ids.push(...items.map((dataset) => dataset.id));
        const pages = (raw?.pages as number) ?? 1;
        if (!items.length || page >= pages) break;
        page += 1;
      }
      return ids;
    },

    // ── Single CRUD ───────────────────────────────────────────────────────────
    async fetchDataset(id: string): Promise<Dataset> {
      this.loading = true;
      this.error = null;
      try {
        const res = await api.get<unknown>(`/admin/datasets/${id}`);
        this.currentDataset = unwrapEntity<Dataset>(res, 'dataset');
        return this.currentDataset;
      } finally {
        this.loading = false;
      }
    },

    async saveDataset(data: Partial<Dataset>): Promise<Dataset> {
      const res = data.id
        ? await api.put<unknown>(`/admin/datasets/${data.id}`, data)
        : await api.post<unknown>('/admin/datasets', data);
      const saved = unwrapEntity<Dataset>(res, 'dataset');
      this.currentDataset = saved;
      return saved;
    },

    async deleteDataset(id: string): Promise<void> {
      await api.delete(`/admin/datasets/${id}`);
    },

    // ── Bulk ops (list bulk-bar) ──────────────────────────────────────────────
    async bulkDeleteDatasets(ids: string[]): Promise<void> {
      await Promise.all(ids.map((id) => api.delete(`/admin/datasets/${id}`)));
    },

    async bulkSetActive(ids: string[], isActive: boolean): Promise<void> {
      await Promise.all(
        ids.map((id) => api.put(`/admin/datasets/${id}`, { is_active: isActive })),
      );
    },

    async bulkAssignTerm(ids: string[], termId: string): Promise<void> {
      await api.post('/admin/datasets/bulk-assign-category', { ids, term_id: termId });
    },

    // ── Taxonomy (shared dataset_category term type) ──────────────────────────
    async fetchCategoryTerms(): Promise<void> {
      const res = await api.get<unknown>('/admin/cms/terms', {
        params: { type: DATASET_CATEGORY_TERM_TYPE },
      });
      this.categoryTerms = asArray<CmsTerm>(res, 'terms');
    },

    async assignCategory(datasetId: string, termId: string): Promise<void> {
      await api.post(`/admin/datasets/${datasetId}/categories`, { term_id: termId });
    },

    async unassignCategory(datasetId: string, termId: string): Promise<void> {
      await api.delete(`/admin/datasets/${datasetId}/categories/${termId}`);
    },

    // ── Snapshots (versioned archive) ─────────────────────────────────────────
    async fetchSnapshots(datasetId: string): Promise<DatasetSnapshot[]> {
      const res = await api.get<unknown>(`/admin/datasets/${datasetId}/snapshots`);
      this.snapshots = asArray<DatasetSnapshot>(res, 'snapshots');
      return this.snapshots;
    },

    /**
     * One server-paginated page of a snapshot's data (NOT entitlement-gated).
     * The endpoint streams only the requested window plus a peek line, so a
     * tremendous file is never fully loaded; `has_more` (not a full count) is the
     * pagination signal. The view drives Prev/Next by adjusting `offset`.
     */
    async fetchRows(
      datasetId: string,
      snapshotId: string,
      offset: number,
      limit: number,
    ): Promise<DatasetRowsPage> {
      const res = await api.get<unknown>(
        `/admin/datasets/${datasetId}/snapshots/${snapshotId}/rows`,
        { params: { offset, limit } },
      );
      const obj = res as Record<string, unknown> | null;
      return {
        columns: Array.isArray(obj?.columns) ? (obj?.columns as string[]) : [],
        rows: Array.isArray(obj?.rows) ? (obj?.rows as SpreadsheetCell[][]) : [],
        offset: typeof obj?.offset === 'number' ? (obj?.offset as number) : offset,
        limit: typeof obj?.limit === 'number' ? (obj?.limit as number) : limit,
        has_more: obj?.has_more === true,
      };
    },

    /**
     * Load EVERY row of a snapshot by paging the rows endpoint until
     * ``has_more`` is false. Only used for small snapshots (size-gated by the
     * caller) so the whole dataset can be sorted/filtered/edited safely — Save
     * then cannot drop rows that were never loaded.
     */
    async fetchAllRows(
      datasetId: string,
      snapshotId: string,
      pageSize = 500,
    ): Promise<{ columns: string[]; rows: SpreadsheetCell[][] }> {
      const rows: SpreadsheetCell[][] = [];
      let columns: string[] = [];
      let offset = 0;
      for (;;) {
        const page = await this.fetchRows(datasetId, snapshotId, offset, pageSize);
        if (!columns.length) columns = page.columns;
        rows.push(...page.rows);
        if (!page.has_more || page.rows.length === 0) break;
        offset += pageSize;
      }
      return { columns, rows };
    },

    async uploadSnapshot(
      datasetId: string,
      formData: FormData,
    ): Promise<DatasetSnapshot | null> {
      const res = await api.post<unknown>(
        `/admin/datasets/${datasetId}/snapshots`,
        formData,
      );
      const obj = res as Record<string, unknown> | null;
      return obj && typeof obj.id === 'string' ? (obj as unknown as DatasetSnapshot) : null;
    },

    async setLastSnapshot(datasetId: string, snapshotId: string): Promise<void> {
      await api.post(`/admin/datasets/${datasetId}/snapshots/${snapshotId}/set-last`);
    },

    async deleteSnapshot(datasetId: string, snapshotId: string): Promise<void> {
      await api.delete(`/admin/datasets/${datasetId}/snapshots/${snapshotId}`);
    },

    async downloadSnapshot(datasetId: string, snapshotId: string): Promise<Blob> {
      return api.get<Blob>(
        `/admin/datasets/${datasetId}/snapshots/${snapshotId}/download`,
        { responseType: 'blob' },
      );
    },

    // ── Issue files (multi-file bundle per snapshot, S124) ────────────────────
    /** The uniform file list for one issue: primary data entry first, then members. */
    async fetchSnapshotFiles(
      datasetId: string,
      snapshotId: string,
    ): Promise<DatasetSnapshotFile[]> {
      const res = await api.get<unknown>(
        `/admin/datasets/${datasetId}/snapshots/${snapshotId}/files`,
      );
      return asArray<DatasetSnapshotFile>(res, 'files');
    },

    /**
     * Attach an extra file to an issue via a multipart POST (mirrors the snapshot
     * upload). A bad role / oversize / disallowed extension surfaces as a 400 that
     * the caller is expected to catch and display.
     */
    async addSnapshotFile(
      datasetId: string,
      snapshotId: string,
      file: File,
      role: string,
      filename?: string,
    ): Promise<DatasetSnapshotFile> {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('role', role);
      if (filename) formData.append('filename', filename);
      const res = await api.post<unknown>(
        `/admin/datasets/${datasetId}/snapshots/${snapshotId}/files`,
        formData,
      );
      return res as DatasetSnapshotFile;
    },

    /** Remove a member file from an issue (the primary entry is not deletable). */
    async deleteSnapshotFile(
      datasetId: string,
      snapshotId: string,
      fileId: string,
    ): Promise<void> {
      await api.delete(
        `/admin/datasets/${datasetId}/snapshots/${snapshotId}/files/${fileId}`,
      );
    },

    // ── Plans (which tariff plan grants access) ───────────────────────────────
    async fetchPlans(): Promise<void> {
      // The real subscription route is declared with a trailing slash
      // (GET /api/v1/admin/tarif-plans/); calling it without one 308-redirects.
      const res = await api.get<unknown>('/admin/tarif-plans/', {
        params: { include_archived: false },
      });
      this.plans = asArray<TariffPlanRef>(res, 'plans');
    },
  },
});
