// Собирает статистику языков по всем твоим публичным репозиториям и рисует assets/languages.svg
import { writeFileSync } from 'node:fs';

const USER = process.env.GH_USER || 'SirMitricks';
const OUT = process.env.OUT || 'assets/languages.svg';
const TOKEN = process.env.GITHUB_TOKEN;
const TOP = 6;

const headers = {
  'User-Agent': 'profile-languages',
  Accept: 'application/vnd.github+json',
  ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
};
const api = async (p) => {
  const r = await fetch(`https://api.github.com${p}`, { headers });
  if (!r.ok) throw new Error(`${r.status} ${p}`);
  return r.json();
};

async function collect() {
  if (process.env.MOCK) return JSON.parse(process.env.MOCK);
  const totals = {};
  for (let page = 1; ; page++) {
    const repos = await api(`/users/${USER}/repos?per_page=100&type=owner&page=${page}`);
    for (const r of repos) {
      if (r.fork || r.name === USER) continue;
      const langs = await api(`/repos/${USER}/${r.name}/languages`);
      for (const [k, v] of Object.entries(langs)) totals[k] = (totals[k] || 0) + v;
    }
    if (repos.length < 100) break;
  }
  return totals;
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function render(totals) {
  const sum = Object.values(totals).reduce((a, b) => a + b, 0);
  let list = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  if (list.length > TOP) {
    const rest = list.slice(TOP - 1).reduce((a, [, v]) => a + v, 0);
    list = [...list.slice(0, TOP - 1), ['Другое', rest]];
  }
  const W = 900, X0 = 40, BAR = 820;
  const H = sum ? 150 + list.length * 44 + 10 : 170;

  let out = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
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

writeFileSync(OUT, render(await collect()));
console.log('written', OUT);
