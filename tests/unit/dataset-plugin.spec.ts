import { describe, it, expect, beforeEach } from 'vitest';
import { extensionRegistry } from '@/plugins/extensionRegistry';
import { datasetAdminPlugin } from '../../index';

describe('dataset admin plugin — nav registration', () => {
  beforeEach(() => extensionRegistry.clear());

  it('exposes the singular plugin id "dataset"', () => {
    expect(datasetAdminPlugin.name).toBe('dataset');
  });

  it('registers a "Datasets" set under the Sales section on activate', () => {
    datasetAdminPlugin.activate?.();

    const salesItems = extensionRegistry.getSectionItems('sales');
    const datasetsSet = salesItems.find((item) => item.id === 'datasets');

    expect(datasetsSet).toBeTruthy();
    expect(datasetsSet?.label).toBe('Datasets');
    expect(datasetsSet?.to).toBe('/admin/datasets');
    expect(datasetsSet?.requiredPermission).toBe('dataset.view');
  });

  it('nests a "Datasets" subitem pointing at the list route', () => {
    datasetAdminPlugin.activate?.();

    const datasetsSet = extensionRegistry
      .getSectionItems('sales')
      .find((item) => item.id === 'datasets');
    const listChild = datasetsSet?.children?.find(
      (child) => child.to === '/admin/datasets/list',
    );

    expect(listChild).toBeTruthy();
    expect(listChild?.label).toBe('Datasets');
    expect(listChild?.requiredPermission).toBe('dataset.view');
  });

  it('removes its Sales items on deactivate', () => {
    datasetAdminPlugin.activate?.();
    datasetAdminPlugin.deactivate?.();

    const stillThere = extensionRegistry
      .getSectionItems('sales')
      .find((item) => item.id === 'datasets');
    expect(stillThere).toBeFalsy();
  });
});
