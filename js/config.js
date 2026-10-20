// ─────────────────────────────────────────────────────────────
//  Rebrand everything here. No build step: edit, save, refresh.
// ─────────────────────────────────────────────────────────────
export default {
  brand: 'VIRTUAL FUDGE',           // fallback text if a logo can't load
  logo: './assets/logo.png',        // white "VIRTUAL" version, drawn over the camera image
  logoOnPaper: './assets/logo-paper.png', // full-color version for light paper backgrounds
  kicker: 'Bespoke AR Studio',      // small heading above the title (Syncopate Bold)

  seasonTitle: 'The Sweetest Season',
  seasonShort: 'Virtual Fudge',     // printed on the beanie cuff
  seasonStart: '',                  // set a date (e.g. '2026-12-25T00:00:00') to show a live "N days to go" countdown
  startLabel: 'Holiday 2026',       // shown next to the kicker when there's no countdown
  liveLabel: "It's here",           // shown once seasonStart has passed
  intro: 'Try on our holiday AR: fudge shades, a digital twin, a little snow. Snap it, share it.',

  hashtag: '#VirtualFudge',
  website: 'virtualfudge.com',
  shareText: 'Got the Virtual Fudge AR treatment. Bespoke AR studio, NYC.',
  shareUrl: '',                     // link added to shares; blank = this page's URL

  ctaLabel: 'Let’s build yours',    // link on the result screen; blank to hide
  ctaUrl: 'https://virtualfudge.com',

  colors: {               // from the Virtual Fudge brochure + logo
    paper: '#F3F3F3',     // page background
    ink: '#231F20',       // body text, buttons
    brand: '#82563B',     // headings
    accent: '#AE6B39',    // caramel (logo gradient)
    primary: '#240D02',   // dark chocolate (logo gradient)
    highlight: '#F3D3AC', // light caramel cream
    text: '#FFFFFF',      // text over the camera image
  },

  // Filters, in order. Available: 'vfshades', 'wireframe', 'snow', 'cocoa', 'mvp', 'gameface', 'shades'
  filters: ['vfshades', 'wireframe', 'snow', 'cocoa'],

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
