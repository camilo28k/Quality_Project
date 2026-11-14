// Convierte Markdown a PDF con estilo de marca TiendApp.
// Uso (desde frontend/): node scripts/render-pdf.mjs ../docs/Informe_Final.md ../docs/Informe_Final.pdf [compact]
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { marked } from 'marked';

const [input, output, compact] = process.argv.slice(2);
const { chromium } = createRequire(import.meta.url)('@playwright/test');

let md = readFileSync(input, 'utf8')
  .replace(/^> \*\*Borrador\.\*\*.*$/m, '') // la nota de borrador no va al PDF
  .replace(/^> Borrador en Markdown.*$/m, '')
  .replace(/- \[ \]/g, '- ☐');
const body = marked.parse(md, { breaks: true });
const size = compact ? '8.3pt' : '10pt';
const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
@page { size: A4; margin: ${compact ? '9mm 11mm' : '18mm 16mm'}; }
body { font-family: Inter, 'Segoe UI', Arial, sans-serif; font-size: ${size}; line-height: ${compact ? 1.3 : 1.42}; color: #1E293B; }
h1 { font-size: ${compact ? '15pt' : '20pt'}; color: #0F766E; border-bottom: 3px solid #F59E0B; padding-bottom: 4px; margin: 0 0 8px; }
h2 { font-size: ${compact ? '11.5pt' : '13.5pt'}; color: #0F766E; margin: ${compact ? '10px' : '18px'} 0 6px; break-after: avoid; }
h3 { font-size: 11pt; margin: 12px 0 4px; break-after: avoid; }
p, li { margin: 3px 0; }
table { border-collapse: collapse; width: 100%; margin: 6px 0 10px; font-size: ${compact ? '7.6pt' : '8.8pt'}; break-inside: auto; }
tr { break-inside: avoid; }
th { background: #0F766E; color: #fff; text-align: left; padding: 4px 6px; }
td { border-bottom: 1px solid #E2E8F0; padding: 3px 6px; vertical-align: top; }
tr:nth-child(even) td { background: #F8FAFC; }
code { font-family: Consolas, monospace; font-size: 0.9em; background: #F1F5F9; padding: 0 3px; border-radius: 3px; }
blockquote { border-left: 3px solid #F59E0B; margin: 6px 0; padding: 2px 10px; color: #475569; }
hr { border: 0; border-top: 1px solid #CBD5E1; margin: 10px 0; }
strong { color: #0F172A; }
</style></head><body>${body}</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html, { waitUntil: 'load' });
await page.pdf({
  path: output,
  format: 'A4',
  printBackground: true,
  displayHeaderFooter: !compact,
  headerTemplate: '<span></span>',
  footerTemplate: '<div style="font-size:7pt;color:#64748B;width:100%;text-align:center;font-family:Arial">TiendApp · Calidad de Software · CORHUILA · <span class="pageNumber"></span>/<span class="totalPages"></span></div>',
  margin: compact ? undefined : { top: '16mm', bottom: '18mm', left: '16mm', right: '16mm' },
});
await browser.close();
console.log('ok', output);
