# Hygiene Check v2

## Try it immediately

Unzip the package, then double-click **preview.html**. It is one self-contained file and works directly from a file URL, without a server or internet connection. Start with Near me, or search “Demo”.

The preview has 12 fictional FSA-shaped records, numeric and Scottish ratings, business-type and rating filters, 1/2/5/10-mile radii, sorting, clickable map pins, detail panels and session-only recent checks. Near me uses simulated coordinates and never asks for your location. Town search accepts “Demo”; real place searches have no demo matches. The page blocks network connections with its content security policy. No external fonts, scripts, images or map tiles are used.

The map in both versions is a relative coordinate plot, **not a street map**. It scales the loaded pins to fit. Pins may overlap; use List for those records and for records without coordinates. Distance is straight-line distance, not walking or driving distance.

## Test live production locally

**index.html** is the real app. Opening it directly as a file will not load its JavaScript modules. It displays a link to the offline preview instead.

With Python 3 installed, open a terminal in the extracted folder and run:

```sh
python3 serve.py
```

Open http://localhost:8000 in a browser. Press Ctrl+C in the terminal to stop. The server listens only on your computer and does not log requests. If port 8000 is occupied, stop the other server or use `python3 -m http.server 8001 --bind 127.0.0.1` and open http://localhost:8001.

Live production contacts the Food Standards Agency API. A name, town or postcode search works without location permission. Near me requests browser geolocation on click, then sends coordinates to the FSA. Permission refusal leaves manual search available. Full Maps listing links with a business name can be parsed locally; short links need a name added and are not fetched or expanded. Official FSA record links are supported.

Filters and sorting apply to loaded records, not the full national database. Use Load more until all relevant pages are loaded. Scottish Pass ratings are separate from numeric 0–5 ratings. Recent checks disappear on reload. The offline shell loads after one successful online visit, but live searches require internet access; there is no saved-results fallback.

## Deploy to GitHub Pages

Copy the contents of this folder into your repository's Pages publishing folder. All required icons and app files are included; there are no missing vendor dependencies or build steps. Enable Pages from the intended branch and folder. Relative asset links support deployment under a repository subpath. No keys, accounts or backend configuration are needed.

Deploy these files together: index.html, app.js, ui.js, core.js, styles.css, sw.js, manifest.webmanifest and icons/. preview.html, README.md, VALIDATION.md and serve.py can also remain in the public repository. Open the published HTTPS URL and reload once to let the updated service worker take control. Keep the cache version unique whenever changing app assets in future releases.

Nothing in this package publishes or pushes changes automatically.

## Privacy

No personal example names, addresses or postcodes, credentials, secrets, analytics, advertising or telemetry are included. Demo names are explicitly fictional. Production displays public business records received at runtime; they are not embedded in the bundle.

Coordinates, searches, results and recent checks exist only in page memory. There are no localStorage writes, sessionStorage writes or IndexedDB databases. The app removes the old `hygiene-check-v1` storage entry on upgrade because older releases could have saved location queries. The service worker caches only a fixed list of same-origin app files, never API responses or search URLs; it removes older hygiene app caches when activated.

FSA requests explicitly omit credentials, disable HTTP caching and omit the referrer. The FSA receives your search terms and coordinates when used, plus ordinary network metadata such as your IP address. The host receives ordinary requests for app files. Opening an official record takes you to the FSA website. This app cannot control those services' logging policies.

## Data and provenance

Production uses the FSA v2 API: https://api.ratings.food.gov.uk/Help . Contains Food Standards Agency data © Crown copyright under the Open Government Licence v3.0: https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/ . This independent app is not endorsed by the FSA.

The earlier v2 ZIP was unavailable during this rebuild. The compact layout was reconstructed from the recorded v2 specifications, with shared UI code for preview and production. Original app icons and input/rating helpers were retained. The tile-based map was replaced with a dependency-free coordinate plot. This is not a pixel-for-pixel recovery of the missing ZIP.
