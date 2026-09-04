# Elume static system pages

These plain HTML pages are deliberately independent of React, FastAPI,
PostgreSQL, JavaScript bundles, external fonts, CDNs, and APIs. They are
source-controlled here for review, but should eventually be installed outside
the React release directory:

```text
/var/www/elume-system-pages/404.html
/var/www/elume-system-pages/outage.html
```

`elume-system-pages.nginx.example` is review material, not a drop-in
production configuration. It is designed for the current nginx pattern:

```nginx
location / {
    try_files $uri /index.html;
}
location /api/ { proxy_pass http://127.0.0.1:8000/; }
location /ws/  { proxy_pass http://127.0.0.1:8000; }
```

## Future controlled installation

1. Install the two HTML files with root-owned, world-readable permissions in
   `/var/www/elume-system-pages/`.
2. Review the example against the active nginx server block. Keep the SPA
   fallback intact; add the static-asset 404 location and the narrowly scoped
   maintenance check only.
3. Validate with `nginx -t` before any reload.
4. Test a missing static asset (bundle, image, font, manifest/data file, PDF,
   spreadsheet, or audio file) returns the branded 404 with HTTP 404, while
   `/#/student`, `/#/student/exam-papers`, and other SPA links still load
   `index.html`.

## Future maintenance activation

After the reviewed nginx configuration is installed and reloaded, activate
the static outage page deliberately:

```text
create /etc/nginx/elume-maintenance.enabled
```

Public requests handled by `location /` will return HTTP 503 and the static
`outage.html` body with `Cache-Control: no-store`. Exact internal system-page
locations bypass the marker, so nginx can render the outage page without an
error loop. `/api/` and `/ws/` remain unchanged and continue returning their
normal protocol/JSON errors.

The `-f` check is evaluated for each request, so once the reviewed nginx
configuration is already installed, creating or removing this marker does not
require an nginx reload. A configuration test and reload are needed only when
first installing or changing the nginx snippet.

The optional `/_elume-system/health` endpoint returns nginx-only 204 to
localhost. It confirms that nginx can answer while maintenance mode is active;
it does not attest to FastAPI or database health.

## Future maintenance deactivation

```text
remove /etc/nginx/elume-maintenance.enabled
```

No React build, FastAPI restart, or database operation is required to activate
or deactivate this static fallback. Do not use it as an automatic replacement
for every upstream 5xx: turning API 5xx responses into HTML would mask useful
JSON errors and break API consumers.
