# Vendored packages

Packages Ziffr installs from a file here instead of the npm registry, because their vendor publishes them elsewhere.

- `xlsx-0.20.3.tgz`: SheetJS Community Edition 0.20.3, the official tarball from https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz. Its sha512 (`oLDq3jw7…H+3AJA==`) is the lockfile's integrity for `xlsx`. To update: download the new release's tarball from the vendor, check its sha512 against the one the vendor publishes, replace the file, point `apps/web/package.json` at it and run `pnpm install`. Its releases are checked by hand in the quarterly simplification pass (docs/security/threat-model.md).
