import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import { api } from '@/api';
import { configureAuthStore, useAuthStore } from '@/stores/auth';
import DatasetForm from '../../src/views/DatasetForm.vue';
import SearchableTermSelect from '../../../cms-admin/src/components/SearchableTermSelect.vue';
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

const PLANS = { plans: [
  { id: 'plan-1', name: 'Air Monthly' },
  { id: 'plan-2', name: 'Traffic Monthly' },
] };

// The real serializer returns the stored price under `price` (not `raw_price`)
// and `taxes` as the assigned core-tax list (not a single number).
const DATASET = {
  id: 'ds-1',
  slug: 'air-quality-eu',
  title: 'EU Air Quality',
  description: 'Hourly readings',
  source_attribution: 'EEA',
  price: 49,
  taxes: [{ id: 't1', code: 'VAT_DE', name: 'German VAT', rate: '19' }],
  tariff_plan_id: 'plan-1',
  is_active: true,
  last_snapshot_id: 'snap-1',
  term_ids: ['cat-1'],
};

function primeApi() {
  (api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string, opts?: { params?: Record<string, unknown> }) => {
    if (url === '/admin/datasets/ds-1') return Promise.resolve(DATASET);
    if (url === '/admin/tarif-plans/') return Promise.resolve(PLANS);
    if (url === '/admin/cms/terms') {
      if (opts?.params?.type === 'dataset_category') return Promise.resolve(CATEGORIES);
      return Promise.resolve([]);
    }
    return Promise.resolve({});
  });
}

const ArchiveStub = { name: 'DatasetSnapshotArchive', template: '<div data-testid="archive-stub" />', props: ['datasetId', 'lastSnapshotId'] };
const TagPickerStub = { name: 'TagPicker', template: '<div data-testid="tag-picker-stub" />', props: ['entityType', 'entityId'] };
const CustomFieldsStub = { name: 'CustomFieldsEditor', template: '<div data-testid="custom-fields-stub" />', props: ['entityType', 'entityId'] };

async function mountForm(): Promise<{ wrapper: VueWrapper; router: Router }> {
  primeApi();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/datasets/list', name: 'dataset-list', component: { template: '<div />' } },
      { path: '/admin/datasets/new', name: 'dataset-new', component: { template: '<div />' } },
      { path: '/admin/datasets/:id', name: 'dataset-edit', component: { template: '<div />' } },
    ],
  });
  router.push({ name: 'dataset-edit', params: { id: 'ds-1' } });
  await router.isReady();
  const wrapper = mount(DatasetForm, {
    global: {
      plugins: [i18n, router],
      stubs: {
        DatasetSnapshotArchive: ArchiveStub,
        TagPicker: TagPickerStub,
        CustomFieldsEditor: CustomFieldsStub,
      },
    },
  });
  await flushPromises();
  return { wrapper, router };
}

