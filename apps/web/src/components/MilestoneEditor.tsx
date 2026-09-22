import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';

import { usePrivy } from '../lib/auth';
import { getJson, putJson } from '../services/apiClient';
import { useT } from '../i18n';

// Owner settings → milestones on the way to the full card.
//
// A short list: at how many stamps, what the customer gets, an optional
// photo. The photo is resized in the browser to a 256 px WebP so the public
// venue payload stays light on every customer's phone; the API refuses
// anything larger.
//
// No save button of its own: the settings form saves everything at once
// (the parent calls `save(stampsRequired)` after the threshold is stored),
// so a milestone can never be checked against a threshold the owner has
// typed but not yet saved — which is exactly how the second milestone went
// missing the first time this was used.

export interface MilestoneDraft {
  at: string;
  label: string;
  image: string | null;
}

export interface MilestoneEditorHandle {
  /** Problems with the current rows against this threshold; empty = fine. */
  problems: (stampsRequired: number) => string[];
  /** Persists the rows. Resolves when saved; rejects with a readable message. */
  save: (stampsRequired: number) => Promise<void>;
}

interface MilestoneEditorProps {
  slug: string;
  stampsRequired: number;
  /** Fires when the rows change (true) and after a save (false). */
  onDirty: (dirty: boolean) => void;
  onNotice: (n: { kind: 'ok' | 'err'; text: string }) => void;
}

const MAX = 4;
const PHOTO_PX = 256;
const PHOTO_MAX_CHARS = 80_000;

async function fileToThumb(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  // Square crop from the centre: the card shows these as small tiles.
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const c = document.createElement('canvas');
  c.width = PHOTO_PX;
  c.height = PHOTO_PX;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable.');
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, PHOTO_PX, PHOTO_PX);
  let url = c.toDataURL('image/webp', 0.82);
  if (!url.startsWith('data:image/webp')) url = c.toDataURL('image/jpeg', 0.8);
  if (url.length > PHOTO_MAX_CHARS) url = c.toDataURL('image/webp', 0.6);
  if (url.length > PHOTO_MAX_CHARS) throw new Error('Photo too large even after resizing.');
  return url;
}

