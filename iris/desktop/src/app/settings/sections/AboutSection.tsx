import { useCallback, useEffect, useState } from 'react';
import { Info, RefreshCw, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/shared/components/ui/useToast';
import { Button } from '@/shared/components/ui/Button';
import { SettingsRow, SettingsSection } from '../components/SettingsPrimitives';

const LINKS = [
  { label: 'about.documentation', desc: 'about.documentationDesc', url: 'https://parallax.kr/iris/guide' },
  { label: 'about.privacyPolicy', desc: 'about.privacyPolicyDesc', url: 'https://parallax.kr/en/pp' },
  { label: 'about.termsOfService', desc: 'about.termsDesc', url: 'https://parallax.kr/en/tos' },
] as const;

export function AboutSection() {
  const toast = useToast();
  const { t } = useTranslation(['settings', 'common']);
  const [appVersion, setAppVersion] = useState('1.0.0');
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.electronAPI?.app
      ?.getVersion?.()
      .then((v) => {
        if (v && !cancelled) setAppVersion(v);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCheckUpdates = useCallback(async () => {
    setIsCheckingUpdates(true);
    try {
      const updater = window.electronAPI?.updater;
      if (!updater) throw new Error('updater unavailable');
      const result = await updater.checkForUpdates();
      if (result.status === 'busy') {
        toast.info(t('about.updateCheckBusy'));
      } else if (result.status !== 'success') {
        throw new Error(result.message ?? 'update check failed');
      } else if (result.updateInfo && result.updateInfo.version !== appVersion) {
        // The updater's own events drive the download / install UI from here.
        toast.info(t('about.updateAvailable', { version: result.updateInfo.version }));
      } else {
        toast.info(t('about.latestVersion'));
      }
    } catch {
      toast.error(t('about.updateCheckFailed'));
    } finally {
      setIsCheckingUpdates(false);
    }
  }, [toast, t, appVersion]);

  return (
    <>
      <SettingsSection icon={<Info className="w-5 h-5" />} title={t('sections.about')}>
        <SettingsRow label={t('about.irisDesktop')} description={t('about.version', { version: appVersion })}>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleCheckUpdates}
            isLoading={isCheckingUpdates}
            leftIcon={!isCheckingUpdates ? <RefreshCw className="w-4 h-4" /> : undefined}
          >
            {t('about.checkUpdates')}
          </Button>
        </SettingsRow>
        {LINKS.map((link) => (
          <SettingsRow key={link.url} label={t(link.label)} description={t(link.desc)}>
            <Button
              variant="ghost"
              size="sm"
              // Opens in the system browser.
              onClick={() => window.open(link.url, '_blank')}
              rightIcon={<ExternalLink className="w-4 h-4" />}
            >
              {t('common:buttons.open')}
            </Button>
          </SettingsRow>
        ))}
      </SettingsSection>
      <div className="text-center text-xs text-zinc-600 py-4">
        <p>{t('footer.madeBy')}</p>
        <p className="mt-1">{t('footer.copyright')}</p>
      </div>
    </>
  );
}
