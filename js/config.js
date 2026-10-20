// ─────────────────────────────────────────────────────────────
//  Rebrand everything here. No build step: edit, save, refresh.
// ─────────────────────────────────────────────────────────────
export default {
  brand: 'VIRTUAL FUDGE',           // fallback text if the logo can't load
  logo: './assets/logo.png',        // transparent PNG, white "VIRTUAL" for dark backgrounds

  seasonTitle: 'THE SWEETEST SEASON',
  seasonShort: 'VIRTUAL FUDGE',     // printed on the beanie / headband
  seasonStart: '',                  // set a date (e.g. '2026-12-25T00:00:00') to show a live "N DAYS TO GO" countdown
  startLabel: 'HAPPY HOLIDAYS 2026',// shown in the pill when there's no countdown
  liveLabel: "IT'S HERE",           // shown once seasonStart has passed

  hashtag: '#VirtualFudge',
  shareText: 'Got the Virtual Fudge AR treatment 🍫✨ Bespoke AR studio, NYC.',
  shareUrl: '',                     // link added to shares; blank = this page's URL

  ctaLabel: 'Build your AR with Virtual Fudge', // button on the result screen; blank to hide
  ctaUrl: 'https://virtualfudge.com',

  colors: {               // from the Virtual Fudge logo gradient
    primary: '#240D02',   // dark chocolate
    accent: '#AE6B39',    // caramel
    highlight: '#F3D3AC', // light caramel cream (pills, buttons)
    text: '#FFFFFF',
  },

  // Filters, in order. Available: 'vfshades', 'snow', 'mvp', 'gameface', 'shades'
  filters: ['vfshades', 'snow', 'mvp', 'shades'],

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
