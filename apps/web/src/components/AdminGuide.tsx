// Admin → How-to. The living manual of every flow on the platform, in
// Romanian on purpose: this tab is what Valentin opens WITH a café owner or a
// partner across the table, and it doubles as his own memory. It replaces the
// stale _private/GHID_FLUXURI.html. Content-only component — keep it boring,
// keep it current: every time a flow changes, this file changes in the same
// commit.

const card =
  'mt-4 rounded-2xl border border-hero-blue/20 bg-hero-deep/50 p-5';
const h = 'font-display text-lg font-semibold text-hero-cyan';
const p = 'mt-2 text-sm leading-relaxed text-slate-300';
const li = 'mt-1.5 text-sm leading-relaxed text-slate-300';
const num = 'font-semibold text-hero-gold';
const mono = 'rounded bg-hero-deep px-1.5 py-0.5 font-mono text-[12px] text-hero-cyan';

export default function AdminGuide() {
  return (
    <div className="pb-4">
      {/* ---- Harta pe scurt ---- */}
      <div className={card}>
        <h2 className={h}>🗺️ Totul, într-un paragraf</h2>
        <p className={p}>
          Clientul <b className="text-white">atinge figurina sau scanează QR-ul</b> de pe
          tejghea → intră cu Gmail (10 secunde, o singură dată în viață) → codul lui apare{' '}
          <b className="text-white">singur</b> pe ecranul casei → barista apasă{' '}
          <b className="text-white">+1/+2/+3</b> (câte cafele a cumpărat) → ștampilele apar
          live pe telefonul clientului, cu animație. La card plin: clientul generează un{' '}
          <b className="text-white">cod unic de 5 minute</b>, barista îl scanează, dă
          recompensa — iar clientul primește un trofeu digital de colecție + BITS. Peste
          toate: Pașaportul SuperVictor îl trimite și către celelalte localuri partenere.
        </p>
      </div>

      {/* ---- Onboarding cafenea ---- */}
      <div className={card}>
        <h2 className={h}>☕ Onboarding CAFENEA (tu îl faci, ~5 minute)</h2>
        <p className={li}><span className={num}>1.</span> Tab-ul <b>➕ New venue</b>: slug, nume, adresă, prag, recompensă → Create. Primești <b>codul de setup (8 caractere)</b>.</p>
        <p className={li}><span className={num}>2.</span> Din cardul localului (tab <b>☕ Venues</b>): butonul <b>Copy merchant link</b> → trimite-l ownerului pe WhatsApp, împreună cu codul de setup.</p>
        <p className={li}><span className={num}>3.</span> Ownerul deschide linkul, se loghează cu Gmail-ul LUI, introduce codul de 8 caractere → <b>Activate code</b> → e merchant. Gata.</p>
        <p className={li}><span className={num}>4.</span> Tot din cardul localului iei <b>Copy customer link (QR)</b> — ăsta se printează pe stickerul de tejghea — și scrii tagurile NFC cu același link + <span className={mono}>?tap=1</span> la final.</p>
        <p className={li}><span className={num}>5.</span> După creare poți edita oricând: nume, adresă, emoji-ul din pașaport, GPS, facturare — din cardul localului. Ownerul își editează singur recompensa, pragul, Happy Hour și contactele, din /business → Settings.</p>
      </div>

      {/* ---- Onboarding angajat ---- */}
      <div className={card}>
        <h2 className={h}>👥 Onboarding ANGAJAT (îl face OWNERUL, nu tu)</h2>
        <p className={li}><span className={num}>1.</span> Ownerul, în /business → tab <b>Team</b> → scrie numele angajatului → <b>Add</b>. Primește un <b>cod de activare (6 caractere)</b>.</p>
        <p className={li}><span className={num}>2.</span> Butonul <b>Copy invite</b> de lângă angajat copiază mesajul complet (link + cod) — îl trimite pe WhatsApp.</p>
        <p className={li}><span className={num}>3.</span> Angajatul deschide linkul, se loghează cu <b>Gmail-ul lui personal</b>, bagă codul de 6 caractere în aceeași căsuță → e în echipă.</p>
        <p className={li}>De ce contează: fiecare ștampilă rămâne semnată de cine a dat-o — ownerul vede în History exact activitatea fiecărui om. Locuri în echipă: 2 la Starter (motiv natural de upgrade).</p>
      </div>

      {/* ---- Onboarding partener ---- */}
      <div className={card}>
        <h2 className={h}>🤝 Onboarding PARTENER de recomandare (tu îl faci)</h2>
        <p className={li}><span className={num}>1.</span> Tab-ul <b>Partners</b> → Create partner (nume, oraș, comision %) → primești <b>codul de activare</b>.</p>
        <p className={li}><span className={num}>2.</span> Butonul <b>⧉ Copy invite message</b> — mesaj gata scris cu linkul /partner + codul. Îl trimiți partenerului.</p>
        <p className={li}><span className={num}>3.</span> Partenerul se loghează pe /partner cu Gmail-ul lui și introduce codul o singură dată.</p>
        <p className={li}><span className={num}>4.</span> Atribuirea: pe cardul fiecărui local, câmpul <b>Brought by</b> = codul de recomandare al partenerului (ex. SI-VALENTIN). Comisionul curge doar cât timp localul e pe billing <b>active</b>.</p>
        <p className={li}><span className={num}>5.</span> Plata: luna se închide la final (butonul <b>Close [luna]</b> din Payout ledger), plătești prin transfer până pe 10, apoi bifezi <b>Mark paid</b>. Partenerul vede aceleași rânduri pe pagina lui.</p>
        <p className={li}>Atenție la cele DOUĂ coduri: codul de <b>recomandare</b> (îl alegi la Brought by) ≠ codul de <b>activare</b> (login-ul lui, o singură folosință).</p>
      </div>

      {/* ---- Onboarding client ---- */}
      <div className={card}>
        <h2 className={h}>🙋 Onboarding CLIENT (se face singur)</h2>
        <p className={li}>Trei uși, toate spre același loc: <b>figurina NFC</b> (tap → cardul se deschide + check-in automat la casă) · <b>QR-ul de pe tejghea</b> · <b>linkul direct</b> (ex. trimis de un prieten cu ?ref=coduljui — bonusul „Adu un prieten").</p>
        <p className={li}>Prima dată: login cu Gmail (~10 sec) → contul, codul personal de 6 caractere și portofelul digital se creează singure. Nimic de instalat, niciodată.</p>
        <p className={li}>Codul lui e mereu în <b>Profil</b> (card mare + QR), la fel rolurile, Power Pass-ul, Pașaportul și lista tuturor localurilor partenere.</p>
      </div>

      {/* ---- Roluri ---- */}
      <div className={card}>
        <h2 className={h}>🎭 Un cont — mai multe pălării</h2>
        <p className={p}>
          Un singur login (Gmail) poate fi <b>simultan</b>: client oriunde · owner la un
          local · angajat la altul · partener de recomandare · admin (doar tu, prin
          allowlist pe server — fără parole). Profilul arată toate rolurile în cardul
          „Rolurile tale". Singura interdicție, anti-fraudă: <b>nu-ți poți da singur
          ștampile și nu-ți poți valida singur recompense</b> la localul unde lucrezi.
        </p>
      </div>

      {/* ---- La tejghea ---- */}
      <div className={card}>
        <h2 className={h}>🛎️ La tejghea, zi de zi</h2>
        <p className={li}><b>Check-in NFC:</b> clientul dă tap → codul apare în caseta „📡 La tejghea"; dacă tejgheaua e liberă, cardul lui se încarcă <b>singur</b> — rămâne doar +N.</p>
        <p className={li}><b>Fără tap:</b> clientul spune codul / arată QR-ul → Find sau Scan.</p>
        <p className={li}><b>Ștampile:</b> +1/+2/+3 = câte cafele a cumpărat. Happy Hour activ le multiplică automat (×2/×3, decis de server). Fiecare ștampilă dă și câțiva BITS clientului.</p>
        <p className={li}><b>Greșeli:</b> −1/−2 corectează ultima ștampilă de azi; corecțiile rămân vizibile în History (nimic nu se șterge pe ascuns).</p>
        <p className={li}><b>Recompensa:</b> la card plin, clientul apasă „Revendică" pe telefonul LUI → cod unic de 5 minute → barista îl scanează/tastează → recompensa se dă, trofeul se mintează automat. Codul unic = dovada că clientul e de față.</p>
        <p className={li}><b>Offline:</b> dacă pică netul la grant, ștampila intră în coadă și pleacă singură când revine conexiunea.</p>
      </div>

      {/* ---- Motorul de creștere ---- */}
      <div className={card}>
        <h2 className={h}>📈 Motorul de creștere (ce vinde upgrade-ul)</h2>
        <p className={li}><b>⚡ Happy Hour ×2/×3</b> — ferestre programate de owner; clientul vede countdown-ul.</p>
        <p className={li}><b>⭐ Recenzii Google</b> — invitația apare fix la momentul recompensei.</p>
        <p className={li}><b>🎂 Ziua de naștere</b> — opțional, doar zi+lună; casa vede DOAR „azi e ziua clientului".</p>
        <p className={li}><b>🤝 Adu un prieten</b> — amândoi primesc BITS la prima ștampilă a prietenului (vizită reală).</p>
        <p className={li}><b>🗺️ Pașaportul SuperVictor</b> — trofee exclusive la 3/5/8 localuri; argumentul de rețea: „clienții celorlalte cafenele ajung și la tine".</p>
        <p className={li}><b>📣 Newsletter</b> — tab-ul de alături: export CSV doar cu emailuri cu consimțământ, pe segmente, pentru Substack.</p>
      </div>

      {/* ---- Tabel link-uri ---- */}
      <div className={card}>
        <h2 className={h}>🔗 De unde iau fiecare link</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="text-slate-500">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Pentru cine</th>
                <th className="py-1.5 pr-3 font-medium">Butonul</th>
                <th className="py-1.5 font-medium">Unde e</th>
              </tr>
            </thead>
            <tbody className="text-slate-300">
              <tr className="border-t border-hero-blue/10">
                <td className="py-1.5 pr-3">Client (QR / NFC)</td>
                <td className="py-1.5 pr-3">Copy customer link (QR)</td>
                <td className="py-1.5">Venues → cardul localului</td>
              </tr>
              <tr className="border-t border-hero-blue/10">
                <td className="py-1.5 pr-3">Cafenea (owner)</td>
                <td className="py-1.5 pr-3">Copy merchant link + cod setup 8</td>
                <td className="py-1.5">Venues → cardul localului</td>
              </tr>
              <tr className="border-t border-hero-blue/10">
                <td className="py-1.5 pr-3">Angajat</td>
                <td className="py-1.5 pr-3">Copy invite (link + cod 6)</td>
                <td className="py-1.5">/business → Team (ownerul)</td>
              </tr>
              <tr className="border-t border-hero-blue/10">
                <td className="py-1.5 pr-3">Partener</td>
                <td className="py-1.5 pr-3">⧉ Copy invite message</td>
                <td className="py-1.5">Partners → cardul partenerului</td>
              </tr>
              <tr className="border-t border-hero-blue/10">
                <td className="py-1.5 pr-3">Prieten invitat</td>
                <td className="py-1.5 pr-3">„Trimite invitația" (clientul o face)</td>
                <td className="py-1.5">Pagina de fidelitate a clientului</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          Regula codurilor: <b>8 caractere = devii owner · 6 caractere = intri în
          echipă</b> — aceeași căsuță pe /business le acceptă pe amândouă.
        </p>
      </div>

      {/* ---- Figurinele ---- */}
      <div className={card}>
        <h2 className={h}>🗿 Figurinele — ale cui sunt?</h2>
        <p className={li}><b>Comodat (împrumut de folosință), nu vânzare.</b> Figurina rămâne proprietatea SuperVictor Universe; localul o folosește cât timp e abonat la Branded+ — e inclusă în preț, ca un echipament în chirie.</p>
        <p className={li}>De ce așa: la reziliere figurina se întoarce (brandul nu rămâne pe tejgheaua unui fost client) · justifică diferența de tier lunar fără să vinzi stoc · o clauză simplă de comodat în contract acoperă pierderea/deteriorarea (taxă de înlocuire, ex. 150 lei).</p>
        <p className={li}>Stickerele QR și tagurile NFC simple = consumabile, le dai gratuit, nu se contabilizează.</p>
      </div>

      {/* ---- Pentru cine e pretabil ---- */}
      <div className={card}>
        <h2 className={h}>🏪 Pentru cine e pretabil</h2>
        <p className={p}>
          Regula: <b>orice business cu clienți care POT reveni des</b> și o recompensă
          care se dă la tejghea. Mecanica e identică peste tot — se schimbă doar
          emoji-ul, pragul și recompensa:
        </p>
        <p className={li}><b>☕ Cafenele & specialty coffee</b> — cazul de bază: 10 cafele → una gratis.</p>
        <p className={li}><b>🍦 Gelaterii</b> — sezonier puternic; Happy Hour umple orele reci.</p>
        <p className={li}><b>🍰 Cofetării & patiserii</b> — prag mic (5-7), recompensă = prăjitura zilei.</p>
        <p className={li}><b>🥖 Brutării artizanale</b> — clientelă zilnică, cea mai mare frecvență posibilă.</p>
        <p className={li}><b>🫖 Ceainării & bubble tea</b> — public tânăr, exact publicul colecționabilelor.</p>
        <p className={li}><b>🍕 Pizzerii & fast-casual</b> — 10 pizza → una gratis; prânzurile de birou revin.</p>
        <p className={li}><b>🍜 Restaurante cu meniu de prânz</b> — fidelizarea angajaților din zonă.</p>
        <p className={li}><b>🚚 Food trucks</b> — zero infrastructură = clientul nostru ideal; QR + figurină și gata.</p>
        <p className={li}><b>💈 Frizerii & barber shops</b> — vizite regulate (3-5 săpt.), a 10-a tunsoare gratis.</p>
        <p className={li}><b>💅 Saloane (manichiură, cosmetică)</b> — frecvență lunară, valoare mare per vizită.</p>
        <p className={li}><b>🏋️ Săli de fitness & yoga</b> — ștampilă per ședință; trofeul = motivația de consecvență.</p>
        <p className={li}><b>🧖 Solare & spa</b> — pachete care se pretează natural la praguri.</p>
        <p className={li}><b>📚 Librării-cafenea & boardgame cafés</b> — comunitate + colecționabile = potrivire perfectă.</p>
        <p className={li}><b>🍺 Vinoteci & craft beer shops</b> — degustări, clientelă de habitué.</p>
        <p className={li}><b>🐾 Pet shops & saloane de toaletaj</b> — recurență lunară garantată de animal. 😄</p>
        <p className={li}><b>🚗 Spălătorii auto</b> — clasicul cardului ștampilat, digitalizat.</p>
        <p className={li}><b>💐 Florării</b> — ocazii repetate; reminder-ul de zi de naștere lucrează dublu.</p>
        <p className={li}><b>🌿 Magazine naturiste / zero-waste / de cartier</b> — coșul săptămânal recurent.</p>
        <p className={li}><b>🎯 Escape rooms, cinema local, locuri de joacă</b> — a 5-a vizită gratis; părinții revin oricum.</p>
        <p className={li}>Anti-exemple (nu forța): achiziții rare (mobilă, electrocasnice, dealeri auto) — acolo nu există revenire frecventă de fidelizat.</p>
      </div>

      {/* ---- Administrativ / contabila ---- */}
      <div className={card}>
        <h2 className={h}>📋 Administrativ — de discutat cu contabila</h2>
        <p className={li}><b>Abonamentele:</b> factură recurentă din Oblio pe data de 1 (99/199/349 lei, preț final), trimisă automat pe email + depusă în SPV (e-Factura). Încasare: transfer bancar sau card prin linkul Netopia din factură (contul Netopia se activează la prima cafenea semnată — aprobarea durează câteva zile). Neplată 30 zile → reminder → suspendare venue.</p>
        <p className={li}><b>Founding Partners (primele 2 luni gratuite):</b> întreab-o cum preferă fiscal — factură cu discount 100% (recomandat: lasă urmă scrisă a beneficiului) sau fără factură în lunile gratuite.</p>
        <p className={li}><b>Figurinele (comodat):</b> rămân în patrimoniul SVU (obiecte de inventar). Se predau pe bază de <b>contract/clauză de comodat</b> — localul le folosește cât e abonat Branded+, le returnează la reziliere. Taxa de înlocuire (~150 lei) se facturează DOAR dacă e cazul. Nu e vânzare → fără factură de marfă, fără stoc de vândut.</p>
        <p className={li}><b>Consumabile</b> (stickere QR, taguri NFC simple): cheltuieli proprii de marketing, nu se refacturează.</p>
        <p className={li}><b>Contractul cu cafeneaua</b> (draftul există în dosarul privat): abonament lunar + reziliere oricând fără penalități + prețul de fondator PE VIAȚĂ scris explicit + clauza de comodat pentru figurină + prelucrarea datelor (noi = operator, ei văd doar coduri anonime).</p>
        <p className={li}><b>Comisioanele partenerilor:</b> luna se închide la final, plata până pe 10, pe bază de factură de la partener (PFA/SRL) sau contract de comision — de aliniat cu contabila forma corectă.</p>
      </div>

      {/* ---- Povestea de vanzare / dovezi ---- */}
      <div className={card}>
        <h2 className={h}>🎯 Dovezile de colectat din pilot (povestea de bani)</h2>
        <p className={p}>
          Materialele au features; le lipsesc CIFRELE și CITATELE — și alea se culeg din
          pilot, din prima zi. Ce urmărești ca la cafeneaua #4 să ai povestea gata:
        </p>
        <p className={li}><b>Rata de revenire</b> — înainte (estimarea ownerului) vs după 45/60 de zile (Analytics → Repeat rate). Ținta poveștii: „+X% clienți care revin”.</p>
        <p className={li}><b>Timp economisit la tejghea</b> — întreabă barista după 2 săptămâni: cât dura cu cardurile de hârtie vs acum (zero tastare cu figurina).</p>
        <p className={li}><b>Recenzii Google</b> — numărul de recenzii înainte de instalare vs după 60 de zile (invitația la momentul recompensei).</p>
        <p className={li}><b>Citate scurte</b> — o frază de la owner + una de la barista, cu acordul lor, pentru one-pager și deck.</p>
        <p className={li}><b>Screenshot-uri de dashboard</b> — cu acordul localului, date agregate (fără coduri de clienți).</p>
        <p className={li}><b>Formula de urgență</b> (adevărată, nu inventată): „au mai rămas X din cele 3 locuri de Founding Partner în Sibiu” — actualizezi X pe măsură ce semnezi.</p>
        <p className={li}><b>Viziunea de rețea</b>, spusă simplu: „cu fiecare local nou, Pașaportul devine mai valoros pentru clienții tăi — și pentru tine”.</p>
      </div>

      {/* ---- Viitor / Scalare ---- */}
      <div className={card}>
        <h2 className={h}>🚀 Viitor & scalare — listă INTERNĂ de idei</h2>
        <p className="mt-2 rounded-lg border border-hero-gold/30 bg-hero-gold/10 px-3 py-2 text-[12px] text-hero-gold">
          ⚠️ Brainstorm, nu promisiuni. La un meeting NU promiți nimic de aici — formula
          e „pe roadmap, vă anunț când e gata”. Prioritizarea o dictează cafenelele reale.
        </p>
        <p className={li}><b>Aproape (după pilot):</b> mainnet (trofee reale, plan scris) · NFC Faza 2b — chei criptografice: BITS de prezență la tap (1/zi), redeem direct prin figurină · reminder-uri „ne e dor de tine” (avem deja segmentele; lipsește doar trimiterea automată) · taguri NFC pe mese.</p>
        <p className={li}><b>Monetizare & retenție:</b> abonamente/membership („cafea nelimitată”, ex. 199 lei/lună la casă) · reward dinamic (clientul alege din 2-3 recompense / surprise reward) · BITS sink — clienții cheltuie BITS pe perks în rețea (reduceri, produse, acces V-DASH) · ediții limitate de trofee co-branded pentru campanii.</p>
        <p className={li}><b>Extindere pe verticale</b> (mecanica e identică, se schimbă emoji-ul și recompensa): gelaterii · cofetării · frizerii/saloane (acolo devine relevant și booking-ul — produs separat) · săli de fitness (+ waitlist) · food trucks · librării-cafenea.</p>
        <p className={li}><b>Integrare & confort:</b> POS (Sedona/SmartBill — cel mai cerut de piață, dar dependență de terți; doar cu volum) · carduri Apple/Google Wallet · meniu QR digital ca add-on ieftin · white-label complet (tierul Custom) · multi-locație cu raport consolidat (tierul Chain — deja în grila de preț).</p>
        <p className={li}><b>Inteligență:</b> predicție churn („clientul X n-a mai venit de 3 săptămâni, avea 8/10”) · sugestii de recompense și de ferestre Happy Hour din datele venue-ului.</p>
        <p className={li}><b>Ecosistem SuperVictor:</b> caracter jucabil V-DASH prin claim (deții X trofee + pașaport) · legătura cu Hall of Heroes prin identitate · VicBits.</p>
      </div>

      {/* ---- De reținut ---- */}
      <div className={card}>
        <h2 className={h}>🧭 De reținut la vânzare</h2>
        <p className={li}>Spune „<b>sistem de fidelizare</b>”, niciodată „aplicație de loialitate”. Niciodată crypto/NFT/blockchain — „trofeu digital securizat”.</p>
        <p className={li}>Prețuri: Starter 99 · Branded 199 (figurina NFC + co-branding) · Growth 349 (motorul de creștere) · Chain 699+. Founding Partner: 0 lei 2 luni → 99/lună PE VIAȚĂ cu pachetul Growth, în contract.</p>
        <p className={li}>La un meeting arăți DOUĂ opțiuni, niciodată trei-patru. Nu scazi prețul la obiecție — cobori un prag.</p>
        <p className={li}>GDPR: localul nu vede niciodată emailuri — doar coduri anonime. Toată povara legală e la noi (export, ștergere, consimțământ — tab-ul Support/GDPR).</p>
      </div>
    </div>
  );
}
