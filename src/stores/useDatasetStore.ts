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

    async uploadSnapshot(datasetId: string, formData: FormData): Promise<void> {
      await api.post(`/admin/datasets/${datasetId}/snapshots`, formData);
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
