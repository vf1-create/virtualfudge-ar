# Quality audit, October 2026

Eight reviewers each read the whole app with one focus (logic, iPhone/iPad, Android and other browsers, face effects, accessibility, performance, security and deployment, the promo kit). Every finding was then handed to up to three independent checkers who tried to reproduce it on real browser builds; findings most checkers could not reproduce were dropped.

**69 findings kept** (3 high, 22 medium, 44 low). The checking pass stopped early at a usage limit, so the later areas are marked "not checked yet".

## App logic

| # | Severity | Finding | Checked | Status |
|---|---|---|---|---|
| logic#1 | high | Holding the shutter past the video cap swaps the recorded video for a still photo when the finger lifts | confirmed by 3 of 3 | Open |
| logic#2 | medium | Leaving the tab or app for a few seconds permanently drops output to 720p on fast devices | confirmed by 3 of 3 | Open |
| logic#4 | medium | Overlapping startCamera() calls leak a live camera stream and an extra wake lock | confirmed by 3 of 3 | Open |
| logic#6 | low | Closing the camera (Esc or track 'ended') during a recording orphans the MediaRecorder, leading to a result screen over the intro and a dead preview after Retake | confirmed by 2 of 3 | Open |
| logic#7 | medium | The shutter cannot be activated from the keyboard | confirmed by 3 of 3 | Open |
| logic#8 | low | After a mouse click on a chip or the timer, Space and Enter stop taking photos and re-trigger that button instead | confirmed by 2 of 3 | Open |
| logic#9 | medium | On desktops with two cameras, 'Switch camera' reopens the same camera but un-mirrors it and turns off the face hints | confirmed by 3 of 3 | Open |
| logic#10 | low | If the self-timer ends during the user's cancel tap, a second hidden countdown starts and takes another photo | confirmed by 2 of 3 | Open |
| logic#11 | low | The face-tracking failure toast fires at page load on the intro instead of in the camera view | confirmed by 2 of 3 | Open |
| logic#12 | low | A double tap on Share falls into the error path and downloads the file unexpectedly | confirmed by 3 of 3 | Open |

## iPhone and iPad

| # | Severity | Finding | Checked | Status |
|---|---|---|---|---|
| ios#3 | low | Camera-denied help tells iOS users to tap “aA”, which iOS 18 Safari no longer has and Chrome/Firefox on iOS never had | confirmed by 2 of 3 | Open |
| ios#4 | low | Promo kit: tapping the URL field or Source picker on iPhone zooms the page in, and it stays zoomed | confirmed by 2 of 3 | Open |

## Android, desktop and other browsers

| # | Severity | Finding | Checked | Status |
|---|---|---|---|---|
| android-other#1 | medium | On desktops with 2+ cameras, 'Switch camera' reopens the same webcam and only switches mirroring off | confirmed by 3 of 3 | Open |
| android-other#2 | medium | Shutter can't be operated from the keyboard, and Space stops taking photos after a mouse click on a chip or the timer | confirmed by 3 of 3 | Open |
| android-other#3 | medium | Android in-app browsers (Instagram/Facebook/TikTok WebView): 'Download' saves nothing but still shows a 'Saved.' toast | confirmed by 2 of 3 | Open |
| android-other#5 | low | Firefox (desktop and Android) WebM clips are labelled 'ready for Stories & Reels' | confirmed by 2 of 3 | Open |

## Face effects and caption

| # | Severity | Finding | Checked | Status |
|---|---|---|---|---|
| effects#1 | high | Fudge Shades lens clip uses mixed winding, so the left lens has a hole under the bridge and the lenses leave a gap where they overlap | confirmed by 3 of 3 | Open |
| effects#2 | medium | facePose picks the axis direction from the sign of the cheek vector, so heads rolled past 90° get props drawn upside-down or flipping every frame | confirmed by 3 of 3 | Open |
| effects#4 | low | Snowfall never trims flakes, so Snow Day keeps Cocoa Snow's 140 flakes after switching back | confirmed by 2 of 3 | Open |
| effects#5 | low | countdownLabel parses seasonStart without validation: date-only strings are read as UTC, and unparseable strings print 'NaN days to go' into every photo | confirmed by 2 of 3 | Open |
| effects#7 | low | The brand fallback text documented in config is never drawn, so a missing or blocked logo leaves photos unbranded | confirmed by 2 of 3 | Open |

