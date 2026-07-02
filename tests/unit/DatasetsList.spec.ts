import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import { api } from '@/api';
import { configureAuthStore, useAuthStore } from '@/stores/auth';
import DatasetsList from '../../src/views/DatasetsList.vue';
import hostEn from '@/i18n/locales/en.json';
import datasetEn from '../../locales/en.json';

vi.mock('@/api', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en: { ...hostEn, ...datasetEn } },
});

const CATEGORIES = [
  { id: 'cat-1', term_type: 'dataset_category', slug: 'air-quality', name: 'Air Quality', parent_id: null, seo_excluded: false, sort_order: 0 },
  { id: 'cat-2', term_type: 'dataset_category', slug: 'traffic', name: 'Traffic', parent_id: null, seo_excluded: false, sort_order: 0 },
];

const DATASETS = {
  items: [
    { id: 'ds-1', slug: 'air-quality-eu', title: 'EU Air Quality', price: 49, is_active: true, updated_at: '2026-06-01T00:00:00Z', term_ids: ['cat-1'], last_snapshot_id: 'snap-1' },
    { id: 'ds-2', slug: 'traffic-de', title: 'DE Traffic', price: 19, is_active: false, updated_at: '2026-06-02T00:00:00Z', term_ids: ['cat-2'], last_snapshot_id: null },
  ],
  total: 2,
  page: 1,
  per_page: 20,
  pages: 1,
};

function primeApi() {
  (api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string, opts?: { params?: Record<string, unknown> }) => {
    if (url === '/admin/datasets') return Promise.resolve(DATASETS);
    if (url === '/admin/cms/terms') {
      if (opts?.params?.type === 'dataset_category') return Promise.resolve(CATEGORIES);
      return Promise.resolve([]);
    }
    return Promise.resolve({});
  });
}

async function mountList(): Promise<{ wrapper: VueWrapper; router: Router }> {
  primeApi();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/datasets/list', name: 'dataset-list', component: { template: '<div />' } },
      { path: '/admin/datasets/new', name: 'dataset-new', component: { template: '<div />' } },
      { path: '/admin/datasets/:id', name: 'dataset-edit', component: { template: '<div />' } },
    ],
  });
  router.push({ name: 'dataset-list' });
  await router.isReady();
  const wrapper = mount(DatasetsList, {
    global: { plugins: [i18n, router] },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('DatasetsList.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    configureAuthStore({
      storageKey: 'test_token',
      apiClient: { post: async () => ({}), get: async () => ({}), setToken: () => {}, clearToken: () => {} } as never,
    });
    useAuthStore().$patch({
      user: { id: '1', email: 'admin@test.com', role: 'SUPER_ADMIN', permissions: ['*'] },
      token: 'test-token',
    });
    vi.clearAllMocks();
  });

  it('fetches the dataset list on mount', async () => {
    await mountList();
    const call = (api.get as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[0] === '/admin/datasets');
    expect(call).toBeTruthy();
  });

  it('renders one row per dataset with its category name and price', async () => {
    const { wrapper } = await mountList();
    expect(wrapper.findAll('[data-testid="dataset-row"]')).toHaveLength(2);
    expect(wrapper.text()).toContain('EU Air Quality');
    expect(wrapper.text()).toContain('Air Quality');
    expect(wrapper.text()).toContain('49');
  });

  it('renders the by-category filter with the fetched dataset_category terms', async () => {
    const { wrapper } = await mountList();
    const select = wrapper.find('[data-testid="filter-category"]');
    expect(select.exists()).toBe(true);
    const values = select.findAll('option').map((option) => option.attributes('value'));
    expect(values).toContain('cat-1');
    expect(values).toContain('cat-2');
  });

  it('reloads with the category filter when a category is chosen', async () => {
    const { wrapper } = await mountList();
    (api.get as ReturnType<typeof vi.fn>).mockClear();
    await wrapper.find('[data-testid="filter-category"]').setValue('cat-1');
    await flushPromises();
    const call = (api.get as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === '/admin/datasets' && (c[1] as { params?: Record<string, unknown> })?.params?.category === 'cat-1',
    );
    expect(call).toBeTruthy();
  });

  it('quicksearches with a debounce, reloading with the search term', async () => {
    const { wrapper } = await mountList();
    (api.get as ReturnType<typeof vi.fn>).mockClear();
    await wrapper.find('[data-testid="dataset-search"]').setValue('air');
    await new Promise((resolve) => setTimeout(resolve, 350));
    await flushPromises();
    const call = (api.get as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === '/admin/datasets' && (c[1] as { params?: Record<string, unknown> })?.params?.search === 'air',
    );
    expect(call).toBeTruthy();
  });

  it('sorts by a clicked column, re-fetching with sort params', async () => {
    const { wrapper } = await mountList();
    expect(wrapper.find('[data-testid="sort-title"]').exists()).toBe(true);
    await wrapper.find('[data-testid="sort-title"]').trigger('click');
    await flushPromises();
    const call = (api.get as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => c[0] === '/admin/datasets' && (c[1] as { params?: Record<string, unknown> })?.params?.sort_by === 'title',
    );
    expect(call).toBeTruthy();
  });

  it('shows the bulk bar only after a row is selected', async () => {
    const { wrapper } = await mountList();
    expect(wrapper.find('[data-testid="bulk-bar"]').exists()).toBe(false);
    await wrapper.find('[data-testid="row-select-ds-1"]').setValue(true);
    await flushPromises();
    expect(wrapper.find('[data-testid="bulk-bar"]').exists()).toBe(true);
  });

  it('bulk-deletes the selected datasets one by one', async () => {
    (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const { wrapper } = await mountList();
    await wrapper.find('[data-testid="row-select-ds-1"]').setValue(true);
    await flushPromises();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await wrapper.find('[data-testid="bulk-delete"]').trigger('click');
    await flushPromises();
    expect(api.delete).toHaveBeenCalledWith('/admin/datasets/ds-1');
  });

  it('bulk-assigns a dataset_category via the bulk endpoint', async () => {
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const { wrapper } = await mountList();
    await wrapper.find('[data-testid="row-select-ds-1"]').setValue(true);
    await flushPromises();
    await wrapper.find('[data-testid="bulk-assign-category"]').setValue('cat-2');
    await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/admin/datasets/bulk-assign-category', {
      ids: ['ds-1'],
      term_id: 'cat-2',
    });
  });

  it('bulk-activates the selected datasets', async () => {
    (api.put as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const { wrapper } = await mountList();
    await wrapper.find('[data-testid="row-select-ds-1"]').setValue(true);
    await flushPromises();
    await wrapper.find('[data-testid="bulk-activate"]').trigger('click');
    await flushPromises();
    expect(api.put).toHaveBeenCalledWith('/admin/datasets/ds-1', { is_active: true });
  });

  it('navigates to the editor on a full-row click', async () => {
    const { wrapper, router } = await mountList();
    const push = vi.spyOn(router, 'push');
    await wrapper.find('[data-testid="dataset-row"]').trigger('click');
    expect(push).toHaveBeenCalledWith({ name: 'dataset-edit', params: { id: 'ds-1' } });
  });
});
