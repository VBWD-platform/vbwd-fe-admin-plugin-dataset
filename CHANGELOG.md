# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [v26.6] - 2026-07-02

### Added
- Initial fe-admin datasets plugin (S110): *Sales ▸ Datasets* nav, dataset
  list + form (tariff-plan link, tax assignment), and the versioned snapshot
  archive component (upload / set-last / delete / download).

### Fixed
- Snapshot download now requests the archive as a blob and names the file with
  its extension (the shared `ApiClient.get` previously dropped `responseType`,
  so `URL.createObjectURL` received a non-Blob and threw).
