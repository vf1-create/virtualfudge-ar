# Changelog

What changed, day by day (Eastern time). Live: https://vf1-create.github.io/virtualfudge-ar/

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
