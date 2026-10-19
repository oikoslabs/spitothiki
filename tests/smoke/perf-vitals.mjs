// Web vitals on a throttled phone (4x CPU, slow 4G): LCP, CLS, and interaction latency for menu, menu item, quick action.
// Usage: WEB_VITALS=/path/web-vitals.iife.js node tests/smoke/perf-vitals.mjs <url> [runs]
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const [url = 'http://127.0.0.1:8080/', runs = '3'] = process.argv.slice(2);
const wv = readFileSync(process.env.WEB_VITALS, 'utf8');
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: true });
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const all = [];
for (let r = 0; r < Number(runs); r++) {
  const ctx = await browser.createBrowserContext(); const page = await ctx.newPage();
  await page.setUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36');
  await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true });
  const cdp = await page.createCDPSession();
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.CPU || 4) });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
  await page.evaluateOnNewDocument(`${wv}; window.__v = { inp: [] }; webVitals.onLCP((m) => { __v.lcp = m.value; __v.lcpRD = m.attribution?.elementRenderDelay; }, { reportAllChanges: true }); webVitals.onCLS((m) => { __v.cls = m.value; __v.clsT = m.attribution?.largestShiftTarget; }, { reportAllChanges: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.interactionId) __v.inp.push({ t: e.target?.className || e.target?.tagName, d: e.duration }); }).observe({ type: 'event', durationThreshold: 16, buffered: true });`.replace('webVitals.onLCP', 'webVitals.onLCP'));
  await page.goto(url, { waitUntil: 'networkidle0' });
  if (r === 0 || true) { await page.evaluate(() => { localStorage.clear(); localStorage.setItem('spitothiki:onboarded', '1'); location.hash = '#settings'; }); await page.reload({ waitUntil: 'networkidle0' });
    await page.evaluate(() => { document.querySelectorAll('details').forEach((d) => { d.open = true; }); document.querySelector('[data-action="load-demo"]').click(); });
    await new Promise((x) => setTimeout(x, 500)); await page.evaluate(() => document.querySelector('.confirm-dialog[open] .button-primary, .confirm-dialog[open] [data-confirm]')?.click());
    await page.evaluate(() => { location.hash = '#overview'; }); await page.reload({ waitUntil: 'networkidle0' }); }
  await new Promise((x) => setTimeout(x, 800));
  const lat = {};
  const tap = async (key, sel) => { await page.evaluate(() => { __v.inp = []; }); await page.tap(sel); await new Promise((x) => setTimeout(x, 900)); lat[key] = Math.max(0, ...(await page.evaluate(() => __v.inp.map((e) => e.d)))); };
  await tap('menuButton', '.topbar .menu-button');
  await tap('menuItem', '#menu-list .menu-item[data-view="pantry"] span:last-child');
  await tap('menuButton2', '.topbar .menu-button');
  await tap('menuItemHome', '#menu-list .menu-item[data-view="overview"] span:last-child');
  await tap('quickAction', '#home-quick .quick-action[data-quick="list"]');
  const v = await page.evaluate(() => ({ lcp: __v.lcp, lcpRD: __v.lcpRD, cls: __v.cls, clsT: __v.clsT }));
  all.push({ ...v, ...lat }); await ctx.close();
}
const keys = ['lcp', 'lcpRD', 'cls', 'menuButton', 'menuItem', 'menuButton2', 'menuItemHome', 'quickAction'];
const out = Object.fromEntries(keys.map((k) => [k, Math.round(med(all.map((a) => a[k] || 0)) * 1000) / 1000]));
out.clsTarget = all.map((a) => a.clsT).find(Boolean) || '';
console.log(JSON.stringify(out));
await browser.close();
