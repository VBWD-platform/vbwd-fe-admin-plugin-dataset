<template>
  <section
    class="snapshot-archive"
    data-testid="snapshot-archive"
  >
    <div class="archive-header">
      <h3>{{ $t('dataset.archive.heading') }}</h3>
      <div class="archive-upload">
        <input
          ref="fileInput"
          type="file"
          class="archive-file-input"
          data-testid="snapshot-upload-input"
          @change="onFileSelected"
        >
        <button
          type="button"
          class="btn btn--primary"
          data-testid="snapshot-upload-btn"
          :disabled="uploading"
          @click="triggerFilePicker"
        >
          {{ $t('dataset.archive.upload') }}
        </button>
      </div>
    </div>

    <p
      v-if="error"
      class="archive-error"
      data-testid="snapshot-error"
    >
      {{ error }}
    </p>

    <p
      v-if="!snapshots.length"
      class="archive-empty"
      data-testid="snapshot-empty"
    >
      {{ $t('dataset.archive.empty') }}
    </p>

    <table
      v-else
      class="data-table"
    >
      <thead>
        <tr>
          <th>{{ $t('dataset.archive.takenAt') }}</th>
          <th>{{ $t('dataset.archive.backend') }}</th>
          <th>{{ $t('dataset.archive.size') }}</th>
          <th>{{ $t('dataset.columns.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="snapshot in snapshots"
          :key="snapshot.id"
          class="snapshot-row"
          data-testid="snapshot-row"
          role="button"
          tabindex="0"
          :aria-label="`Open ${snapshot.taken_at}`"
          @click="openSnapshot(snapshot.id)"
          @keydown.enter="openSnapshot(snapshot.id)"
          @keydown.space.prevent="openSnapshot(snapshot.id)"
        >
          <td>
            {{ snapshot.taken_at }}
            <span
              v-if="snapshot.id === lastSnapshotId"
              class="last-badge"
              :data-testid="`snapshot-last-badge-${snapshot.id}`"
            >{{ $t('dataset.archive.last') }}</span>
          </td>
          <td class="backend-cell">
            {{ snapshot.storage_backend }}
          </td>
          <td>{{ formatSize(snapshot.size_bytes) }}</td>
          <td class="actions-cell">
            <button
              type="button"
              class="action-btn"
              :data-testid="`snapshot-download-${snapshot.id}`"
              @click.stop="download(snapshot)"
            >
              {{ $t('dataset.archive.download') }}
            </button>
            <button
              v-if="snapshot.id !== lastSnapshotId"
              type="button"
              class="action-btn"
              :data-testid="`snapshot-set-last-${snapshot.id}`"
              @click.stop="setLast(snapshot.id)"
            >
              {{ $t('dataset.archive.setLast') }}
            </button>
            <button
              type="button"
              class="action-btn danger"
              :data-testid="`snapshot-delete-${snapshot.id}`"
              @click.stop="remove(snapshot.id)"
            >
              {{ $t('dataset.archive.delete') }}
            </button>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useDatasetStore, type DatasetSnapshot } from '../stores/useDatasetStore';

const props = defineProps<{
  datasetId: string;
  lastSnapshotId: string | null;
}>();

const router = useRouter();

/** Open the dedicated data page for a snapshot (row-click / keyboard). */
function openSnapshot(snapshotId: string): void {
  void router.push({
    name: 'dataset-snapshot-view',
    params: { datasetId: props.datasetId, snapshotId },
  });
}

const emit = defineEmits<{ (event: 'changed'): void }>();

const store = useDatasetStore();
const snapshots = ref<DatasetSnapshot[]>([]);
const uploading = ref(false);
const error = ref<string | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);

const SIZE_UNIT = 1024;
const SIZE_LABELS = ['B', 'KB', 'MB', 'GB'];

function formatSize(bytes: number): string {
  let value = bytes;
  let unitIndex = 0;
  while (value >= SIZE_UNIT && unitIndex < SIZE_LABELS.length - 1) {
    value /= SIZE_UNIT;
    unitIndex += 1;
  }
  const rounded = unitIndex === 0 ? value : Math.round(value * 10) / 10;
  return `${rounded} ${SIZE_LABELS[unitIndex]}`;
}

async function reload(): Promise<void> {
  snapshots.value = await store.fetchSnapshots(props.datasetId);
}

function triggerFilePicker(): void {
  fileInput.value?.click();
}

function onFileSelected(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) void uploadSnapshotFile(file);
  input.value = '';
}

async function uploadSnapshotFile(file: File): Promise<void> {
  uploading.value = true;
  error.value = null;
  try {
    const formData = new FormData();
    formData.append('file', file);
    await store.uploadSnapshot(props.datasetId, formData);
    await reload();
    emit('changed');
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    uploading.value = false;
  }
}

async function setLast(snapshotId: string): Promise<void> {
  await store.setLastSnapshot(props.datasetId, snapshotId);
  await reload();
  emit('changed');
}

async function remove(snapshotId: string): Promise<void> {
  if (!confirm('Delete this snapshot?')) return;
  await store.deleteSnapshot(props.datasetId, snapshotId);
  await reload();
  emit('changed');
}

async function download(snapshot: DatasetSnapshot): Promise<void> {
  try {
    const blob = await store.downloadSnapshot(props.datasetId, snapshot.id);
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      const ext = snapshot.ext ? `.${snapshot.ext.replace(/^\./, '')}` : '';
      anchor.download = `${snapshot.id}${ext}`;
      anchor.click();
      URL.revokeObjectURL(url);
    }
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  }
}

onMounted(reload);

defineExpose({ uploadSnapshotFile, reload });
</script>

<style scoped>
.snapshot-archive {
  background: white;
  padding: 4px 0;
}

.archive-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.archive-header h3 {
  margin: 0;
  color: #2c3e50;
}

.archive-upload {
  display: flex;
  gap: 8px;
  align-items: center;
}

.archive-file-input {
  display: none;
}

.archive-error {
  background: #fee2e2;
  color: #991b1b;
  padding: 0.5rem 0.75rem;
  border-radius: 4px;
}

.archive-empty {
  color: #666;
  padding: 12px 0;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
}

.data-table th,
.data-table td {
  padding: 10px 12px;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.data-table th {
  background: #f8f9fa;
  font-weight: 600;
  color: #2c3e50;
}

.snapshot-row {
  cursor: pointer;
}

.snapshot-row:hover {
  background: #f8fbff;
}

.snapshot-row:focus-visible {
  outline: 2px solid #1d4ed8;
  outline-offset: -2px;
}

.backend-cell {
  text-transform: uppercase;
  font-size: 0.8rem;
}

.last-badge {
  display: inline-block;
  margin-left: 8px;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.7rem;
  font-weight: 600;
  background: #dbeafe;
  color: #1d4ed8;
}

.actions-cell {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 8px 14px;
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

.action-btn {
  padding: 4px 10px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  background: #e9ecef;
  color: #2c3e50;
}

.action-btn.danger {
  background: none;
  color: #dc2626;
  text-decoration: underline;
  padding: 0;
}
</style>
