<template>
  <div class="dataset-view dataset-form">
    <div class="view-header">
      <h2>{{ isNew ? $t('dataset.editor.newHeading') : $t('dataset.editor.editHeading') }}</h2>
      <div class="view-header__actions">
        <router-link
          :to="{ name: 'dataset-list' }"
          class="btn"
        >
          {{ $t('dataset.editor.cancel') }}
        </router-link>
        <button
          type="button"
          class="btn btn--primary"
          data-testid="dataset-save"
          :disabled="saving"
          @click="save"
        >
          {{ $t('dataset.editor.save') }}
        </button>
      </div>
    </div>

    <div
      v-if="error"
      class="dataset-form__error"
    >
      {{ error }}
    </div>

    <!-- Tabs: Details + Dataset (file-archive). -->
    <div class="tab-bar">
      <button
        type="button"
        class="tab-btn"
        :class="{ active: activeTab === 'details' }"
        data-testid="dataset-tab-details"
        @click="activeTab = 'details'"
      >
        {{ $t('dataset.editor.tabDetails') }}
      </button>
      <button
        type="button"
        class="tab-btn"
        :class="{ active: activeTab === 'archive' }"
        data-testid="dataset-tab-archive"
        @click="activeTab = 'archive'"
      >
        {{ $t('dataset.editor.tabDataset') }}
      </button>
    </div>

    <!-- Details pane -->
    <div
      v-show="activeTab === 'details'"
      class="pane"
      data-testid="dataset-details-pane"
    >
      <div class="field-group">
        <label class="field-label">{{ $t('dataset.editor.fieldTitle') }}</label>
        <input
          v-model="form.title"
          type="text"
          class="field-input"
          data-testid="dataset-title"
        >
      </div>

      <div class="field-group">
        <label class="field-label">{{ $t('dataset.editor.fieldSlug') }}</label>
        <input
          v-model="form.slug"
          type="text"
          class="field-input"
          data-testid="dataset-slug"
        >
      </div>

      <div class="field-group">
        <label class="field-label">{{ $t('dataset.editor.fieldDescription') }}</label>
        <textarea
          v-model="form.description"
          class="field-input"
          rows="3"
          data-testid="dataset-description"
        />
      </div>

      <div class="field-group">
        <label class="field-label">{{ $t('dataset.editor.fieldSource') }}</label>
        <input
          v-model="form.source_attribution"
          type="text"
          class="field-input"
          data-testid="dataset-source"
        >
      </div>

      <div class="field-row">
        <div class="field-group">
          <label class="field-label">{{ $t('dataset.editor.fieldPrice') }}</label>
          <input
            v-model.number="form.price"
            type="number"
            step="0.01"
            min="0"
            class="field-input"
            data-testid="dataset-price"
          >
        </div>
        <div class="field-group">
          <label class="field-label">{{ $t('dataset.editor.fieldTax') }}</label>
          <input
            v-model.number="form.taxes"
            type="number"
            step="0.01"
            min="0"
            class="field-input"
            data-testid="dataset-tax"
          >
        </div>
      </div>

      <!-- Category (shared dataset_category term type) -->
      <div class="field-group">
        <label class="field-label">{{ $t('dataset.editor.fieldCategory') }}</label>
        <div
          v-if="selectedCategories.length"
          class="term-chips"
          data-testid="selected-categories"
        >
          <span
            v-for="category in selectedCategories"
            :key="category.id"
            class="term-chip"
          >
            {{ category.name }}
            <button
              type="button"
              class="term-chip__x"
              :data-testid="`remove-category-${category.id}`"
              :aria-label="`Remove ${category.name}`"
              @click="removeCategory(category.id)"
            >×</button>
          </span>
        </div>
        <SearchableTermSelect
          data-testid="dataset-category-select"
          :terms="unselectedCategories"
          :placeholder="$t('dataset.editor.addCategory')"
          @select="addCategory($event.id)"
        />
      </div>

      <!-- Plan/tariff link -->
      <div class="field-group">
        <label class="field-label">{{ $t('dataset.editor.fieldPlan') }}</label>
        <select
          v-model="form.tariff_plan_id"
          class="field-input"
          data-testid="dataset-plan"
        >
          <option :value="null">
            {{ $t('dataset.editor.noPlan') }}
          </option>
          <option
            v-for="plan in store.plans"
            :key="plan.id"
            :value="plan.id"
          >
            {{ plan.name }}
          </option>
        </select>
      </div>

      <div class="field-group field-group--inline">
        <label class="field-label">
          <input
            v-model="form.is_active"
            type="checkbox"
            data-testid="dataset-active"
          >
          {{ $t('dataset.editor.fieldActive') }}
        </label>
      </div>

      <!-- Tags + custom fields (generic core, entity_type "dataset"). Both need a
           saved entity id, so they render in edit mode only. -->
      <template v-if="!isNew && datasetId">
        <TagPicker
          :entity-type="DATASET_ENTITY_TYPE"
          :entity-id="datasetId"
        />
        <CustomFieldsEditor
          :entity-type="DATASET_ENTITY_TYPE"
          :entity-id="datasetId"
        />
      </template>
    </div>

    <!-- Dataset (file-archive) pane -->
    <div
      v-show="activeTab === 'archive'"
      class="pane"
      data-testid="dataset-archive-pane"
    >
      <DatasetSnapshotArchive
        v-if="!isNew && datasetId"
        :dataset-id="datasetId"
        :last-snapshot-id="form.last_snapshot_id"
        @changed="reloadDataset"
      />
      <p
        v-else
        class="archive-hint"
      >
        {{ $t('dataset.editor.saveFirst') }}
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import TagPicker from '@/components/TagPicker.vue';
import CustomFieldsEditor from '@/components/CustomFieldsEditor.vue';
import SearchableTermSelect from '../../../cms-admin/src/components/SearchableTermSelect.vue';
import DatasetSnapshotArchive from '../components/DatasetSnapshotArchive.vue';
import {
  useDatasetStore,
  DATASET_ENTITY_TYPE,
  type Dataset,
} from '../stores/useDatasetStore';

