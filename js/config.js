// ─────────────────────────────────────────────────────────────
//  Rebrand everything here. No build step: edit, save, refresh.
// ─────────────────────────────────────────────────────────────
export default {
  brand: 'VIRTUAL FUDGE',           // small text at the top of the frame
  logo: null,                       // optional: './assets/logo.png' (transparent PNG, wide)

  seasonTitle: 'THE SEASON STARTS NOW',
  seasonShort: "SEASON '26",        // printed on the beanie / headband
  seasonStart: '2026-11-14T19:00:00', // drives the live "N DAYS TO GO" countdown
  startLabel: 'OPENING NIGHT · NOV 14',
  liveLabel: "IT'S GAME TIME",      // shown once seasonStart has passed

  hashtag: '#SeasonReady',
  shareText: 'Ready for the new season 🔥',
  shareUrl: '',                     // link added to shares; blank = this page's URL

  ctaLabel: 'Get your tickets',     // button on the result screen; blank to hide
  ctaUrl: 'https://example.com',

  colors: {
    primary: '#0B1B3F',   // deep base color
    accent: '#3BD5FF',    // bright pop color
    highlight: '#FFC93C', // second pop color (gold)
    text: '#FFFFFF',
  },

  // Filters, in order. Available: 'snow', 'mvp', 'gameface', 'shades'
  filters: ['gameface', 'snow', 'mvp', 'shades'],

  output: { width: 1080, height: 1920 }, // 9:16 = Stories / Reels / TikTok. Use 720x1280 for older phones.
  maxVideoSeconds: 15,
  maxFaces: 3,                           // group selfies welcome

  // Analytics hook, called for start / filter / photo / video / share / save / cta.
  // Wire to your own self-hosted analytics (Plausible, Umami, Matomo…) or leave as-is.
  // `data.src` comes from ?src=… in the URL, e.g. ?src=qr-poster or ?src=nfc-booth
  track(event, data) {
    // console.debug('[track]', event, data);
  },
};
