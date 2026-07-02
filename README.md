# vbwd-fe-admin-plugin-dataset

Admin **Datasets** plugin (S110). Adds a *Sales ▸ Datasets* backoffice for the
`dataset` vertical: dataset CRUD, tariff-plan link, tax assignment, and the
versioned snapshot archive (upload / set-last / delete / download).

## Structure

```
plugins/dataset/
├── index.ts              # datasetAdminPlugin: IPlugin (named export)
├── config.json           # Default configuration
├── admin-config.json     # Admin-editable settings
├── src/
│   ├── views/            # DatasetsList, DatasetForm
│   ├── components/       # DatasetSnapshotArchive
│   └── stores/           # useDatasetStore
└── tests/unit/
```

## Tests

```bash
cd vbwd-fe-admin
npx vitest run plugins/dataset/
# or the full gate:
./bin/pre-commit-check.sh --plugin dataset --unit
```

The end-to-end acceptance for the vertical is the cross-app Playwright
walkthrough (`vue/tests/e2e/walkthrough-s110-datasets.spec.ts`), which drives
backend + fe-admin + fe-user and emits an HTML report with screenshots.