interface DatasetFormModel {
  title: string;
  slug: string;
  description: string;
  source_attribution: string;
  price: number;
  taxes: number;
  tariff_plan_id: string | null;
  is_active: boolean;
  last_snapshot_id: string | null;
}

const route = useRoute();
const router = useRouter();
const store = useDatasetStore();

const datasetId = ref<string>((route.params.id as string) ?? '');
const isNew = computed(() => !datasetId.value);

const activeTab = ref<'details' | 'archive'>('details');
const saving = ref(false);
const error = ref<string | null>(null);

const form = reactive<DatasetFormModel>({
  title: '',
  slug: '',
  description: '',
  source_attribution: '',
  price: 0,
  taxes: 0,
  tariff_plan_id: null,
  is_active: true,
  last_snapshot_id: null,
});

const selectedCategoryIds = ref<string[]>([]);

const selectedCategories = computed(() =>
  store.categoryTerms.filter((term) => selectedCategoryIds.value.includes(term.id)),
);
const unselectedCategories = computed(() =>
  store.categoryTerms.filter((term) => !selectedCategoryIds.value.includes(term.id)),
);

function seedForm(dataset: Dataset): void {
  form.title = dataset.title ?? '';
  form.slug = dataset.slug ?? '';
  form.description = dataset.description ?? '';
  form.source_attribution = dataset.source_attribution ?? '';
  // The serializer returns the stored price under `price` (the Priceable
  // `raw_price` alias is not serialized), so read it from there.
  form.price = dataset.price ?? 0;
  // `taxes` is the assigned core-tax list; surface the first rate (display
  // only — tax assignment is not edited through this numeric field yet).
  form.taxes = Number(dataset.taxes?.[0]?.rate ?? 0);
  form.tariff_plan_id = dataset.tariff_plan_id ?? null;
  form.is_active = dataset.is_active ?? true;
  form.last_snapshot_id = dataset.last_snapshot_id ?? null;
  const categoryIds = new Set(store.categoryTerms.map((term) => term.id));
  selectedCategoryIds.value = (dataset.term_ids ?? []).filter((id) => categoryIds.has(id));
}

