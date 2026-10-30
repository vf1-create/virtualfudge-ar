// Rebranding is the product's core promise ("make it yours in 5 minutes"): swap config.js and
// everything follows. This suite loads the site under a made-up brand and checks each surface.
import { launch, page, open, ready, waitScreen, LAPTOP } from './lib.mjs';

const BRAND = {
  kicker: "'Test Studio'",
  seasonTitle: "'Brand Check'",
  intro: "'Custom intro line.'",
  hashtag: "'#BrandCheck'",
  website: "'brand.example'",
  handle: "'@BrandCheck'",
  shareText: "'Try BrandCheck now'",
  shareUrl: "'https://brand.example/ar'",
  startLabel: "'Spring 2027'",
  ctaLabel: "'Book a demo'",
  ctaUrl: "'https://brand.example/book'",
};

const withConfig = (p, config) => p.route('**/js/config.js', async (r) => {
  const res = await r.fetch(); let body = await res.text();
  for (const [k, v] of Object.entries(config)) body = body.replace(new RegExp(`(\\n\\s*${k}:\\s*)('[^']*'|[^,\\n]+)`), `$1${v}`);
  r.fulfill({ response: res, body, contentType: 'text/javascript' });
});

export default async function (check) {
  const b = await launch();
  try {
    { // a full custom brand flows through the intro, the result screen and the share caption
      const p = await page(b, LAPTOP);
      await withConfig(p, BRAND);
      await open(p); await p.waitForTimeout(800);
      const intro = await p.evaluate(() => ({
        title: document.querySelector('#intro h1').textContent,
        kicker: document.querySelector('.kicker [data-text="kicker"]').textContent,
        countdown: document.querySelector('#countdown').textContent,
        lede: document.querySelector('.lede').textContent,
        tag: document.querySelector('#intro .tag').textContent,
      }));
      check('intro shows the configured brand', intro.title === 'Brand Check' && intro.kicker === 'Test Studio' && intro.lede === 'Custom intro line.', JSON.stringify(intro));
      check('intro shows the configured season label', intro.countdown === 'Spring 2027', intro.countdown);
      check('intro tag line uses the configured hashtag and site', intro.tag.includes('#BrandCheck') && intro.tag.includes('brand.example'), intro.tag);
      await p.click('#startBtn', { force: true }); await ready(p);
      await p.click('#shutter'); await waitScreen(p, 'result'); await p.waitForTimeout(300);
      const result = await p.evaluate(() => ({
        tagLine: document.querySelector('#tagLine').textContent,
        ctaHidden: document.querySelector('#cta').hidden,
        ctaText: document.querySelector('#cta').textContent,
        ctaHref: document.querySelector('#cta').href,
      }));
      check('result asks for the configured handle', result.tagLine === 'Tag @BrandCheck when you post', result.tagLine);
      check('result CTA uses the configured label and link', !result.ctaHidden && result.ctaText === 'Book a demo →' && result.ctaHref === 'https://brand.example/book', JSON.stringify(result));
      await p.click('#copyBtn');
      const caption = await p.evaluate(() => navigator.clipboard.readText());
      check('share caption is the configured text, hashtag and link', caption === 'Try BrandCheck now #BrandCheck https://brand.example/ar', caption);
      check('brand flow: no page errors', !p.errs.length, p.errs.join(' | '));
      await p.context().close();
    }
    { // a sparse config (no handle, no CTA) falls back instead of breaking
      const p = await page(b, LAPTOP);
      await withConfig(p, { handle: "''", ctaLabel: "''", hashtag: "'#JustATag'" });
      await open(p); await p.waitForTimeout(800);
      const r = await p.evaluate(() => ({ tagLine: document.querySelector('#tagLine').textContent, ctaHidden: document.querySelector('#cta').hidden }));
      check('no handle: result falls back to the hashtag', r.tagLine === 'Post it with #JustATag', r.tagLine);
      check('no CTA configured: the CTA stays hidden', r.ctaHidden, JSON.stringify(r));
      check('sparse config: no page errors', !p.errs.length, p.errs.join(' | '));
      await p.context().close();
    }
  } finally { await b.close(); }
}
