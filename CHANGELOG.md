# Changelog

What changed, day by day (Eastern time). Live: https://vf1-create.github.io/virtualfudge-ar/

## Mon Nov 9
- Booth tablets on patchy venue Wi-Fi: if the QR code part failed to download when the page opened, every guest saw a blank square all day. Now the panel shows the plain link instead, and each new photo retries the download until the QR code appears.

## Fri Nov 6
- Booth tablets added to the home screen (the usual way to run a kiosk full-screen) now reopen in booth mode, not the normal one.
- Booth mode hides the switch-camera button, so a guest can't leave the next one facing the back camera.

## Thu Nov 5
- The "browser too old" check now tests every piece of newer syntax the app uses. Yesterday's version missed one, so iPhones on iOS 13.4–13.7 could still land on a dead start button.

- Tested the way a real iPhone sees the page, with Safari's toolbars taking ~190px. Two presentation fixes came out of it:
  - The result screen's photo, the one people are about to share, gets much more room on shorter iPhones (iPhone 15: 53% to 64% of the width; iPhone SE: 39% to 54%, almost twice the area).
  - On an iPhone SE in Safari the shutter no longer sits over the caption text in the live preview; it shrinks to fit (never below 56px).
- Moving-face test (head drifting and tilting): all four filters kept the face 100% of the time.

- New booth mode for event tablets (`?booth`): guests get a QR code to make their own on their phone instead of Share/Download on the tablet, and the result clears itself for the next guest after 45 s. A review before shipping caught three problems in it, all fixed first (including one that would have hidden the result buttons for normal visitors). Normal visitors are unaffected; 14 new checks.

- Promo kit: a new "Event tablet" card with a QR code and a copy button for the booth-mode link, so staff can set up an event tablet by pointing its camera at the kit.

## Wed Nov 4
- Leaving the page while the self-timer counts down now cancels it. Before, on a computer the countdown kept running while the camera image froze, so it took a photo of a stale frame the visitor never posed for.
- A second review, aimed at all-day booth use, sharing, and first-run errors, found three more bugs; all fixed:
  - In Firefox, a webcam already in use by another app (Teams, Zoom) left visitors stuck on "Warming up the camera" with no way out. They now get the "camera is busy, close other apps" message.
  - Booth tablets could lose their keep-awake lock after a guest shared to another app, then dim and lock between guests. The lock now comes back.
  - If the face-tracking download failed (patchy venue Wi-Fi), tracking stayed off until a page reload and the message blamed the device. Reopening the camera now retries the download, and the message points to the connection.
- Polish from the same review, plus one race found while testing:
  - Copy caption now works in in-app browsers that block the clipboard (older copy method), and as a last resort shows the caption where a long press selects it.
  - A double tap on Download saves one copy, not two.
  - Phones too old to run the app (like iOS 12) get an "update your browser" message instead of a dead start button.
  - Closing the camera while a photo is still being saved no longer pops the result screen up over the start screen.

## Tue Nov 3
- Follow-up review of everything changed since the October audit found six real bugs; all fixed:
  - Pressing the shutter, Space or the self-timer during a video recording now stops the recording instead of photographing over it and corrupting the clip (the worst of the six).
  - Closing the camera while a failing camera switch was in flight could silently reopen the camera behind the start screen; it stays off now.
  - Switching cameras cancels a running self-timer instead of letting it fire into the gap and drop the shot silently.
  - The active filter chip is highlighted again (lost in the accessibility rework; styling and markup disagreed).
  - Promo kit: a link typed with a port, like ar.yourbrand.com:8443, is treated as a link rather than rejected.
  - Offline cache now stores the face-tracking engine variant the device actually uses (older devices got the wrong one).

## Mon Nov 2
- Removed a leftover italic font file nothing used since the Oct 20 restyle; one less file to download and audit.

## Fri Oct 30
- New rebrand test: the site is loaded under a made-up brand and every surface (intro, result screen, share caption, CTA) must follow `config.js`, including sparse configs with no handle or CTA.
- Confirmed the self-hosted server already compresses the big engine download (9.6 MB shrinks ~70%); noted in the Caddyfile why the face model is left uncompressed.
- The three video checks retry with longer clips on slow test machines.

## Thu Oct 29
- iPhone home-screen polish: the icon is labeled "VF AR" and the status bar matches the light page.
- Self-timer test made reliable on slow machines (cancels during the 10-second countdown).

## Wed Oct 28, 2026
- Added this changelog.

## Tue Oct 27
- Promo-kit tests now scan every QR code the kit makes (the download and each poster) and check it opens the live link with the right source tag.

## Mon Oct 26
- Android can install the page to the home screen (192px icon added to the manifest).
- Link previews include the image size and description, so they render right away.
- Self-hosted (Caddy) setup: no other site can frame the camera page.
- README lists the `posterLine` setting.

## Sun Oct 25
- Browser test suite added to the repo (`npm test`): camera flow, keyboard use, nine screen sizes, promo kit, offline cache.
- Automated accessibility scan (WCAG 2.1 AA) of every screen; the promo kit's size picker is now a proper set of toggle buttons.

## Sat Oct 24
- Space and Enter keep taking photos after a filter or the timer was clicked.
- Promo kit: bare domains get `https://`, links that won't work on a phone camera are flagged, Story images stay clear of the app controls, the A4 poster's QR is tagged `src=poster`, and NFC tags can be locked after writing.
- Every audit finding closed (see `docs/audit.md`).

## Fri Oct 23
- Audit fixes saved as a work in progress: holding past the video limit keeps the video, camera start-up and flipping are safer, keyboard and screen-reader support, the Fudge Shades lens fix, and more. Finished and deployed Oct 24.

## Thu Oct 22
- Housekeeping only; no changes to the site.

## Wed Oct 21
- Quality audit: eight focused reviews with independent checks; 69 findings recorded in `docs/audit.md`.

## Tue Oct 20
- Rebranded to Virtual Fudge: logo, colors, and the Fudge Shades filter.
- Restyled in the brochure's look: paper caption strip, Syncopate and Roboto Mono, viewfinder corners.
- Design and ease-of-use pass across phones, tablets and desktops; self-timer, keyboard shortcuts.
- Offline cache for the face-tracking engine, branded 404 page, clearer Share / Save / Retake.
- Live on GitHub Pages, with link previews.

## Mon Oct 19
- First build: a self-hosted AR selfie filter (face tracking on the device, photo and video capture, share sheet, promo kit with QR codes and NFC).
