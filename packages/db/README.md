# @heropad/db

Migrări SQL pentru baza de date Supabase (Postgres). Migrările sunt aplicate manual prin Supabase SQL Editor sau prin Supabase CLI (`supabase db push`).

## Convenții

- Numerotare strict crescătoare cu zero-padding (`001_`, `002_`, ...).
- Un fișier per migrare, irreversibil în producție (rollback-ul se face printr-o nouă migrare).
- RLS este activat pe orice tabel care conține date sensibile (wallets, claims, BITS).
- Comentariile SQL în engleză, comentariile pe deciziile de schemă în PR-uri/docs.

## Migrări

| File | Scop |
|------|------|
| `migrations/001_initial_schema.sql` | Schema inițială: wallets, characters, catalog, claims, BITS. |

## Rulare locală

```bash
# Opțiunea A: Supabase CLI (recomandat pentru dev)
supabase db reset
supabase db push

# Opțiunea B: paste manual în Supabase SQL Editor
```

## TODO

- [ ] Adaugă seed pentru characters (`002_seed_characters.sql`).
- [ ] Adaugă tabela `vdash_runs` pentru analytics joc.
- [ ] Adaugă tabela `b2b_partners` pentru distribuția socială.