async function reloadDataset(): Promise<void> {
  if (!datasetId.value) return;
  const dataset = await store.fetchDataset(datasetId.value);
  seedForm(dataset);
}

async function addCategory(termId: string): Promise<void> {
  if (selectedCategoryIds.value.includes(termId)) return;
  if (datasetId.value) await store.assignCategory(datasetId.value, termId);
  selectedCategoryIds.value = [...selectedCategoryIds.value, termId];
}

async function removeCategory(termId: string): Promise<void> {
  if (datasetId.value) await store.unassignCategory(datasetId.value, termId);
  selectedCategoryIds.value = selectedCategoryIds.value.filter((id) => id !== termId);
}

function buildPayload(): Partial<Dataset> {
  return {
    ...(datasetId.value ? { id: datasetId.value } : {}),
    title: form.title,
    slug: form.slug,
    description: form.description,
    source_attribution: form.source_attribution,
    // Send the price under the field the backend persists (`price`). Tax
    // assignment is via the core tax catalog, not this numeric field, so it is
    // deliberately not sent here.
    price: form.price,
    tariff_plan_id: form.tariff_plan_id,
    is_active: form.is_active,
  };
}

async function save(): Promise<void> {
  saving.value = true;
  error.value = null;
  try {
    const saved = await store.saveDataset(buildPayload());
    if (!datasetId.value) {
      datasetId.value = saved.id;
      // Persist the categories picked before the dataset existed.
      for (const termId of selectedCategoryIds.value) {
        await store.assignCategory(saved.id, termId);
      }
      router.replace({ name: 'dataset-edit', params: { id: saved.id } });
    }
    seedForm(saved);
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught);
  } finally {
    saving.value = false;
  }
}

onMounted(async () => {
  await Promise.all([store.fetchCategoryTerms(), store.fetchPlans()]);
  if (datasetId.value) {
    const dataset = await store.fetchDataset(datasetId.value);
    seedForm(dataset);
  }
});
</script>

<style scoped>
.dataset-form {
  background: white;
  padding: 20px;
  border-radius: 8px;
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.view-header h2 {
  margin: 0;
  color: #2c3e50;
}

.view-header__actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.dataset-form__error {
  background: #fee2e2;
  color: #991b1b;
  padding: 0.6rem 1rem;
  border-radius: 4px;
  margin-bottom: 1rem;
}

.tab-bar {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid #e5e7eb;
  margin-bottom: 20px;
}

.tab-btn {
  padding: 0.5rem 1.25rem;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-size: 0.9rem;
  color: #6b7280;
}

.tab-btn.active {
  color: #1d4ed8;
  border-bottom-color: #1d4ed8;
  font-weight: 600;
}

.pane {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-group--inline {
  flex-direction: row;
  align-items: center;
}

.field-row {
  display: flex;
  gap: 16px;
}

.field-row .field-group {
  flex: 1;
}

.field-label {
  font-size: 0.85rem;
  font-weight: 500;
  color: #374151;
}

.field-input {
  padding: 0.5rem 0.75rem;
  font-size: 1rem;
  font-family: inherit;
  color: #374151;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 0.375rem;
}

.term-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;
}

.term-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  font-size: 0.75rem;
  border-radius: 9999px;
  background: #f3f4f6;
  color: #374151;
}

.term-chip__x {
  border: none;
  background: none;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
  color: inherit;
}

.btn {
  padding: 8px 16px;
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  background: #fff;
  color: #333;
  cursor: pointer;
  font-size: 14px;
  text-decoration: none;
}

.btn--primary {
  background: #27ae60;
  color: white;
  border-color: #27ae60;
}

.archive-hint {
  color: #666;
  padding: 12px 0;
}
</style>
