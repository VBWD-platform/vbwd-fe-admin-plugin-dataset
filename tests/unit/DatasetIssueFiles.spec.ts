import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createI18n } from 'vue-i18n';
import { api } from '@/api';
import DatasetIssueFiles from '../../src/components/DatasetIssueFiles.vue';
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

const FILES = [
  { id: 'primary', role: 'data', filename: 'air.csv', ext: 'csv', content_type: 'text/csv', size_bytes: 2048, checksum: null },
  { id: 'f-1', role: 'document', filename: 'report.pdf', ext: 'pdf', content_type: 'application/pdf', size_bytes: 4096, checksum: 'abc' },
];

function primeFiles(files = FILES): void {
  (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ files, total: files.length });
}

function setInputFile(wrapper: VueWrapper, file: File): void {
  const input = wrapper.find('[data-testid="issue-file-input"]').element as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
}

async function mountPanel(): Promise<VueWrapper> {
  primeFiles();
  const wrapper = mount(DatasetIssueFiles, {
    props: { datasetId: 'ds-1', snapshotId: 'snap-1' },
    global: { plugins: [i18n] },
  });
  await flushPromises();
  return wrapper;
}

describe('DatasetIssueFiles.vue — issue file bundle panel', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('lists a row per file with role badge, filename, size and content-type', async () => {
    const wrapper = await mountPanel();
    expect(api.get).toHaveBeenCalledWith('/admin/datasets/ds-1/snapshots/snap-1/files');
    expect(wrapper.findAll('[data-testid="issue-file-row"]')).toHaveLength(2);
    expect(wrapper.text()).toContain('report.pdf');
    expect(wrapper.text()).toContain('application/pdf');
  });

  it('offers no delete control for the primary data file, only for members', async () => {
    const wrapper = await mountPanel();
    expect(wrapper.find('[data-testid="issue-file-delete-primary"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="issue-file-delete-f-1"]').exists()).toBe(true);
  });

  it('renders the fixed set of roles in the select', async () => {
    const wrapper = await mountPanel();
    const options = wrapper
      .findAll('[data-testid="issue-file-role-select"] option')
      .map((option) => (option.element as HTMLOptionElement).value);
    expect(options).toEqual(['data', 'document', 'chart', 'other']);
  });

  it('attaches a file: POSTs file + chosen role via the store then reloads the list', async () => {
    const wrapper = await mountPanel();
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'f-2' });

    await wrapper.find('[data-testid="issue-file-role-select"]').setValue('chart');
    const file = new File(['x'], 'plot.png', { type: 'image/png' });
    setInputFile(wrapper, file);
    await wrapper.find('[data-testid="issue-file-input"]').trigger('change');
    await wrapper.find('[data-testid="issue-file-attach"]').trigger('submit');
    await flushPromises();

    const call = (api.post as ReturnType<typeof vi.fn>).mock.calls.find(
      (candidate) => candidate[0] === '/admin/datasets/ds-1/snapshots/snap-1/files',
    );
    expect(call).toBeTruthy();
    const form = call?.[1] as FormData;
    expect(form.get('role')).toBe('chart');
    expect((form.get('file') as File).name).toBe('plot.png');
    // The list is refreshed after a successful attach (a second GET).
    expect(
      (api.get as ReturnType<typeof vi.fn>).mock.calls.filter(
        (candidate) => candidate[0] === '/admin/datasets/ds-1/snapshots/snap-1/files',
      ).length,
    ).toBeGreaterThan(1);
  });

  it('deletes a member file via the store', async () => {
    const wrapper = await mountPanel();
    (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ deleted: true });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await wrapper.find('[data-testid="issue-file-delete-f-1"]').trigger('click');
    await flushPromises();

    expect(api.delete).toHaveBeenCalledWith('/admin/datasets/ds-1/snapshots/snap-1/files/f-1');
  });

  it('surfaces a 400 error (bad role/size/ext) from an invalid attach', async () => {
    const wrapper = await mountPanel();
    (api.post as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('disallowed extension'));

    const file = new File(['x'], 'bad.exe');
    setInputFile(wrapper, file);
    await wrapper.find('[data-testid="issue-file-input"]').trigger('change');
    await wrapper.find('[data-testid="issue-file-attach"]').trigger('submit');
    await flushPromises();

    expect(wrapper.find('[data-testid="issue-files-error"]').text()).toContain('disallowed extension');
  });
});
