import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { api } from '@/api';
import { useDatasetStore } from '../../src/stores/useDatasetStore';

vi.mock('@/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

describe('useDatasetStore — snapshot issue files (S124)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('fetchSnapshotFiles GETs the files endpoint and returns the uniform list (primary first)', async () => {
    const files = [
      { id: 'primary', role: 'data', filename: 'air.csv', ext: 'csv', content_type: 'text/csv', size_bytes: 10, checksum: null },
      { id: 'f-1', role: 'document', filename: 'report.pdf', ext: 'pdf', content_type: 'application/pdf', size_bytes: 20, checksum: 'x' },
    ];
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue({ files, total: 2 });
    const store = useDatasetStore();

    const result = await store.fetchSnapshotFiles('ds-1', 'snap-1');

    expect(api.get).toHaveBeenCalledWith('/admin/datasets/ds-1/snapshots/snap-1/files');
    expect(result.map((entry) => entry.id)).toEqual(['primary', 'f-1']);
  });

  it('addSnapshotFile POSTs multipart with file + role (+ filename) and returns the created dict', async () => {
    const created = { id: 'f-2', role: 'chart', filename: 'plot.png', ext: 'png', content_type: 'image/png', size_bytes: 30, checksum: null };
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue(created);
    const store = useDatasetStore();
    const file = new File(['x'], 'plot.png', { type: 'image/png' });

    const result = await store.addSnapshotFile('ds-1', 'snap-1', file, 'chart', 'plot.png');

    const call = (api.post as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('/admin/datasets/ds-1/snapshots/snap-1/files');
    const form = call[1] as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('file')).toBe(file);
    expect(form.get('role')).toBe('chart');
    expect(form.get('filename')).toBe('plot.png');
    expect(result).toEqual(created);
  });

  it('addSnapshotFile omits filename when not provided', async () => {
    (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({});
    const store = useDatasetStore();
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' });

    await store.addSnapshotFile('ds-1', 'snap-1', file, 'document');

    const form = (api.post as ReturnType<typeof vi.fn>).mock.calls[0][1] as FormData;
    expect(form.get('filename')).toBeNull();
    expect(form.get('role')).toBe('document');
  });

  it('addSnapshotFile propagates a 400 (bad role/size/ext) error to the caller', async () => {
    (api.post as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('disallowed extension'));
    const store = useDatasetStore();
    const file = new File(['x'], 'a.exe');

    await expect(store.addSnapshotFile('ds-1', 'snap-1', file, 'other')).rejects.toThrow('disallowed extension');
  });

  it('deleteSnapshotFile DELETEs the member file endpoint', async () => {
    (api.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ deleted: true });
    const store = useDatasetStore();

    await store.deleteSnapshotFile('ds-1', 'snap-1', 'f-1');

    expect(api.delete).toHaveBeenCalledWith('/admin/datasets/ds-1/snapshots/snap-1/files/f-1');
  });

  it('downloadSnapshotFile GETs the admin file-download endpoint as a blob (member)', async () => {
    const pdf = new Blob(['%PDF'], { type: 'application/pdf' });
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue(pdf);
    const store = useDatasetStore();

    const result = await store.downloadSnapshotFile('ds-1', 'snap-1', 'f-1');

    expect(api.get).toHaveBeenCalledWith(
      '/admin/datasets/ds-1/snapshots/snap-1/files/f-1/download',
      { responseType: 'blob' },
    );
    expect(result).toBe(pdf);
  });

  it('downloadSnapshotFile targets the primary id for the primary data file', async () => {
    const csv = new Blob(['a,b\n1,2\n'], { type: 'text/csv' });
    (api.get as ReturnType<typeof vi.fn>).mockResolvedValue(csv);
    const store = useDatasetStore();

    const result = await store.downloadSnapshotFile('ds-1', 'snap-1', 'primary');

    expect(api.get).toHaveBeenCalledWith(
      '/admin/datasets/ds-1/snapshots/snap-1/files/primary/download',
      { responseType: 'blob' },
    );
    expect(result).toBe(csv);
  });
});
