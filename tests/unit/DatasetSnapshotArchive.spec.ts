import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { api } from '@/api';
import DatasetSnapshotArchive from '../../src/components/DatasetSnapshotArchive.vue';
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

const SNAPSHOTS = [
  { id: 'snap-2', dataset_id: 'ds-1', taken_at: '2026-05-01-10-00', storage_backend: 'local', location: 'air/eu/2026-05.csv', ext: 'csv', size_bytes: 2048, checksum: 'abc', ingested_via: 'upload' },
  { id: 'snap-1', dataset_id: 'ds-1', taken_at: '2026-04-01-10-00', storage_backend: 'aws', location: 'air/eu/2026-04.csv', ext: 'csv', size_bytes: 1024, checksum: 'def', ingested_via: 'webhook' },
];

function primeApi() {
  (api.get as ReturnType<typeof vi.fn>).mockResolvedValue(SNAPSHOTS);
}

async function mountArchive(lastSnapshotId = 'snap-2'): Promise<VueWrapper> {
  primeApi();
  const wrapper = mount(DatasetSnapshotArchive, {
    props: { datasetId: 'ds-1', lastSnapshotId },
    global: { plugins: [i18n] },
  });
  await flushPromises();
  return wrapper;
}

describe('DatasetSnapshotArchive.vue — file-archive block', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('lists a row per snapshot with its backend and size', async () => {
    const wrapper = await mountArchive();
    expect(api.get).toHaveBeenCalledWith('/admin/datasets/ds-1/snapshots');
    expect(wrapper.findAll('[data-testid="snapshot-row"]')).toHaveLength(2);
    expect(wrapper.text()).toContain('local');
    expect(wrapper.text()).toContain('aws');
  });

  it('marks the last snapshot with a badge on the right row', async () => {
    const wrapper = await mountArchive('snap-2');
    const badge = wrapper.find('[data-testid="snapshot-last-badge-snap-2"]');
    expect(badge.exists()).toBe(true);
    expect(wrapper.find('[data-testid="snapshot-last-badge-snap-1"]').exists()).toBe(false);
  });

  it('uploads a new snapshot as multipart form data', async () => {
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'snap-3' });
    const wrapper = await mountArchive();
    const file = new File(['col\n1'], 'may.csv', { type: 'text/csv' });
    await (wrapper.vm as unknown as { uploadSnapshotFile: (file: File) => Promise<void> }).uploadSnapshotFile(file);
    await flushPromises();
    const call = (api.post as ReturnType<typeof vi.fn>).mock.calls.find((c) => c[0] === '/admin/datasets/ds-1/snapshots');
    expect(call).toBeTruthy();
    expect(call?.[1]).toBeInstanceOf(FormData);
  });

  it('sets a snapshot as last through the set-last action', async () => {
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const wrapper = await mountArchive('snap-2');
    await wrapper.find('[data-testid="snapshot-set-last-snap-1"]').trigger('click');
    await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/admin/datasets/ds-1/snapshots/snap-1/set-last');
  });

  it('deletes a snapshot through the snapshots endpoint', async () => {
    (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const wrapper = await mountArchive();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await wrapper.find('[data-testid="snapshot-delete-snap-1"]').trigger('click');
    await flushPromises();
    expect(api.delete).toHaveBeenCalledWith('/admin/datasets/ds-1/snapshots/snap-1');
  });

  it('downloads a snapshot as a blob (responseType) and names the file with its extension', async () => {
    // Regression: the store must request the archive as a blob, and the
    // component must hand a real Blob to URL.createObjectURL. When the blob
    // request was dropped, axios parsed the CSV as JSON and createObjectURL
    // threw "Overload resolution failed" on the non-Blob value.
    const wrapper = await mountArchive();
    const csv = new Blob(['a,b\n1,2\n'], { type: 'text/csv' });
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(csv);

    const createObjectURL = vi.fn().mockReturnValue('blob:mock');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const clicks: string[] = [];
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function (this: HTMLAnchorElement) {
        clicks.push(this.getAttribute('download') ?? '');
      });

    await wrapper.find('[data-testid="snapshot-download-snap-2"]').trigger('click');
    await flushPromises();

    expect(api.get).toHaveBeenCalledWith(
      '/admin/datasets/ds-1/snapshots/snap-2/download',
      { responseType: 'blob' },
    );
    expect(createObjectURL).toHaveBeenCalledWith(csv);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock');
    expect(clicks).toEqual(['snap-2.csv']);

    clickSpy.mockRestore();
    vi.unstubAllGlobals();
  });
});