## Accessibility and ease of use

| # | Severity | Finding | Checked | Status |
|---|---|---|---|---|
| a11y-ux#1 | high | Shutter cannot be operated by keyboard or by assistive tech that sends a click; video recording needs a pointer | confirmed by 3 of 3 | Open |
| a11y-ux#2 | medium | Self-timer countdown digits (and the filter-name label) are never visible when reduced motion is on | confirmed by 3 of 3 | Open |
| a11y-ux#3 | medium | No focus management when screens switch: focus drops to <body>, the result isn't announced, and the first Tab on the camera skips the top controls | confirmed by 2 of 3 | Open |
| a11y-ux#5 | medium | Pressing Escape (Close) while 'Warming up the camera…' returns to the intro, but the camera and render loop then start in the background | confirmed by 3 of 3 | Open |
| a11y-ux#6 | medium | A failed 'Switch camera' leaves the user on a frozen AR screen with no message; the error goes into the hidden intro | confirmed by 3 of 3 | Open |
| a11y-ux#7 | medium | Viewport disables pinch-zoom (user-scalable=no) on Android browsers where the intro and result text is 10.5-12.5px | confirmed by 2 of 3 | Open |
| a11y-ux#8 | medium | Muted text colour is 4.45:1 on paper (below 4.5:1) and is used for small 10.5-12.5px copy | confirmed by 2 of 3 | Open |
| a11y-ux#9 | low | Filter 'tablist' doesn't behave like tabs: arrow keys change the selection without moving focus, all tabs are tab stops, and there is no tabpanel or vertical support | confirmed by 2 of 3 | Open |
| a11y-ux#10 | low | Keyboard focus ring on filter chips is clipped at the top and bottom by the scrolling strip | confirmed by 2 of 3 | Open |
| a11y-ux#11 | low | Result screen tab order doesn't match the visual order: the primary Share/Download button is visually first but last in Tab order | confirmed by 2 of 3 | Open |
| a11y-ux#12 | low | Space or Enter during 'Warming up the camera…' takes a blank black photo and jumps to the result screen | confirmed by 2 of 3 | Open |
| a11y-ux#14 | low | Self-timer badge text (white 10px on caramel) is 4.23:1, below AA | confirmed by 2 of 3 | Open |
| a11y-ux#15 | low | Result video loops forever with no pause control and has no accessible name | confirmed by 2 of 3 | Open |
| a11y-ux#16 | low | Screen readers keep reading 'Warming up the camera…' after loading, and the face-guidance hints are never announced | confirmed by 3 of 3 | Open |
| a11y-ux#18 | low | Camera-denied help text points iOS Chrome/Firefox/Edge users to Safari's 'aA' menu, which those browsers don't have | confirmed by 3 of 3 | Open |
| a11y-ux#19 | low | 'Save' shows 'Saved.' immediately, even though on iOS Safari the file hasn't been saved yet and doesn't go to Photos | confirmed by 3 of 3 | Open |
| a11y-ux#20 | low | At high browser zoom the result photo collapses to 0×0 in the landscape grid | confirmed by 3 of 3 | Open |

## Performance