describe('DatasetForm.vue — editor', () => {
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

  it('loads the dataset and seeds the Details fields', async () => {
    const { wrapper } = await mountForm();
    const title = wrapper.find('[data-testid="dataset-title"]').element as HTMLInputElement;
    expect(title.value).toBe('EU Air Quality');
    const price = wrapper.find('[data-testid="dataset-price"]').element as HTMLInputElement;
    expect(price.value).toBe('49');
  });

  it('renders the plan/tariff link select seeded to the dataset plan', async () => {
    const { wrapper } = await mountForm();
    const select = wrapper.find('[data-testid="dataset-plan"]');
    const values = select.findAll('option').map((option) => option.attributes('value'));
    expect(values).toContain('plan-1');
    expect(values).toContain('plan-2');
    expect((select.element as HTMLSelectElement).value).toBe('plan-1');
  });

  it('shows the Details pane first and reveals the Dataset (archive) pane on tab switch', async () => {
    const { wrapper } = await mountForm();
    const hidden = (testId: string) =>
      (wrapper.find(`[data-testid="${testId}"]`).element as HTMLElement).style.display === 'none';
    expect(hidden('dataset-details-pane')).toBe(false);
    expect(hidden('dataset-archive-pane')).toBe(true);
    await wrapper.find('[data-testid="dataset-tab-archive"]').trigger('click');
    expect(hidden('dataset-archive-pane')).toBe(false);
    expect(wrapper.find('[data-testid="archive-stub"]').exists()).toBe(true);
  });

  it('renders the core TagPicker and CustomFieldsEditor for entity_type "dataset"', async () => {
    const { wrapper } = await mountForm();
    const tagPicker = wrapper.findComponent(TagPickerStub);
    const customFields = wrapper.findComponent(CustomFieldsStub);
    expect(tagPicker.props('entityType')).toBe('dataset');
    expect(tagPicker.props('entityId')).toBe('ds-1');
    expect(customFields.props('entityType')).toBe('dataset');
    expect(customFields.props('entityId')).toBe('ds-1');
  });

  it('assigns a chosen category through the dataset categories endpoint', async () => {
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const { wrapper } = await mountForm();
    wrapper.findComponent(SearchableTermSelect).vm.$emit('select', CATEGORIES[1]);
    await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/admin/datasets/ds-1/categories', { term_id: 'cat-2' });
  });

  // BUG 3 regression — the price input must seed from the API's `price` field,
  // not the (unserialized) `raw_price`. Before the fix a €19 dataset showed 0.
  it('seeds the price input from the API `price` field (not raw_price)', async () => {
    (api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string, opts?: { params?: Record<string, unknown> }) => {
      if (url === '/admin/datasets/ds-1') return Promise.resolve({ ...DATASET, price: 19 });
      if (url === '/admin/tarif-plans/') return Promise.resolve(PLANS);
      if (url === '/admin/cms/terms') {
        if (opts?.params?.type === 'dataset_category') return Promise.resolve(CATEGORIES);
        return Promise.resolve([]);
      }
      return Promise.resolve({});
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/admin/datasets/list', name: 'dataset-list', component: { template: '<div />' } },
        { path: '/admin/datasets/:id', name: 'dataset-edit', component: { template: '<div />' } },
      ],
    });
    router.push({ name: 'dataset-edit', params: { id: 'ds-1' } });
    await router.isReady();
    const wrapper = mount(DatasetForm, {
      global: {
        plugins: [i18n, router],
        stubs: { DatasetSnapshotArchive: ArchiveStub, TagPicker: TagPickerStub, CustomFieldsEditor: CustomFieldsStub },
      },
    });
    await flushPromises();
    const price = wrapper.find('[data-testid="dataset-price"]').element as HTMLInputElement;
    expect(price.value).toBe('19');
    // And save sends it under the field the backend persists.
    (api.put as ReturnType<typeof vi.fn>).mockResolvedValue({ ...DATASET, price: 19 });
    await wrapper.find('[data-testid="dataset-save"]').trigger('click');
    await flushPromises();
    const call = (api.put as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[0] === '/admin/datasets/ds-1');
    expect((call?.[1] as Record<string, unknown>).price).toBe(19);
  });

  // BUG 1 regression — the Dataset (file-archive) tab must render the real
  // DatasetSnapshotArchive (its upload input / snapshot table), not an empty
  // unknown element. Mount WITHOUT stubbing the archive component.
  it('renders the DatasetSnapshotArchive on the Dataset tab (imported + registered)', async () => {
    primeApi();
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/admin/datasets/list', name: 'dataset-list', component: { template: '<div />' } },
        { path: '/admin/datasets/:id', name: 'dataset-edit', component: { template: '<div />' } },
      ],
    });
    router.push({ name: 'dataset-edit', params: { id: 'ds-1' } });
    await router.isReady();
    const wrapper = mount(DatasetForm, {
      global: {
        plugins: [i18n, router],
        // Only the tag/custom-field editors are stubbed; the archive is real.
        stubs: { TagPicker: TagPickerStub, CustomFieldsEditor: CustomFieldsStub },
      },
    });
    await flushPromises();
    await wrapper.find('[data-testid="dataset-tab-archive"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="snapshot-archive"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="snapshot-upload-input"]').exists()).toBe(true);
  });

  it('saves the dataset with the plan link and active flag', async () => {
    (api.put as ReturnType<typeof vi.fn>).mockResolvedValue(DATASET);
    const { wrapper } = await mountForm();
    await wrapper.find('[data-testid="dataset-title"]').setValue('EU Air Quality v2');
    await wrapper.find('[data-testid="dataset-save"]').trigger('click');
    await flushPromises();
    const call = (api.put as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[0] === '/admin/datasets/ds-1');
    expect(call).toBeTruthy();
    const payload = call?.[1] as Record<string, unknown>;
    expect(payload.title).toBe('EU Air Quality v2');
    expect(payload.tariff_plan_id).toBe('plan-1');
    expect(payload.is_active).toBe(true);
  });
});
