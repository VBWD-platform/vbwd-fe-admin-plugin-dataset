import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import { api } from '@/api';
import DatasetSnapshotView from '../../src/views/DatasetSnapshotView.vue';
import hostEn from '@/i18n/locales/en.json';
import datasetEn from '../../locales/en.json';

vi.mock('@/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en: { ...hostEn, ...datasetEn } },
});

const DATASET = { id: 'ds-1', slug: 'air-eu', title: 'EU Air Quality', last_snapshot_id: 'snap-1' };
const SMALL_SNAP = { id: 'snap-1', dataset_id: 'ds-1', taken_at: '2026-05-01-10-00', storage_backend: 'local', location: 'x', ext: 'csv', size_bytes: 200, checksum: null, ingested_via: 'upload' };
const LARGE_SNAP = { ...SMALL_SNAP, size_bytes: 5 * 1024 * 1024 };

const SMALL_ROWS: (string | number | null)[][] = [
  ['Berlin', '20.299999999999997'],
  ['Paris', '5'],
  ['Rome', '12'],
];

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/datasets/:id', name: 'dataset-edit', component: { template: '<div />' } },
      { path: '/admin/datasets/:datasetId/snapshots/:snapshotId', name: 'dataset-snapshot-view', component: DatasetSnapshotView },
    ],
  });
}

function primeSmall() {
  (api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string) => {
    if (url === '/admin/datasets/ds-1') return Promise.resolve(DATASET);
    if (url === '/admin/datasets/ds-1/snapshots') return Promise.resolve([SMALL_SNAP]);
    if (url === '/admin/datasets/ds-1/snapshots/snap-1/rows') {
      return Promise.resolve({ columns: ['city', 'aqi'], rows: SMALL_ROWS, offset: 0, limit: 500, has_more: false });
    }
    return Promise.resolve({});
  });
}

function primeLargePaged() {
  (api.get as ReturnType<typeof vi.fn>).mockImplementation((url: string, opts?: { params?: Record<string, unknown> }) => {
    if (url === '/admin/datasets/ds-1') return Promise.resolve(DATASET);
    if (url === '/admin/datasets/ds-1/snapshots') return Promise.resolve([LARGE_SNAP]);
    if (url === '/admin/datasets/ds-1/snapshots/snap-1/rows') {
      const offset = Number(opts?.params?.offset ?? 0);
      if (offset === 0) return Promise.resolve({ columns: ['city', 'aqi'], rows: [['Berlin', '20.3'], ['Paris', '5']], offset: 0, limit: 100, has_more: true });
      return Promise.resolve({ columns: ['city', 'aqi'], rows: [['Rome', '12']], offset: 100, limit: 100, has_more: false });
    }
    return Promise.resolve({});
  });
}

async function mountSmall(): Promise<VueWrapper> {
  primeSmall();
  const router = makeRouter();
  router.push({ name: 'dataset-snapshot-view', params: { datasetId: 'ds-1', snapshotId: 'snap-1' } });
  await router.isReady();
  const wrapper = mount(DatasetSnapshotView, { global: { plugins: [i18n, router] } });
  await flushPromises();
  return wrapper;
}

async function mountLarge(): Promise<VueWrapper> {
  primeLargePaged();
  const router = makeRouter();
  router.push({ name: 'dataset-snapshot-view', params: { datasetId: 'ds-1', snapshotId: 'snap-1' } });
  await router.isReady();
  const wrapper = mount(DatasetSnapshotView, { global: { plugins: [i18n, router] } });
  await flushPromises();
  return wrapper;
}

function rowInputValues(wrapper: VueWrapper): string[][] {
  return wrapper.findAll('[data-testid="spreadsheet-row"]').map((row) =>
    row.findAll('[data-testid="spreadsheet-cell-input"]').map((input) => (input.element as HTMLInputElement).value),
  );
}

function rowTexts(wrapper: VueWrapper): string[] {
  return wrapper.findAll('[data-testid="spreadsheet-row"]').map((row) => row.text());
}

