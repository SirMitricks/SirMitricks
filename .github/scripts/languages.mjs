// Собирает статистику языков по всем публичным репозиториям и рисует assets/languages.svg
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const USER = process.env.GH_USER || 'SirMitricks';
const OUT = process.env.OUT || 'assets/languages.svg';
const TOKEN = process.env.GITHUB_TOKEN;
const TOP = 6;
const BATCH = 6;
// языки, которые не стоит учитывать (через запятую): EXCLUDE="HTML,CSS"
const EXCLUDE = new Set((process.env.EXCLUDE || '').split(',').map((s) => s.trim()).filter(Boolean));

const headers = {
  'User-Agent': 'profile-languages',
  Accept: 'application/vnd.github+json',
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, attempt = 0) {
  const r = await fetch(`https://api.github.com${path}`, { headers });
  if (r.ok) return r.json();
  const limited = r.status === 429 || (r.status === 403 && r.headers.get('x-ratelimit-remaining') === '0');
  if ((limited || r.status >= 500) && attempt < 4) {
    const reset = Number(r.headers.get('x-ratelimit-reset')) * 1000 - Date.now();
    const wait = limited && reset > 0 ? Math.min(reset + 1000, 60_000) : 1000 * 2 ** attempt;
    console.warn(`retry ${attempt + 1} in ${Math.round(wait / 1000)}s: ${r.status} ${path}`);
    await sleep(wait);
    return api(path, attempt + 1);
  }
  throw new Error(`${r.status} ${path}`);
}

async function collect() {
  if (process.env.MOCK) return JSON.parse(process.env.MOCK);
  const names = [];
  for (let page = 1; ; page++) {
    const repos = await api(`/users/${USER}/repos?per_page=100&type=owner&page=${page}`);
    for (const r of repos) {
      if (r.fork || r.archived || r.name === USER) continue;
      names.push(r.name);
    }
    if (repos.length < 100) break;
  }
  const totals = {};
  for (let i = 0; i < names.length; i += BATCH) {
    const chunk = names.slice(i, i + BATCH);
    const results = await Promise.all(chunk.map((n) => api(`/repos/${USER}/${n}/languages`)));
    for (const langs of results) {
      for (const [k, v] of Object.entries(langs)) {
        if (EXCLUDE.has(k)) continue;
        totals[k] = (totals[k] || 0) + v;
      }
    }
  }
  return totals;
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function today() {
  return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date());
}

function render(totals) {
  const sum = Object.values(totals).reduce((a, b) => a + b, 0);
  let list = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  if (list.length > TOP) {
    const rest = list.slice(TOP - 1).reduce((a, [, v]) => a + v, 0);
    list = [...list.slice(0, TOP - 1), ['Другое', rest]];
  }
  const W = 900, X0 = 40, BAR = 820;
  const H = sum ? 150 + list.length * 44 + 10 : 170;
  const summary = sum
    ? 'Языки в репозиториях: ' + list.map(([n, v]) => `${n} ${((v / sum) * 100).toFixed(1)}%`).join(', ')
    : 'Статистика языков пока недоступна';

  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t">
<title id="t">${esc(summary)}</title>
<style>
.bg{fill:#FAF9F5}.ink{fill:#141413}.mut{fill:#83827D}.clay{fill:#D97757}
.ln{stroke:#D8D5C8;stroke-width:1;fill:none}.dot{stroke:#B0AEA5;stroke-width:1.5;stroke-dasharray:1 6;stroke-linecap:round}
.c0{fill:#D97757}.c1{fill:#B85C3D}.c2{fill:#E9A88B}.c3{fill:#83827D}.c4{fill:#B0AEA5}.c5{fill:#D8D5C8}
.serif{font-family:Georgia,"Times New Roman",serif}.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
@media (prefers-color-scheme: dark){.bg{fill:#262624}.ink{fill:#FAF9F5}.mut{fill:#B0AEA5}.ln{stroke:#3D3D3A}.dot{stroke:#5A5954}.c5{fill:#3D3D3A}}
</style>
<rect class="bg" width="${W}" height="${H}" rx="14"/>
<rect class="ln" x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="14"/>
<text class="mono clay" x="40" y="46" font-size="13" letter-spacing="1.5">02</text>
<text class="mono mut" x="72" y="46" font-size="13" letter-spacing="1.5">ЯЗЫКИ В РЕПОЗИТОРИЯХ</text>
<text class="mono mut" x="860" y="46" font-size="13" letter-spacing="1.5" text-anchor="end">${today()}</text>
<line class="ln" x1="40" y1="64" x2="860" y2="64"/>
`;
  if (!sum) {
    out += `<text class="serif mut" x="40" y="118" font-size="22" font-style="italic">Данные появятся после первого запуска Action</text>\n</svg>\n`;
    return out;
  }
  // сегментированная полоса
  out += `<clipPath id="r"><rect x="${X0}" y="88" width="${BAR}" height="12" rx="6"/></clipPath>\n<g clip-path="url(#r)">\n`;
  let x = X0;
  list.forEach(([, v], i) => {
    const w = (v / sum) * BAR;
    out += `<rect class="c${i}" x="${x.toFixed(2)}" y="88" width="${Math.max(w - 2, 1).toFixed(2)}" height="12"/>\n`;
    x += w;
  });
  out += `</g>\n`;
  // строки
  let y = 158;
  list.forEach(([name, v], i) => {
    const pct = ((v / sum) * 100).toFixed(1);
    out += `<rect class="c${i}" x="40" y="${y - 15}" width="12" height="12" rx="3"/>
<text class="serif ink" x="66" y="${y - 3}" font-size="24">${esc(name)}</text>
<line class="dot" x1="270" y1="${y - 8}" x2="770" y2="${y - 8}"/>
<text class="mono ink" x="860" y="${y - 4}" font-size="16" text-anchor="end">${pct}%</text>
`;
    y += 44;
  });
  return out + `</svg>\n`;
}

const svg = render(await collect());
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, svg);
console.log('written', OUT);
