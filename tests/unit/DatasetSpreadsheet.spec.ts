import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createI18n } from 'vue-i18n';
import DatasetSpreadsheet from '../../src/components/DatasetSpreadsheet.vue';
import datasetEn from '../../locales/en.json';

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en: { ...datasetEn } },
});

interface SpreadsheetProps {
  columns: string[];
  rows: (string | number | null)[][];
  loading?: boolean;
  error?: string | null;
}

function mountSpreadsheet(props: SpreadsheetProps) {
  return mount(DatasetSpreadsheet, {
    props,
    global: { plugins: [i18n] },
  });
}

describe('DatasetSpreadsheet.vue', () => {
  it('renders one header cell per column and one row per data row', () => {
    const wrapper = mountSpreadsheet({
      columns: ['city', 'aqi', 'measured_at'],
      rows: [
        ['Berlin', 42, '2026-05-01'],
        ['Paris', 17, '2026-05-01'],
      ],
    });
    expect(wrapper.find('[data-testid="dataset-spreadsheet"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid="spreadsheet-col"]')).toHaveLength(3);
    expect(wrapper.findAll('[data-testid="spreadsheet-row"]')).toHaveLength(2);
  });

  it('renders a leading row-number for each body row', () => {
    const wrapper = mountSpreadsheet({
      columns: ['a'],
      rows: [['x'], ['y'], ['z']],
    });
    const firstRow = wrapper.findAll('[data-testid="spreadsheet-row"]')[0];
    expect(firstRow.text()).toContain('1');
  });

  it('shows the empty state when there are no columns', () => {
    const wrapper = mountSpreadsheet({ columns: [], rows: [] });
    expect(wrapper.text()).toContain('No data yet');
    expect(wrapper.find('[data-testid="dataset-spreadsheet"]').exists()).toBe(false);
  });

  it('shows a loading state', () => {
    const wrapper = mountSpreadsheet({ columns: [], rows: [], loading: true });
    expect(wrapper.find('[data-testid="spreadsheet-loading"]').exists()).toBe(true);
  });

  it('shows an error state', () => {
    const wrapper = mountSpreadsheet({ columns: [], rows: [], error: 'Boom' });
    expect(wrapper.find('[data-testid="spreadsheet-error"]').text()).toContain('Boom');
  });

  it('renders null cells as an empty value without crashing', () => {
    const wrapper = mountSpreadsheet({
      columns: ['a', 'b'],
      rows: [[null, 5]],
    });
    expect(wrapper.findAll('[data-testid="spreadsheet-row"]')).toHaveLength(1);
  });
});