describe('DatasetSnapshotView.vue — interactive editable table (small snapshot)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('loads ALL rows and renders editable inputs when the snapshot is small', async () => {
    const wrapper = await mountSmall();
    expect(wrapper.find('[data-testid="save-snapshot"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid="spreadsheet-row"]')).toHaveLength(3);
    expect(wrapper.findAll('[data-testid="spreadsheet-cell-input"]').length).toBeGreaterThan(0);
    expect(wrapper.find('[data-testid="readonly-note"]').exists()).toBe(false);
  });

  it('rounds numeric display to the decimals control without changing the value', async () => {
    const wrapper = await mountSmall();
    const berlinAqi = () => rowInputValues(wrapper)[0][1];
    expect(berlinAqi()).toBe('20.300');
    await wrapper.find('[data-testid="decimals-control"]').setValue(1);
    await flushPromises();
    expect(berlinAqi()).toBe('20.3');
    // Display only — no edit recorded, Save stays disabled.
    expect(wrapper.find('[data-testid="save-snapshot"]').attributes('disabled')).toBeDefined();
  });

  it('sorts rows when a column header is clicked (asc then desc)', async () => {
    const wrapper = await mountSmall();
    const aqiHeader = wrapper.findAll('[data-testid="spreadsheet-col"]')[1];
    await aqiHeader.trigger('click'); // asc by aqi: 5, 12, 20.3
    await flushPromises();
    expect(rowInputValues(wrapper).map((cells) => cells[0])).toEqual(['Paris', 'Rome', 'Berlin']);
    await aqiHeader.trigger('click'); // desc
    await flushPromises();
    expect(rowInputValues(wrapper).map((cells) => cells[0])).toEqual(['Berlin', 'Rome', 'Paris']);
  });

  it('filters rows and updates the statistics footer', async () => {
    const wrapper = await mountSmall();
    const cityFilter = wrapper.findAll('[data-testid="spreadsheet-filter"]')[0];
    await cityFilter.setValue('ar'); // matches only "Paris"
    await flushPromises();
    expect(wrapper.findAll('[data-testid="spreadsheet-row"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="filtered-count"]').text()).toContain('1');
    // mean of the single remaining aqi (5) shows in the footer under the aqi column.
    const statCells = wrapper.findAll('[data-testid="spreadsheet-stat-cell"]');
    expect(statCells[1].text()).toBe('5');
  });

  it('marks dirty + enables Save when a cell is edited', async () => {
    const wrapper = await mountSmall();
    expect(wrapper.find('[data-testid="save-snapshot"]').attributes('disabled')).toBeDefined();
    const firstAqi = wrapper.findAll('[data-testid="spreadsheet-row"]')[0].findAll('[data-testid="spreadsheet-cell-input"]')[1];
    await firstAqi.setValue('99');
    await firstAqi.trigger('change');
    await flushPromises();
    expect(wrapper.find('[data-testid="save-snapshot"]').attributes('disabled')).toBeUndefined();
  });

  it('Reset reverts the edit and disables Save again', async () => {
    const wrapper = await mountSmall();
    const firstAqi = () => wrapper.findAll('[data-testid="spreadsheet-row"]')[0].findAll('[data-testid="spreadsheet-cell-input"]')[1];
    await firstAqi().setValue('99');
    await firstAqi().trigger('change');
    await flushPromises();
    await wrapper.find('[data-testid="reset-edits"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="save-snapshot"]').attributes('disabled')).toBeDefined();
    expect((firstAqi().element as HTMLInputElement).value).toBe('20.300');
  });

  it('Save uploads a NEW snapshot as CSV containing the edited value', async () => {
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const wrapper = await mountSmall();
    const firstAqi = wrapper.findAll('[data-testid="spreadsheet-row"]')[0].findAll('[data-testid="spreadsheet-cell-input"]')[1];
    await firstAqi.setValue('99');
    await firstAqi.trigger('change');
    await flushPromises();

    await wrapper.find('[data-testid="save-snapshot"]').trigger('click');
    await flushPromises();

    const call = (api.post as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[0] === '/admin/datasets/ds-1/snapshots');
    expect(call).toBeTruthy();
    const formData = call?.[1] as FormData;
    expect(formData).toBeInstanceOf(FormData);
    const file = formData.get('file') as File;
    const text = await file.text();
    expect(text).toContain('city,aqi');
    expect(text).toContain('Berlin,99');
  });
});

describe('DatasetSnapshotView.vue — oversized read-only mode', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('is read-only: no editable inputs, Save hidden, note shown', async () => {
    const wrapper = await mountLarge();
    expect(wrapper.findAll('[data-testid="spreadsheet-cell-input"]')).toHaveLength(0);
    expect(wrapper.find('[data-testid="save-snapshot"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="readonly-note"]').exists()).toBe(true);
  });

  it('still sorts and filters the current page', async () => {
    const wrapper = await mountLarge();
    // Sort aqi ascending → Paris (5) before Berlin (20.3).
    await wrapper.findAll('[data-testid="spreadsheet-col"]')[1].trigger('click');
    await flushPromises();
    expect(rowTexts(wrapper)[0]).toContain('Paris');
    // Filter city by "ber" → only Berlin remains.
    await wrapper.findAll('[data-testid="spreadsheet-filter"]')[0].setValue('ber');
    await flushPromises();
    const rows = wrapper.findAll('[data-testid="spreadsheet-row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0].text()).toContain('Berlin');
  });

  it('paginates: Next advances offset and disables at the last page', async () => {
    const wrapper = await mountLarge();
    expect(wrapper.find('[data-testid="snapshot-page-prev"]').attributes('disabled')).toBeDefined();
    expect(wrapper.find('[data-testid="snapshot-page-next"]').attributes('disabled')).toBeUndefined();
    await wrapper.find('[data-testid="snapshot-page-next"]').trigger('click');
    await flushPromises();
    const offsets = (api.get as ReturnType<typeof vi.fn>).mock.calls
      .filter((c) => c[0] === '/admin/datasets/ds-1/snapshots/snap-1/rows')
      .map((c) => (c[1] as { params: Record<string, unknown> }).params.offset);
    expect(offsets).toContain(100);
    expect(wrapper.find('[data-testid="snapshot-page-next"]').attributes('disabled')).toBeDefined();
  });
});
