import { useEffect, useState } from 'react';

import { useT } from '../i18n';
import { canPrompt, isIosSafari, isStandalone, onInstallChange, promptInstall } from '../lib/install';

// "Put HeroPad on your home screen". Shown only where it can work: a browser
// that offers the install dialog, or Safari on iPhone (steps instead of a
// button). Hidden inside the installed app and for 30 days after "Later".
const LATER_KEY = 'hp.installLater';
const LATER_DAYS = 30;

function laterActive(): boolean {
  try {
    const at = Number(localStorage.getItem(LATER_KEY) || 0);
    return at > 0 && Date.now() - at < LATER_DAYS * 86_400_000;
  } catch {
    return false;
  }
}

export default function InstallApp({ variant, className = '' }: { variant: 'card' | 'counter'; className?: string }) {
  const { t } = useT();
  const [, force] = useState(0);
  const [later, setLater] = useState(laterActive);
  const [steps, setSteps] = useState(false);

  useEffect(() => onInstallChange(() => force((n) => n + 1)), []);

  const ios = isIosSafari();
  if (isStandalone() || later || (!canPrompt() && !ios)) return null;

  const install = async () => {
    if (ios) {
      setSteps((s) => !s);
      return;
    }
    await promptInstall();
  };
  const dismiss = () => {
    try {
      localStorage.setItem(LATER_KEY, String(Date.now()));
    } catch {
      /* the card simply comes back next visit */
    }
    setLater(true);
  };

  return (
    <div className={`card-sm p-4 ${className}`}>
      <div className="flex items-center gap-3">
        <img src="/icon-192.png" alt="" width={44} height={44} className="h-11 w-11 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-sm font-semibold text-white">{t('ia.title')}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-400">
            {t(variant === 'counter' ? 'ia.sub.counter' : 'ia.sub.card')}
          </p>
        </div>
      </div>
      {steps && (
        <p className="mt-3 rounded-xl bg-hero-deep px-3 py-2 text-xs leading-relaxed text-slate-300">
          {t('ia.ios.steps')}
        </p>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button type="button" onClick={() => void install()} className="btn btn-primary btn-sm">
          {ios ? t('ia.ios.btn') : t('ia.btn')}
        </button>
        <button type="button" onClick={dismiss} className="btn btn-ghost btn-sm">
          {t('ia.later')}
        </button>
      </div>
    </div>
  );
}
