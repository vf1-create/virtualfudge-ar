# Virtual Fudge AR: "The Sweetest Season" selfie filter

**Live:** https://vf1-create.github.io/virtualfudge-ar/ · **Promo kit:** https://vf1-create.github.io/virtualfudge-ar/tools/kit.html

A face-tracking AR selfie experience for the Virtual Fudge holiday season, served from your own hosting.
No app to install, no Meta Spark / Snap / 8th Wall account, no third-party scripts or CDNs, and no tracking you didn't add yourself.

**How fans use it**

1. **Scan** a QR code (post, poster, big screen) or **tap** an NFC tag with their phone.
2. Tap **“Open the camera”**. The camera opens in the browser.
3. Pick a filter. **Open your mouth** for the filter's effect, **tap the screen** for a burst, **swipe** to change filters.
4. **Tap** the shutter for a photo, **hold** for a video of up to 15s (1080 × 1920, ready for Stories, Reels and TikTok).
   The **timer** button (top right) gives a 3 or 10 second countdown for group shots and tablets on stands.
5. **Share** opens the phone's share sheet (Instagram, TikTok, WhatsApp, Messages…) with the caption, `#VirtualFudge` and the link. On computers it's **Download** + **Copy caption**.

All face tracking runs on the device (Google MediaPipe, vendored locally). Nothing is uploaded.

| Filter | What it does | Mouth-open effect |
|---|---|---|
| Fudge Shades | The Virtual Fudge logo as wearable AR: striped fudge-bar shades with live drips, framed by viewfinder corners | Fudge shower; the drips stretch |
| Wireframe | The face as a live 3D mesh with a scan line sweeping down, like the wireframes in the brochure | Pixel scatter |
| Snow Day | Chocolate knit beanie with a cream "Virtual Fudge" cuff, falling snow | Frosty breath |
| Cocoa Snow | No props: a warm cream grade, soft vignette and slow snow | Snow burst |

Every photo and video is laid out like a page of the Virtual Fudge brochure: the camera image with viewfinder corners, on a paper caption strip with the kicker, the title in Syncopate, `#VirtualFudge · virtualfudge.com` in Roboto Mono and the full-color logo. Fonts are self-hosted in `vendor/fonts` (SIL Open Font License). Older filters (MVP Crown, Star Shades, Game Face) are still in the code; add their ids to `filters` to use them.
Group selfies work too (up to 3 faces by default).

**Built for every screen:** on phones the filter chips float just above the caption strip and the shutter sits under it; on laptops, desktops, tablets in landscape and phones held sideways the controls move to a rail beside the photo. Hints never cover the face or the caption. Keyboard: **Space** or **Enter** = photo, **V** = start/stop a video, **← →** = filters, **Esc** = back. The screen stays awake while the camera is open, and slow devices automatically drop to 720p.

---

## 1. Make it yours (5 minutes)

Edit **`js/config.js`**. There's no build step.

- `brand`, `logo` (white, over the photo), `logoOnPaper` (full color), `kicker`, `intro`, `handle`, `website`
- `seasonTitle`, `seasonShort`, `seasonStart`, `startLabel`: the countdown updates itself daily
- `hashtag`, `shareText`, `shareUrl`, `ctaLabel`/`ctaUrl` (e.g. “Get your tickets” on the result screen)
- `colors`: paper, ink, brand brown and the logo's caramel/chocolate re-theme the filters, frame, UI and posters
- `filters`: choose and reorder filters
- `output`: 1080×1920 by default; use 720×1280 if you're targeting older phones

Also update the `<meta property="og:…">` tags in `index.html` (and replace `assets/og.png`) so link previews look right.

## 2. Try it locally

```bash
node serve.mjs            # http://localhost:8080 (camera works on localhost)
node serve.mjs --https    # https://<your-LAN-IP>:8443 to test on your phone over Wi-Fi
```

`--https` makes a throwaway self-signed certificate (needs `openssl`). Your phone will warn about it; tap *Advanced → Proceed*.
Browsers only allow the camera on `https://` or `localhost`.

