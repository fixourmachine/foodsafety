# Release validation

Checked 6 October 2026.

- JavaScript syntax: production modules, service worker and inline preview script pass.
- Chromium, direct file URL: preview renders and its search, simulated Near me, radius changes, numeric and Scottish ratings, business-type filters, name/rating ordering, reset, list/map switching, pin details and recent-clear controls pass.
- Preview network audit: zero HTTP/HTTPS requests throughout these interactions. Real geolocation was replaced with a throwing test stub; no calls occurred. A restrictive content security policy independently blocks connections.
- Responsive checks at 320, 375, 414, 768 and 1280 CSS pixels: no horizontal page overflow; filter dialogs stay within the viewport. Screenshots inspected, including long nonnumeric rating labels.
- Production browser checks: FSA request construction and version header, click-triggered location, permission-denied fallback, pagination, service-unavailable recovery and session reset pass.
- A real generic business search succeeds in the browser against the FSA, including CORS. No personal coordinates were sent during live testing; geolocation tests used intercepted responses.
- Service worker: app shell survives offline reload. Cache entries contain only fixed same-origin app resources, no query strings or API responses. localStorage remains empty. Live ratings intentionally require a connection.
- Exact distributable: scanned text files for personal identifiers, email addresses, postcode examples, private paths, common secret formats, tracking endpoints and persistence writes. No findings. PNG textual metadata is stripped. ZIP integrity and byte equality are verified, and the extracted preview is retested.

Limits: Chromium desktop automation with mobile viewport sizes is not a physical iPhone/Safari installation test. This is a reconstruction of the unavailable earlier v2 package. Map view is a relative coordinate plot without streets or tiles. Pattern scanning cannot mathematically prove the absence of every possible secret; the small, explicit file list and all first-party code were also reviewed. No GitHub push or deployment was performed.
