/**
 * Readable mobile QA checks for DeepClean landing + payment pages.
 * Run: node scripts/mobile-check.mjs
 */
import { chromium, devices } from 'playwright';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
const OUT = process.env.ARTIFACT_DIR || '/opt/cursor/artifacts/mobile-qa';

const viewports = [
  { name: 'iphone-se', device: devices['iPhone SE'] },
  { name: 'iphone-12', device: devices['iPhone 12'] },
  { name: 'iphone-14-pro', device: {
    userAgent: devices['iPhone 13 Pro'].userAgent,
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  }},
  { name: 'iphone-14-pro-max', device: devices['iPhone 14 Pro Max'] },
  { name: 'iphone-landscape', device: {
    userAgent: devices['iPhone 12'].userAgent,
    viewport: { width: 844, height: 390 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true
  }},
  { name: 'desktop', device: {
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false
  }}
];

const pricing = { 1: 15900, 2: 28900, 3: 39900, 4: 49900, 5: 58900 };

function formatCRC(amount) {
  const n = Math.round(Number(amount) || 0);
  const grouped = Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `₡${n < 0 ? '-' : ''}${grouped}`;
}

function fail(results, msg) {
  results.push({ ok: false, msg });
}

function pass(results, msg) {
  results.push({ ok: true, msg });
}

async function checkLanding(page, vp, results) {
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.evaluate(() => window.scrollTo(0, 0));

  const metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    innerWidth: window.innerWidth,
    innerHeight: window.innerHeight
  }));

  if (metrics.scrollWidth <= metrics.clientWidth + 1) {
    pass(results, `${vp.name}: no horizontal overflow at top (${metrics.innerWidth}x${metrics.innerHeight})`);
  } else {
    fail(results, `${vp.name}: horizontal overflow ${metrics.scrollWidth} > ${metrics.clientWidth}`);
  }

  const isMobile = !!vp.device.isMobile;

  if (isMobile) {
    const secondaryHidden = !(await page.locator('.nav-link-secondary').first().isVisible());
    if (secondaryHidden) pass(results, `${vp.name}: secondary nav hidden`);
    else fail(results, `${vp.name}: secondary nav still visible at mobile width`);

    const heroVisible = await page.evaluate(() => {
      const title = document.querySelector('.hero-title');
      const price = document.querySelector('.price');
      const cta = document.querySelector('.cta-buttons .btn-primary');
      const vh = window.innerHeight;
      const fullyIn = (el) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.top >= 0 && r.bottom <= vh + 1 && r.height > 0;
      };
      const near = (el, maxTop) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.top < maxTop && r.bottom > 0;
      };
      return {
        titleIn: fullyIn(title),
        priceIn: fullyIn(price),
        ctaIn: fullyIn(cta) || near(cta, vh + 200),
        ctaFullyIn: fullyIn(cta),
        titleTop: title?.getBoundingClientRect().top ?? null,
        priceTop: price?.getBoundingClientRect().top ?? null,
        ctaTop: cta?.getBoundingClientRect().top ?? null,
        ctaBottom: cta?.getBoundingClientRect().bottom ?? null,
        vh
      };
    });

    if (heroVisible.titleIn && heroVisible.priceIn && heroVisible.ctaIn) {
      pass(results, `${vp.name}: title+price+CTA in first viewport (ctaBottom=${Math.round(heroVisible.ctaBottom)}/${heroVisible.vh}${heroVisible.ctaFullyIn ? '' : ' near'})`);
    } else {
      fail(results, `${vp.name}: conversion content not visible enough ${JSON.stringify(heroVisible)}`);
    }

    const stickyCount = await page.evaluate(() => {
      const ann = getComputedStyle(document.querySelector('.announcement-bar')).position;
      const header = getComputedStyle(document.querySelector('.header')).position;
      return { ann, header };
    });
    if (stickyCount.ann !== 'sticky' && stickyCount.ann !== 'fixed' && stickyCount.header === 'sticky') {
      pass(results, `${vp.name}: only header sticky (${stickyCount.ann}/${stickyCount.header})`);
    } else {
      fail(results, `${vp.name}: sticky chrome unexpected ann=${stickyCount.ann} header=${stickyCount.header}`);
    }

    const fontSize = await page.evaluate(() => {
      const input = document.querySelector('#telefono');
      return input ? parseFloat(getComputedStyle(input).fontSize) : 0;
    });
    if (fontSize >= 16) pass(results, `${vp.name}: input font-size ${fontSize}px >= 16`);
    else fail(results, `${vp.name}: input font-size ${fontSize}px < 16 (iOS zoom risk)`);

    for (const qty of [1, 2, 5]) {
      await page.selectOption('#cantidad', String(qty));
      await page.waitForTimeout(50);
      const texts = await page.evaluate(() => ({
        label: document.querySelector('.summary-product-label')?.textContent?.trim(),
        price: document.querySelector('.summary-product-price')?.textContent?.trim(),
        total: document.querySelector('.summary-total-price')?.textContent?.trim()
      }));
      const expected = formatCRC(pricing[qty]);
      const labelOk = qty === 1
        ? texts.label?.includes('DeepClean')
        : texts.label === `DeepClean × ${qty}`;
      const noBadMultiply = !(texts.price || '').includes(' x ');
      if (labelOk && texts.price === expected && texts.total === expected && noBadMultiply) {
        pass(results, `${vp.name}: qty ${qty} pricing ${expected}`);
      } else {
        fail(results, `${vp.name}: qty ${qty} pricing wrong ${JSON.stringify(texts)} expected ${expected}`);
      }
    }

    await page.locator('#pedido').scrollIntoViewIfNeeded();
    const orderOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
    if (orderOverflow) pass(results, `${vp.name}: no overflow at order form qty5`);
    else fail(results, `${vp.name}: overflow at order form qty5`);

    await page.evaluate(() => window.scrollTo(0, 0));
    const faqBtn = page.locator('#faq-q-1');
    await faqBtn.scrollIntoViewIfNeeded();
    await faqBtn.click();
    await page.waitForTimeout(350);
    const faqState = await page.evaluate(() => {
      const btn = document.getElementById('faq-q-1');
      const ans = document.getElementById('faq-a-1');
      const p = ans?.querySelector('p');
      const r = p?.getBoundingClientRect();
      return {
        expanded: btn?.getAttribute('aria-expanded'),
        answerHeight: r?.height || 0,
        maxHeight: ans ? getComputedStyle(ans).maxHeight : null
      };
    });
    if (faqState.expanded === 'true' && faqState.answerHeight > 40) {
      pass(results, `${vp.name}: FAQ expands (h=${Math.round(faqState.answerHeight)}, max=${faqState.maxHeight})`);
    } else {
      fail(results, `${vp.name}: FAQ expand failed ${JSON.stringify(faqState)}`);
    }

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(100);
  } else {
    const desktopNav = await page.locator('.nav-link-secondary').first().isVisible();
    if (desktopNav) pass(results, `${vp.name}: secondary nav visible`);
    else fail(results, `${vp.name}: secondary nav hidden unexpectedly`);
  }

  await page.screenshot({ path: path.join(OUT, `${vp.name}-home.png`), fullPage: false });
  await page.locator('#pedido').scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(OUT, `${vp.name}-order.png`), fullPage: false });
}

