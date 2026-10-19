import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const p = await b.newPage(); await p.setViewport({ width: 900, height: 1200 });
const page = (body) => `<html><body style="font:28px Arial;padding:50px;line-height:1.5;background:#fff">${body}</body></html>`;
await p.setContent(page('<b>ΠΡΩΙΝΟ (08:00)</b><br>- 1 φέτα ψωμί ολικής με τυρί κρέμα<br>- 1 γιαούρτι με μέλι και καρύδια<br><br><b>ΣΝΑΚ (11:00)</b><br>- 1 μήλο<br>- 1 μπανάνα'));
await p.screenshot({ path: 'tests/fixtures/diet-front.png' });
await p.setContent(page('<b>ΣΝΑΚ (11:00)</b><br>- 10 αμύγδαλα<br><br><b>ΒΡΑΔΙΝΟ (21:00)</b><br>- σαλάτα με τόνο και ψωμί<br>- ομελέτα με λαχανικά'));
await p.screenshot({ path: 'tests/fixtures/diet-back.png' });
await b.close();
