/**
 * Dataset Admin Plugin (S110 · T12/T13)
 *
 * Adds the Datasets catalogue to the admin backoffice:
 * - Sales ▸ Datasets ▸ Datasets nav injection (extensionRegistry)
 * - a Pages-style list page (paged, sortable, quicksearch, by-category, bulk ops)
 * - a tabbed editor (Details + a "Dataset" file-archive tab for snapshots)
 *
 * Singular plugin id "dataset" per the S110 naming convention; display labels
 * stay plural ("Datasets").
 */
import type { IPlugin, IPlatformSDK } from 'vbwd-view-component';
import { extensionRegistry } from '../../vue/src/plugins/extensionRegistry';
import en from './locales/en.json';

const DATASET_ADMIN_EXTENSION = {
  sectionItems: {
    sales: [
      {
        label: 'Datasets',
        to: '/admin/datasets',
        id: 'datasets',
        icon: 'grid',
        requiredPermission: 'dataset.view',
        children: [
          {
            label: 'Datasets',
            to: '/admin/datasets/list',
            id: 'datasets-list',
            requiredPermission: 'dataset.view',
          },
        ],
      },
    ],
  },
};

export const datasetAdminPlugin: IPlugin = {
  name: 'dataset',
  version: '26.6.1',
  description: 'Datasets catalogue management (list + editor + snapshot archive)',

  install(sdk: IPlatformSDK) {
    sdk.addTranslations('en', { dataset: (en as Record<string, unknown>)['dataset'] });

    // Static routes are registered before the dynamic ":id" route so
    // /admin/datasets/list and /admin/datasets/new are not swallowed by it.
    sdk.addRoute({
      path: 'datasets',
      name: 'dataset-index',
      component: () => import('./src/views/DatasetsList.vue'),
      meta: { requiredPermission: 'dataset.view' },
    });
    sdk.addRoute({
      path: 'datasets/list',
      name: 'dataset-list',
      component: () => import('./src/views/DatasetsList.vue'),
      meta: { requiredPermission: 'dataset.view' },
    });
    sdk.addRoute({
      path: 'datasets/new',
      name: 'dataset-new',
      component: () => import('./src/views/DatasetForm.vue'),
      meta: { requiredPermission: 'dataset.manage' },
    });
    sdk.addRoute({
      path: 'datasets/:id',
      name: 'dataset-edit',
      component: () => import('./src/views/DatasetForm.vue'),
      meta: { requiredPermission: 'dataset.manage' },
    });
    // A snapshot's data as a server-paginated spreadsheet (opened by row click).
    sdk.addRoute({
      path: 'datasets/:datasetId/snapshots/:snapshotId',
      name: 'dataset-snapshot-view',
      component: () => import('./src/views/DatasetSnapshotView.vue'),
      meta: { requiredPermission: 'dataset.view' },
    });
  },

  activate() {
    extensionRegistry.register('dataset', DATASET_ADMIN_EXTENSION);
  },

  deactivate() {
    extensionRegistry.unregister('dataset');
  },
};

export default datasetAdminPlugin;