async function checkPaymentPages(browser, results) {
  const context = await browser.newContext({
    ...devices['iPhone 12'],
  });
  const page = await context.newPage();

  await page.goto(`${BASE}/success.html?code=1&orderId=TEST-ORDER-123456789`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const successOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  const wa = page.locator('a[href*="wa.me"]');
  if (successOverflow) pass(results, 'success.html: no horizontal overflow');
  else fail(results, 'success.html: horizontal overflow');
  if (await wa.count()) pass(results, 'success.html: WhatsApp link present');
  else fail(results, 'success.html: WhatsApp link missing');
  await page.screenshot({ path: path.join(OUT, 'iphone-success.png'), fullPage: true });

  await page.goto(`${BASE}/error.html?code=4`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(300);
  const errorOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
  if (errorOverflow) pass(results, 'error.html: no horizontal overflow');
  else fail(results, 'error.html: horizontal overflow');
  await page.screenshot({ path: path.join(OUT, 'iphone-error.png'), fullPage: true });

  await context.close();
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true
  });

  const results = [];

  for (const vp of viewports) {
    const context = await browser.newContext({ ...vp.device });
    const page = await context.newPage();
    try {
      await checkLanding(page, vp, results);
    } catch (err) {
      fail(results, `${vp.name}: crashed ${err.message}`);
    }
    await context.close();
  }

  try {
    await checkPaymentPages(browser, results);
  } catch (err) {
    fail(results, `payment pages: crashed ${err.message}`);
  }

  await browser.close();

  const failed = results.filter(r => !r.ok);
  const passed = results.filter(r => r.ok);

  console.log('\n=== Mobile QA Results ===');
  for (const r of results) {
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.msg}`);
  }
  console.log(`\n${passed.length} passed, ${failed.length} failed`);
  console.log(`Screenshots: ${OUT}`);

  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