| # | Severity | Finding | Checked | Status |
|---|---|---|---|---|
| perf#1 | medium | A short tab or app switch permanently drops output to 720p on any device | confirmed by 2 of 2 | Open |
| perf#3 | medium | Render loop redraws the full 1080x1920 frame on every vsync, not at the camera rate (3-4 redraws per frame on 90/120 Hz phones) | not checked yet | Open |
| perf#4 | medium | Following the README to bump CACHE does not refresh vendor files on the Caddy/Docker deployment (immutable HTTP cache + SW fetch with default cache mode) | not checked yet | Open |
| perf#5 | medium | Wireframe strokes every interior mesh edge twice: the tessellation list has 2556 entries but only 1322 unique edges | not checked yet | Open |
| perf#6 | low | Intro torus animation forces a style recalc and layout on every frame, and its rAF loop never stops | not checked yet | Open |
| perf#7 | low | Roboto Mono 400 and 500 are the same variable-font file under two URLs, so every visitor downloads it twice | not checked yet | Open |
| perf#8 | low | Phones download and run desktop-only assets: qrcode.js (56.7 KB, parser-blocking) and the hidden print-preview mark.png | not checked yet | Open |
| perf#9 | low | After Retake, the previous result video keeps looping and decoding inside the hidden #result screen | not checked yet | Open |
| perf#10 | low | The first detectForVideo call (lazy GPU shader and delegate warm-up) freezes the live preview right after the camera opens | not checked yet | Open |
| perf#11 | low | Promo kit redraws the full poster (resizing an A4 canvas) synchronously on every keystroke | not checked yet | Open |

## Security and deployment

| # | Severity | Finding | Checked | Status |
|---|---|---|---|---|
| security-deploy#1 | medium | Bumping CACHE in sw.js does not pick up replaced vendor files: the service worker refills its new cache from the HTTP cache, and the Caddyfile marks unversioned /vendor/* as immutable for a year | not checked yet | Open |
| security-deploy#2 | medium | serve.mjs certs/ (and node_modules/) protection is case-sensitive, so /CERTS/key.pem serves the TLS private key on macOS and Windows | not checked yet | Open |
| security-deploy#3 | low | A long query string crashes app.js at load on desktop: the desktop QR reflects location.href unbounded and the qrcode overflow is not caught | not checked yet | Open |
| security-deploy#4 | low | serve.mjs crashes on any malformed percent-escape or %00 in the URL (unhandled throw in the request handler) | not checked yet | Open |
| security-deploy#5 | low | Docker/Caddy image ships 404.html but the Caddyfile never serves it, and its hard-coded /virtualfudge-ar/ paths would break at the domain root this image serves | not checked yet | Open |
| security-deploy#6 | low | First visit caches only the model: the 9.5 MB wasm, vision bundle and fonts load before the service worker controls the page | not checked yet | Open |
| security-deploy#7 | low | Promo-kit NFC flow writes public tags in a rewritable state, so anyone with a free NFC app can repoint booth tags to another URL | not checked yet | Open |

## Promo kit

| # | Severity | Finding | Checked | Status |
|---|---|---|---|---|
| kit#1 | medium | Saved 'kit-url' overrides the page's own default, so a second project on the same origin gets the first project's link | not checked yet | Open |
| kit#2 | medium | A single long word in the title runs off the poster | not checked yet | Open |
| kit#3 | low | Live countdown is frozen into the print and social images | not checked yet | Open |
| kit#4 | low | Text that does not parse as a URL (e.g. a bare domain) is silently swapped for the kit's own host | not checked yet | Open |
| kit#5 | low | Source tag defaults to ig-post for every poster size, so A4 print scans are counted as Instagram | not checked yet | Open |
| kit#6 | low | The Story 9:16 layout puts the call-to-action and QR under Instagram/TikTok story controls | not checked yet | Open |
| kit#7 | low | Downloaded QR PNG has only a 2-module quiet zone | not checked yet | Open |
| kit#8 | low | 'Copied ✓' label never resets, and copy failures are silent | not checked yet | Open |
| kit#9 | low | A URL too long for a QR code throws an uncaught error and leaves the old QR in place for download | not checked yet | Open |
| kit#10 | low | URL field and select are 13.5px, so iPhone Safari zooms the page on focus | not checked yet | Open |
| kit#11 | low | Blob URL is revoked 5s after the click, which can break the download on iOS Safari | not checked yet | Open |
| kit#12 | low | Tapping 'Write link to NFC tag' again shows a failure while the new write is still waiting | not checked yet | Open |
| kit#13 | low | Poster body copy says 'holiday' regardless of the configured campaign | not checked yet | Open |
| kit#14 | low | The '→' in 'Scan to try →' is drawn in a fallback font, not Roboto Mono | not checked yet | Open |
