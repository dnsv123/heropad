// The offer sheet: one printable page the owner can hold. Built from the same
// plan definitions the Admin button applies, so what is printed is what gets
// invoiced. Opened in a new tab and sent to the browser's print dialog, which
// is also how it becomes a PDF (Save as PDF). No server, no library.

import { ANNUAL_MONTHS_PAID, annualPrice, type AppliedAddon, type BillingPeriod, type PlanDef } from './plans';

export interface OfferInput {
  venueName: string;
  plan: PlanDef;
  addons: AppliedAddon[];
  period: BillingPeriod;
  monthlyTotal: number;
  trial: boolean;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
const lei = (n: number) => `${n.toLocaleString('ro-RO')} lei`;

export function offerHtml(o: OfferInput): string {
  const today = new Date();
  const valid = new Date(today.getTime() + 30 * 86_400_000);
  const fmt = (d: Date) => d.toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' });
  const recurring = o.addons.filter((a) => !a.once);
  const once = o.addons.filter((a) => a.once);
  const onceTotal = once.reduce((s, a) => s + a.price * a.qty, 0);
  const annual = o.period === 'annual';
  const yearly = annualPrice(o.monthlyTotal);

  const rows = [
    `<tr><td><b>${esc(o.plan.name)}</b><br><span class="mute">${esc(o.plan.tagline)}</span></td><td class="r">${lei(o.plan.price)} / lună</td></tr>`,
    ...recurring.map(
      (a) => `<tr><td>${esc(a.label)}${a.qty > 1 ? ` × ${a.qty}` : ''}</td><td class="r">${lei(a.price * a.qty)} / lună</td></tr>`
    ),
    ...once.map(
      (a) => `<tr><td>${esc(a.label)}${a.qty > 1 ? ` × ${a.qty}` : ''}<br><span class="mute">o singură dată</span></td><td class="r">${lei(a.price * a.qty)}</td></tr>`
    ),
  ].join('');

  const totals = annual
    ? `<tr class="total"><td>Abonament anual · 12 luni, ${ANNUAL_MONTHS_PAID} plătite<br><span class="mute">echivalent ${lei(Math.round(yearly / 12))} / lună</span></td><td class="r">${lei(yearly)} / an</td></tr>`
    : `<tr class="total"><td>Abonament lunar</td><td class="r">${lei(o.monthlyTotal)} / lună</td></tr>`;
  const onceRow = onceTotal > 0 ? `<tr class="total"><td>De plătit o singură dată, la instalare</td><td class="r">${lei(onceTotal)}</td></tr>` : '';

  return `<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>Ofertă HeroPad — ${esc(o.venueName)}</title>
<style>
  @page{size:A4;margin:18mm}
  body{font:14px/1.5 -apple-system,"Segoe UI",Inter,sans-serif;color:#0A1B3A;background:#fff;margin:0;padding:24px;max-width:760px;margin-inline:auto}
  .top{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:2px solid #0A1B3A;padding-bottom:14px}
  .wm{font:800 22px "Space Grotesk",Inter,sans-serif;letter-spacing:-.02em}.wm i{font-style:normal;color:#C99A2E}
  .co{font-size:12px;color:#3B4661;text-align:right}
  h1{font:800 26px/1.15 "Space Grotesk",Inter,sans-serif;margin:26px 0 4px}
  .sub{color:#3B4661;margin:0 0 18px}
  table{width:100%;border-collapse:collapse;margin:14px 0}
  td{padding:10px 8px;border-bottom:1px solid #e6e2d8;vertical-align:top}
  td.r{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
  tr.total td{border-top:2px solid #0A1B3A;border-bottom:0;font-weight:700;font-size:15px}
  .mute{color:#6B7590;font-size:12px;font-weight:400}
  h2{font:700 14px "Space Grotesk",Inter,sans-serif;text-transform:uppercase;letter-spacing:.12em;color:#C99A2E;margin:22px 0 8px}
  ul{margin:0;padding-left:18px}li{margin:3px 0}
  .box{border:1px solid #e6e2d8;border-radius:10px;padding:12px 14px;margin-top:14px;font-size:13px;color:#3B4661}
  .sign{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:40px;font-size:12px;color:#3B4661}
  .sign div{border-top:1px solid #0A1B3A;padding-top:6px}
  .foot{margin-top:28px;font-size:11px;color:#6B7590}
  @media print{body{padding:0}}
</style></head><body>
<div class="top">
  <div class="wm">Hero<i>Pad</i><div class="mute" style="font:400 12px Inter,sans-serif">Fidelizare pentru cafenele și localuri</div></div>
  <div class="co"><b>SVU Journey SRL</b><br>Sibiu, România<br>legal@supervictornft.com</div>
</div>
<h1>Ofertă pentru ${esc(o.venueName)}</h1>
<p class="sub">${fmt(today)} · valabilă până la ${fmt(valid)}</p>

<table>${rows}${totals}${onceRow}</table>

<h2>Ce include</h2>
<ul>${o.plan.features.map((f) => `<li>${esc(f)}</li>`).join('')}</ul>

<div class="box">
  ${o.trial && o.plan.trialDays > 0 ? `<b>Pilot gratuit ${o.plan.trialDays} de zile.</b> Prima factură se emite la sfârșitul pilotului, doar dacă doriți să continuați.<br>` : ''}
  ${annual ? `<b>Garanție 30 de zile.</b> Dacă în primele 30 de zile de la prima factură anuală nu sunteți mulțumiți, returnăm integral suma, fără întrebări; figurina, dată în comodat, se returnează.<br>` : `<b>Fără angajament.</b> Abonamentul lunar se poate opri oricând, fără penalități, cu efect la sfârșitul lunii plătite.<br>`}
  Clienți nelimitați. Factură electronică (e-Factura), plată prin transfer bancar în 14 zile. Prețurile nu conțin TVA (neplătitor de TVA). Termenii compleți: heropad.supervictoruniverse.com/terms.
</div>

<div class="sign"><div>SVU Journey SRL · Valentin Dinescu</div><div>${esc(o.venueName)} · reprezentant</div></div>
<p class="foot">HeroPad este un produs SuperVictor Universe. Personajul SuperVictor este marcă înregistrată EUIPO 019287298.</p>
</body></html>`;
}

/** Opens the offer in a new tab and hands it to the print dialog. */
export function openOffer(o: OfferInput): void {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.open();
  w.document.write(offerHtml(o));
  w.document.close();
  w.focus();
  // Give fonts a beat before the dialog freezes the page.
  w.setTimeout(() => w.print(), 400);
}
