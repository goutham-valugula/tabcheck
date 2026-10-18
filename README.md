# Tabcheck

**A private, local-first CSV import preflight.** Catch common data issues before importing a spreadsheet into a CRM or other business system.

Tabcheck runs in the browser and never uploads the selected file. It reports findings for review; it does not modify or clean your data, map fields, or decide whether an import is safe.

## Current checks

- Rows with a different number of cells than the header.
- Duplicate header names.
- Blank values in likely key fields (name, company/account, email).
- Email values that do not resemble a basic email address.
- Exact duplicate rows and repeated email addresses.
- Searchable findings and CSV export of the report.

These are heuristics, not universal import rules. Different CRMs have different required fields and duplicate policies. Always inspect your target system's field mapping and requirements.

## Run locally

Requires Node.js 20 or newer.

```sh
npm install
npm run dev
```

To create the static production build:

```sh
npm run build
```

The output is in `dist/` and can be hosted as static files. No API keys, backend, account, or database are needed.

## Privacy

Parsing and analysis run client-side. Tabcheck does not send CSV contents to a server. The Google Fonts stylesheet is loaded from Google when online; the application does not transmit file data to it. For a completely offline deployment, remove the `@import` in `src/style.css` and use the listed system fallbacks.

## Limitations

- CSV only (UTF-8 and delimiter detection are provided by Papa Parse); no XLSX support yet.
- Files are limited to 20 MB in the current UI.
- Email validation is intentionally basic and does not confirm that an address exists.
- No fuzzy matching, automatic correction, CRM-specific rules, or import operation.
- Very large files can consume browser memory; the report currently retains parsed rows in memory.

## License

MIT. See [LICENSE](LICENSE).