### Run the tests

Sixty browser checks cover the camera flow, keyboard use, nine screen shapes from iPhone SE to a 1080p desktop, the promo kit and the offline cache. They drive a headless Chrome with a fake webcam.

```bash
npm install && npx playwright install chromium   # once
npm run camera -- path/to/portrait.jpg           # once: any front-facing face photo becomes the fake webcam (needs ffmpeg)
npm test                                         # everything, about 4 minutes
npm test -- kit devices                          # just some suites: app, devices, kit, offline
```

Screenshots of every screen and device, the posters and a sample clip land in `tests/out/`. Run the tests before deploying a change.

## 3. Host it

It's a plain static folder (about 23 MB, mostly the face-tracking engine), so any HTTPS host works.

**Your own server (Docker + automatic HTTPS):**

```bash
# point DNS for ar.yourbrand.com at the server first
DOMAIN=ar.yourbrand.com docker compose up -d --build
```

Caddy fetches and renews the TLS certificate automatically and serves the right MIME types (`.wasm`, `.mjs`).

**Other options:** copy the folder to any web server (nginx/Apache with HTTPS), S3 + CloudFront, Cloudflare Pages, Netlify, or GitHub Pages.
Make sure `.wasm` is served as `application/wasm` (most hosts do this already).

## 4. Promo kit: QR codes, NFC tags, social posts

Open **`/tools/kit.html`** on your deployed site:

- **QR code PNG** for any channel, tagged with a `src` (e.g. `?src=poster`) so you can see which channel works
- **Write NFC tags** straight from Chrome on Android (NTAG213/215 stickers), then **lock** them so nobody can rewrite a public tag. On iPhone, use the free *NFC Tools* app → Write → URL, then Other → Lock tag.
- **Ready-to-post images**: Feed 4:5, Story 9:16 (kept clear of the story controls) and A4 print posters with your title, season label, QR and hashtag. The A4 poster tags its QR `src=poster` automatically; the body line comes from `posterLine` in `config.js`.
- Type a bare domain and the kit adds `https://`; anything that won't work on a phone camera (plain http, or a link too long for a QR) is flagged and the downloads stay off until it's fixed.

Ideas: put the Story image up with a link sticker; put NFC stickers on table tents, wristbands or the ticket booth; show the poster QR on the venue big screen at halftime.

## 5. Analytics (optional, still self-hosted)

`config.track(event, data)` fires on `start`, `filter`, `photo`, `video`, `save`, `share` and `cta`. `data.src` tells you which QR or NFC tag the visit came from.
Forward it to your self-hosted Plausible / Umami / Matomo, for example:

```js
track(event, data) { window.umami?.track(event, data); }
```

---

## Notes and limits

- **Browsers:** iOS Safari 15+, Chrome/Samsung Internet on Android, and desktop Chrome/Edge/Safari/Firefox.
  On desktop, the start screen shows a QR code so visitors can switch to their phone.
- **Video format:** MP4 where the browser can record it (Safari, current Chrome); otherwise WebM.
  Instagram and TikTok accept MP4. If a browser can only record WebM, people can still post the photo.
- **In-app browsers** (opening the link inside Instagram/TikTok) sometimes block the camera.
  The camera-error message tells people to open the link in their browser. A link in your bio or Story usually opens fine.
- **Licensing:** MediaPipe and its face model are Apache-2.0; `qrcode-generator` is MIT. Both are in `vendor/`.
- **Files:** `js/app.js` (camera, capture, sharing) · `js/effects.js` (filters + particles; add your own by copying one) · `js/frame.js` (branded overlay) · `tools/kit.html` (promo kit)
- **Caching:** `sw.js` caches the face-tracking engine, model and fonts after the first visit (repeat visits start instantly). App files always load fresh. If you replace anything in `vendor/`, bump `CACHE` in `sw.js`.
- **404 page:** `404.html` uses `/virtualfudge-ar/` paths for GitHub Pages; change them if you host at a domain root.
- Add `?src=debug` to the URL to expose the internal state as `window.__ar` for troubleshooting.