const MilestoneEditor = forwardRef<MilestoneEditorHandle, MilestoneEditorProps>(function MilestoneEditor(
  { slug, stampsRequired, onDirty, onNotice },
  ref
) {
  const { t } = useT();
  const { getAccessToken } = usePrivy();
  const [rows, setRows] = useState<MilestoneDraft[] | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const token = await getAccessToken();
        const r = await getJson<{ ok: true; milestones: Array<{ at: number; label: string; image: string | null }> }>(
          `/api/loyalty/merchant/${slug}/milestones`,
          token ?? undefined
        );
        if (active) setRows(r.milestones.map((m) => ({ at: String(m.at), label: m.label, image: m.image })));
      } catch {
        if (active) setRows([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [slug, getAccessToken]);

  const edit = (next: MilestoneDraft[]) => {
    setRows(next);
    onDirty(true);
  };
  const update = (i: number, patch: Partial<MilestoneDraft>) =>
    edit((rows ?? []).map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const pickPhoto = async (i: number, file: File | null) => {
    if (!file) return;
    try {
      update(i, { image: await fileToThumb(file) });
    } catch (err) {
      onNotice({ kind: 'err', text: (err as Error).message });
    }
  };

  /** Rows that count: a number and a label; half-filled rows are ignored. */
  const cleaned = (list: MilestoneDraft[]) =>
    list
      .map((r) => ({ at: parseInt(r.at, 10), label: r.label.trim(), image: r.image }))
      .filter((r) => Number.isFinite(r.at) && r.label.length >= 2);

  const problemsFor = (required: number): string[] => {
    const list = cleaned(rows ?? []);
    const out: string[] = [];
    for (const m of list) {
      if (m.at < 1) out.push(t('b.set.ms.toohigh', { n: m.at, r: required }));
      else if (m.at >= required) out.push(t('b.set.ms.toohigh', { n: m.at, r: required }));
    }
    if (new Set(list.map((m) => m.at)).size !== list.length) out.push(t('b.set.ms.dup'));
    return out;
  };

  useImperativeHandle(ref, () => ({
    problems: problemsFor,
    save: async (required: number) => {
      const bad = problemsFor(required);
      if (bad.length > 0) throw new Error(bad[0]);
      const token = await getAccessToken();
      const milestones = cleaned(rows ?? []);
      const r = await putJson<
        { milestones: typeof milestones },
        { ok: true; milestones: Array<{ at: number; label: string; image: string | null }> }
      >(`/api/loyalty/merchant/${slug}/milestones`, { milestones }, token ?? undefined);
      setRows(r.milestones.map((m) => ({ at: String(m.at), label: m.label, image: m.image })));
      onDirty(false);
    },
  }));

  const liveProblems = rows ? problemsFor(stampsRequired) : [];
  const inputCls =
    'mt-1 w-full rounded-lg border border-white/15 bg-hero-deep px-3 py-2 text-sm text-slate-100 focus:border-hero-gold focus:outline-none';

  return (
    <div className="mt-5 rounded-xl border border-white/[0.08] p-4">
      <p className="text-xs font-semibold text-slate-200">{t('b.set.ms')}</p>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{t('b.set.ms.hint')}</p>

      {rows === null ? (
        <div className="mt-3 h-10 animate-pulse rounded-lg bg-hero-navy2" />
      ) : rows.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">{t('b.set.ms.none')}</p>
      ) : (
        <div className="mt-3 space-y-3">
          {rows.map((r, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-white/[0.08] bg-hero-navy p-3 sm:grid-cols-[88px_1fr_auto]">
              <label className="text-xs text-slate-500">
                {t('b.set.ms.at')}
                <input
                  id={`ms-at-${i}`}
                  type="number"
                  min={1}
                  max={Math.max(1, stampsRequired - 1)}
                  value={r.at}
                  onChange={(e) => update(i, { at: e.target.value })}
                  className={inputCls}
                />
              </label>
              <label className="text-xs text-slate-500">
                {t('b.set.ms.label')}
                <input
                  id={`ms-label-${i}`}
                  type="text"
                  maxLength={40}
                  value={r.label}
                  onChange={(e) => update(i, { label: e.target.value })}
                  placeholder="Cartofi prăjiți"
                  className={inputCls}
                />
              </label>
              <div className="flex items-end gap-2">
                <label className="flex cursor-pointer flex-col items-center text-xs text-slate-500">
                  {t('b.set.ms.photo')}
                  <span className="mt-1 flex h-[38px] w-[38px] items-center justify-center overflow-hidden rounded-lg border border-white/15 bg-hero-deep">
                    {r.image ? (
                      <img src={r.image} alt="" className="h-full w-full object-cover" width={38} height={38} />
                    ) : (
                      <span className="text-lg text-slate-600">+</span>
                    )}
                  </span>
                  <input
                    id={`ms-photo-${i}`}
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => void pickPhoto(i, e.target.files?.[0] ?? null)}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => edit((rows ?? []).filter((_, j) => j !== i))}
                  className="btn btn-ghost btn-sm"
                >
                  {t('b.set.ms.remove')}
                </button>
              </div>
              {r.image && (
                <button
                  type="button"
                  onClick={() => update(i, { image: null })}
                  className="text-left text-[11px] text-slate-500 underline sm:col-span-3"
                >
                  {t('b.set.ms.photo.remove')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {liveProblems.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-red-300">
          {liveProblems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      {rows !== null && rows.length < MAX && (
        <button
          type="button"
          onClick={() => edit([...(rows ?? []), { at: '', label: '', image: null }])}
          className="btn btn-ghost btn-sm mt-3"
        >
          {t('b.set.ms.add')}
        </button>
      )}
    </div>
  );
});

export default MilestoneEditor;
