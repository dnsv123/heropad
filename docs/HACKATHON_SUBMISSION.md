# Solana Frontier — Submission Checklist

Deadline: **11 mai 2026**.

> Ține acest fișier ca single-source-of-truth pentru tot ce trebuie predat. Marcat `[x]` când e gata.

---

## Repo

- [ ] Repo public pe GitHub (toggle din Private → Public înainte de submit).
- [ ] `README.md` populat cu live demo URL real, demo video link, pitch deck link.
- [ ] `LICENSE` MIT prezent.
- [ ] `.env.example` complet, fără secrete reale.
- [ ] Niciun secret în git history (verifică cu `git log -p | grep -iE 'private_key|secret|service_role'`).
- [ ] Branch `main` curat și deployable.

## Funcționalitate live

- [ ] Frontend deployed pe `https://heropad.supervictornft.com` (sau Vercel `*.vercel.app` ca fallback).
- [ ] Login Gmail funcționează prin Privy.
- [ ] Wallet Solana se generează la primul login.
- [ ] Cel puțin **1 claim demo** funcționează end-to-end (cod test → cNFT pe devnet).
- [ ] cNFT-ul mintat e vizibil pe Solana Explorer (devnet).
- [ ] V-DASH accesibil din UI; un erou e deblocat după claim.

## Asset-uri media

- [ ] Demo video 2-3 min (link în README + în formular).
- [ ] Pitch deck PDF (Figma → export).
- [ ] 3-5 screenshots cheie pentru gallery (landing, claim flow, success state, profil, V-DASH).
- [ ] Logo SVG + PNG.

## Documentație tehnică

- [ ] `docs/ARCHITECTURE.md` actualizat cu diagrama finală.
- [ ] `docs/DEPLOYMENT.md` reflectă realitatea de prod.
- [ ] `docs/PITCH.md` aliniat cu pitch deck-ul live.
- [ ] `packages/db/migrations/` reflectă schema live.

## Solana Frontier requirements (de validat din formular)

- [ ] Built **on Solana** (cNFT pe devnet ✓).
- [ ] Open source (MIT ✓).
- [ ] Demo public.
- [ ] Echipă ID-uri (Twitter / GitHub / email).
- [ ] Track / category selectat (consumer? gaming? infra?).
- [ ] Submission form completat și trimis.

## Post-submit

- [ ] Tweet de anunț (tag @solana, @MetaplexFndn, @helius_labs, @privy_io).
- [ ] Post pe LinkedIn.
- [ ] Mesaj în Discord-urile relevante (Solana, Metaplex).
- [ ] Update site brand SuperVictor cu link-ul către HeroPad.

---

## Risk register

| Risc | Mitigare |
|------|----------|
| Helius RPC limit hit în demo live | Cache result-uri pe backend, fallback la `api.devnet.solana.com`. |
| Privy quota free tier (1k MAU) | OK pentru hackathon; upgrade la Pro înainte de Bags. |
| Supabase row limit pe free tier | Monitorizare; cleanup pe `bits_transactions` dacă necesar. |
| NFC nu merge pe iPhone fără shortcut | Tutorial scurt în onboarding + alternativă QR. |
| Demo video pe submission falează (compresie) | Backup pe YouTube unlisted + Loom. |
