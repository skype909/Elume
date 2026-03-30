# Shared Exam Library

Server path:

`/var/lib/elume/exam-library/`

Expected contents:

```text
/var/lib/elume/exam-library/
  manifest.json
  junior-cycle/
    english/
      jc-english-hl-2024-paper-1.pdf
  senior-cycle/
    maths/
      lc-maths-hl-2023-paper-1.pdf
      lc-maths-ol-2023-paper-1.pdf
    irish/
      lc-irish-hl-2022-paper-1.pdf
```

`manifest.json` format:

```json
{
  "items": [
    {
      "id": "lc-maths-hl-2023-paper-1",
      "cycle": "Senior Cycle",
      "subject": "Maths",
      "level": "Higher Level",
      "year": "2023",
      "title": "Leaving Certificate Maths HL 2023 Paper 1",
      "path": "senior-cycle/maths/lc-maths-hl-2023-paper-1.pdf"
    }
  ]
}
```

Rules:

- `path` is relative to `/var/lib/elume/exam-library/`
- each `id` must be unique
- each referenced PDF must exist on disk
- the API reads the manifest as a read-only library source

Adding new papers:

1. Copy the PDF into `/var/lib/elume/exam-library/` under a sensible subject/cycle folder.
2. Add one matching entry to `manifest.json`.
3. Restart the backend if your deployment does not auto-reload application files.

