<template>
  <section
    class="issue-files"
    data-testid="issue-files"
  >
    <div class="issue-files__header">
      <h3>{{ $t('dataset.issueFiles.heading') }}</h3>
    </div>

    <p
      v-if="error"
      class="issue-files__error"
      data-testid="issue-files-error"
    >
      {{ error }}
    </p>

    <p
      v-if="!loading && !files.length"
      class="issue-files__empty"
      data-testid="issue-files-empty"
    >
      {{ $t('dataset.issueFiles.empty') }}
    </p>

    <table
      v-else-if="files.length"
      class="data-table"
    >
      <thead>
        <tr>
          <th>{{ $t('dataset.issueFiles.role') }}</th>
          <th>{{ $t('dataset.issueFiles.filename') }}</th>
          <th>{{ $t('dataset.issueFiles.ext') }}</th>
          <th>{{ $t('dataset.issueFiles.size') }}</th>
          <th>{{ $t('dataset.issueFiles.contentType') }}</th>
          <th>{{ $t('dataset.columns.actions') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="file in files"
          :key="file.id"
          class="issue-file-row"
          data-testid="issue-file-row"
        >
          <td>
            <span
              class="role-badge"
              :class="`role-badge--${file.role}`"
              :data-testid="`issue-file-role-${file.id}`"
            >{{ roleLabel(file.role) }}</span>
          </td>
          <td :data-testid="`issue-file-name-${file.id}`">
            {{ file.filename }}
          </td>
          <td class="ext-cell">
            {{ file.ext }}
          </td>
          <td>{{ formatSize(file.size_bytes) }}</td>
          <td class="ctype-cell">
            {{ file.content_type || '—' }}
          </td>
          <td class="actions-cell">
            <button
              type="button"
              class="action-btn"
              :data-testid="`issue-file-download-${file.id}`"
              @click="download(file)"
            >
              {{ $t('dataset.issueFiles.download') }}
            </button>
            <button
              v-if="file.id !== PRIMARY_SNAPSHOT_FILE_ID"
              type="button"
              class="action-btn danger"
              :data-testid="`issue-file-delete-${file.id}`"
              @click="remove(file.id)"
            >
              {{ $t('dataset.issueFiles.delete') }}
            </button>
            <span
              v-else
              class="primary-note"
              :data-testid="`issue-file-primary-${file.id}`"
            >{{ $t('dataset.issueFiles.primary') }}</span>
          </td>
        </tr>
      </tbody>
    </table>

    <form
      class="issue-files__attach"
      data-testid="issue-file-attach"
      @submit.prevent="submitAttach"
    >
      <input
        ref="fileInput"
        type="file"
        class="issue-files__file"
        data-testid="issue-file-input"
        @change="onFileSelected"
      >
      <select
        v-model="selectedRole"
        class="field-input"
        data-testid="issue-file-role-select"
      >
        <option
          v-for="role in FILE_ROLES"
          :key="role"
          :value="role"
        >
          {{ roleLabel(role) }}
        </option>
      </select>
      <button
        type="submit"
        class="btn btn--primary"
        data-testid="issue-file-add-btn"
        :disabled="!selectedFile || adding"
      >
        {{ $t('dataset.issueFiles.add') }}
      </button>
    </form>
  </section>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  useDatasetStore,
  SNAPSHOT_FILE_ROLES,
  PRIMARY_SNAPSHOT_FILE_ID,
  type DatasetSnapshotFile,
  type SnapshotFileRole,
} from '../stores/useDatasetStore';

const props = defineProps<{
  datasetId: string;
  snapshotId: string;
}>();

const emit = defineEmits<{ (event: 'changed'): void }>();

const { t } = useI18n();
const store = useDatasetStore();

const FILE_ROLES = SNAPSHOT_FILE_ROLES;

const files = ref<DatasetSnapshotFile[]>([]);
const loading = ref(false);
const adding = ref(false);
const error = ref<string | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const selectedFile = ref<File | null>(null);
const selectedRole = ref<SnapshotFileRole>(FILE_ROLES[0]);

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

function roleLabel(role: string): string {
  const key = `dataset.issueFiles.roles.${role}`;
  const label = t(key);
  return label === key ? role : label;
}

async function reload(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    files.value = await store.fetchSnapshotFiles(props.datasetId, props.snapshotId);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    loading.value = false;
  }
}

function onFileSelected(event: Event): void {
  const input = event.target as HTMLInputElement;
  selectedFile.value = input.files?.[0] ?? null;
}

async function submitAttach(): Promise<void> {
  if (!selectedFile.value) return;
  adding.value = true;
  error.value = null;
  try {
    await store.addSnapshotFile(
      props.datasetId,
      props.snapshotId,
      selectedFile.value,
      selectedRole.value,
    );
    selectedFile.value = null;
    if (fileInput.value) fileInput.value.value = '';
    await reload();
    emit('changed');
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    adding.value = false;
  }
}

async function download(file: DatasetSnapshotFile): Promise<void> {
  error.value = null;
  try {
    const blob = await store.downloadSnapshotFile(
      props.datasetId,
      props.snapshotId,
      file.id,
    );
    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = file.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    }
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  }
}

async function remove(fileId: string): Promise<void> {
  if (!confirm(t('dataset.issueFiles.confirmDelete'))) return;
  error.value = null;
  try {
    await store.deleteSnapshotFile(props.datasetId, props.snapshotId, fileId);
    await reload();
    emit('changed');
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  }
}

onMounted(reload);

defineExpose({ reload });
</script>

<style scoped>
.issue-files {
  background: white;
  padding: 16px 0 4px;
  border-top: 1px solid #eee;
  margin-top: 20px;
}

.issue-files__header h3 {
  margin: 0 0 12px;
  color: #2c3e50;
}

.issue-files__error {
  background: #fee2e2;
  color: #991b1b;
  padding: 0.5rem 0.75rem;
  border-radius: 4px;
}

.issue-files__empty {
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

.ext-cell {
  text-transform: uppercase;
  font-size: 0.8rem;
}

.ctype-cell {
  color: #6b7280;
  font-size: 0.8rem;
}

.role-badge {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: capitalize;
  background: #e5e7eb;
  color: #374151;
}

.role-badge--data {
  background: #dbeafe;
  color: #1d4ed8;
}

.role-badge--document {
  background: #fef3c7;
  color: #92400e;
}

.role-badge--chart {
  background: #dcfce7;
  color: #166534;
}

.primary-note {
  color: #6b7280;
  font-size: 0.75rem;
  font-style: italic;
}

.actions-cell {
  display: flex;
  gap: 8px;
}

.issue-files__attach {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  flex-wrap: wrap;
}

.field-input {
  padding: 0.35rem 0.5rem;
  font-size: 0.9rem;
  color: #374151;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
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

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
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
