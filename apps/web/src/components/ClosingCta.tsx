import { useT } from '../i18n';
import { contactHref, contactIsWhatsApp, contactPhoneDisplay, contactPhoneHref } from '../lib/contact';

// Landing → the last thing an owner reads: the positioning line, and an
// invitation phrased as a choice (pick a day), not as a question.
export default function ClosingCta() {
  const { t } = useT();
  const phone = contactPhoneDisplay();

  return (
    <section className="mx-auto max-w-6xl px-4 pb-8 pt-16 sm:px-6 md:pt-24">
      <div className="relative overflow-hidden rounded-[28px] bg-brand-deep p-7 text-white shadow-soft sm:p-10 md:p-12">
        <div className="relative grid items-end gap-8 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <h2 className="text-balance font-display text-3xl font-bold leading-[1.1] tracking-tight md:text-[2.5rem]">
              {t('close.a')}
              <span className="text-brand-amber">{t('close.b')}</span>
            </h2>
            <p className="mt-4 max-w-[56ch] text-base text-white/85 md:text-lg">{t('close.sub')}</p>
          </div>
          <div className="flex flex-col items-start gap-3">
            <a
              href={contactHref()}
              target={contactIsWhatsApp() ? '_blank' : undefined}
              rel={contactIsWhatsApp() ? 'noopener noreferrer' : undefined}
              className="pbtn pbtn-sun"
            >
              {t('biz.cta')}
            </a>
            {phone && (
              <p className="text-sm text-white/80">
                {t('close.call')}{' '}
                <a href={contactPhoneHref()} className="font-semibold text-white underline decoration-white/40 underline-offset-4">
                  {phone}
                </a>
              </p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
