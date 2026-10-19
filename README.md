# Season AR: self-hosted selfie filter promo

A face-tracking AR selfie experience for your season launch, served from your own server.
No app to install, no Meta Spark / Snap / 8th Wall account, no third-party scripts or CDNs, and no tracking you didn't add yourself.

**How fans use it**

1. **Scan** a QR code (post, poster, big screen) or **tap** an NFC tag with their phone.
2. Tap **“Tap to start AR”**. The camera opens in the browser.
3. Pick a filter. **Open your mouth** to fire confetti / snow / stars, **tap the screen** for bursts, **swipe** to change filters.
4. **Tap** the shutter for a photo, **hold** for a video of up to 15s (9:16, ready for Stories, Reels, and TikTok).
5. **Share** opens the phone's native share sheet (Instagram, TikTok, WhatsApp, Messages…), with your hashtag and link in the caption. **Save** downloads it.

All face tracking runs on the device (Google MediaPipe, vendored locally). Nothing is uploaded.

| Filter | What it does | Mouth-open effect |
|---|---|---|
| 🏆 Game Face | Team headband with your season text, eye-black stripes, a star that grows when you smile | Confetti in brand colors |
| ❄️ Snow Day | Knit beanie with pom-pom, rosy cheeks, falling snow | Frosty breath |
| 👑 MVP Crown | Floating gold crown with orbiting sparkles | Gold confetti rain |
| 🕶️ Star Shades | Wobbly star-shaped sunglasses | Star burst |

Every photo and video carries your frame: brand mark, a live **“N DAYS TO GO”** countdown, the season title, the hashtag and the opening date.
Group selfies work too (up to 3 faces by default).

---

## 1. Make it yours (5 minutes)

Edit **`js/config.js`**. There's no build step.

- `brand`, `logo`: text or a transparent PNG in `assets/`
- `seasonTitle`, `seasonShort`, `seasonStart`, `startLabel`: the countdown updates itself daily
- `hashtag`, `shareText`, `shareUrl`, `ctaLabel`/`ctaUrl` (e.g. “Get your tickets” on the result screen)
- `colors`: four hex colors re-theme the filters, frame, UI and posters
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
- **Write NFC tags** straight from Chrome on Android (NTAG213/215 stickers). On iPhone, use the free *NFC Tools* app → Write → URL.
- **Ready-to-post images**: Feed 4:5, Story 9:16 and A4 print posters with your title, countdown, QR and hashtag

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
- Add `?src=debug` to the URL to expose the internal state as `window.__ar` for troubleshooting.
