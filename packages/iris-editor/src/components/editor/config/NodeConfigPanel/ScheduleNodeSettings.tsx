'use client';

import { useState, useEffect } from 'react';
import { cn } from '@editor/lib/convert/string';
import { irisApiClient, ScheduleInfo, CronPreset } from '@editor/lib/apis/iris-api-client';
import { toast } from 'sonner';
import { useI18n } from '@editor/hooks/usei18n';
import { Clock, Calendar, Globe, ChevronDown, Loader2, Check } from 'lucide-react';

const DEFAULT_TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Shanghai',
  'Australia/Sydney',
];

export function ScheduleNodeSettings({ workflowId }: { workflowId: string }) {
  const { t } = useI18n();
  const [scheduleInfo, setScheduleInfo] = useState<ScheduleInfo | null>(null);
  const [presets, setPresets] = useState<CronPreset[]>([]);
  const [timezones, setTimezones] = useState<string[]>(DEFAULT_TIMEZONES);
  const [userPlan, setUserPlan] = useState<string>('Free');
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showCustomCron, setShowCustomCron] = useState(false);
  const [customCron, setCustomCron] = useState('');
  const [selectedTimezone, setSelectedTimezone] = useState('UTC');
  const [previewRuns, setPreviewRuns] = useState<string[]>([]);

  useEffect(() => {
    fetchScheduleInfo();
    fetchPresets();
  }, [workflowId]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchScheduleInfo = async () => {
    setIsLoading(true);
    try {
      const info = await irisApiClient.getScheduleInfo(workflowId);
      if (info) {
        setScheduleInfo(info);
        setCustomCron(info.cron || '');
        setSelectedTimezone(info.timezone);
      }
    } catch (error) {
      console.error('Failed to fetch schedule info:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPresets = async () => {
    try {
      const result = await irisApiClient.getSchedulePresets();
      if (result) {
        setPresets(result.presets);
        if (result.timezones?.length) {
          setTimezones(result.timezones);
        }
        if (result.userPlan) {
          setUserPlan(result.userPlan);
        }
      }
    } catch (error) {
      console.error('Failed to fetch presets:', error);
    }
  };

  const isFreePlan = userPlan.toLowerCase() === 'free';

  const handleToggleEnabled = async () => {
    if (!scheduleInfo) return;

    if (!scheduleInfo.enabled && !scheduleInfo.cron) {
      toast.error(t('iris.schedule.setScheduleFirst') || 'Please set a schedule first');
      return;
    }

    const newEnabled = !scheduleInfo.enabled;
    setScheduleInfo({ ...scheduleInfo, enabled: newEnabled });

    try {
      const result = await irisApiClient.updateScheduleSettings(workflowId, {
        enabled: newEnabled,
      });
      if (result) {
        setScheduleInfo(result);
      } else {
        setScheduleInfo({ ...scheduleInfo, enabled: !newEnabled });
        toast.error(t('iris.schedule.updateFailed') || 'Failed to update schedule');
      }
    } catch {
      setScheduleInfo({ ...scheduleInfo, enabled: !newEnabled });
      toast.error(t('iris.schedule.updateFailed') || 'Failed to update schedule');
    }
  };

  const handlePresetSelect = async (preset: CronPreset) => {
    setIsUpdating(true);
    try {
      const result = await irisApiClient.updateScheduleSettings(workflowId, {
        cron: preset.cron,
        timezone: selectedTimezone,
      });
      if (result) {
        setScheduleInfo(result);
        setCustomCron(preset.cron);
      } else {
        toast.error(t('iris.schedule.updateFailed') || 'Failed to update schedule');
      }
    } catch {
      toast.error(t('iris.schedule.updateFailed') || 'Failed to update schedule');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleTimezoneChange = async (tz: string) => {
    setSelectedTimezone(tz);
    if (scheduleInfo?.cron) {
      setScheduleInfo({ ...scheduleInfo, timezone: tz });
      try {
        const result = await irisApiClient.updateScheduleSettings(workflowId, {
          timezone: tz,
        });
        if (result) {
          setScheduleInfo(result);
        } else {
          setScheduleInfo({ ...scheduleInfo, timezone: scheduleInfo.timezone });
          toast.error(t('iris.schedule.updateFailed') || 'Failed to update timezone');
        }
      } catch {
        setScheduleInfo({ ...scheduleInfo, timezone: scheduleInfo.timezone });
        toast.error(t('iris.schedule.updateFailed') || 'Failed to update timezone');
      }
    }
  };

  const handleCustomCronSave = async () => {
    if (!customCron.trim()) {
      toast.error(t('iris.schedule.enterCron') || 'Please enter a cron expression');
      return;
    }

    const preview = await irisApiClient.previewSchedule(workflowId, customCron, selectedTimezone);
    if (!preview?.valid) {
      toast.error(preview?.error || t('iris.schedule.invalidCron') || 'Invalid cron expression');
      return;
    }

    setIsUpdating(true);
    try {
      const result = await irisApiClient.updateScheduleSettings(workflowId, {
        cron: customCron,
        timezone: selectedTimezone,
      });
      if (result) {
        setScheduleInfo(result);
        setShowCustomCron(false);
      } else {
        toast.error(t('iris.schedule.updateFailed') || 'Failed to update schedule');
      }
    } catch {
      toast.error(t('iris.schedule.updateFailed') || 'Failed to update schedule');
    } finally {
      setIsUpdating(false);
    }
  };

  const handlePreviewCron = async () => {
    if (!customCron.trim()) return;

    const preview = await irisApiClient.previewSchedule(workflowId, customCron, selectedTimezone);
    if (preview?.valid && preview.nextRuns) {
      setPreviewRuns(preview.nextRuns);
    } else {
      setPreviewRuns([]);
      if (preview?.error) {
        toast.error(preview.error);
      }
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  if (isLoading) {
    return (
      <div className="p-3 bg-white/5 rounded-lg border border-white/10">
        <div className="flex items-center gap-2 text-white/50 text-xs">
          <Loader2 size={14} className="animate-spin" />
          {t('iris.schedule.loading') || 'Loading schedule...'}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Current Schedule Status */}
      {scheduleInfo?.cron && (
        <div className="p-3 bg-white/5 rounded-lg border border-white/10">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-green-400" />
              <span className="text-xs text-white/70">
                {scheduleInfo.description || t('iris.schedule.customSchedule') || 'Custom schedule'}
              </span>
            </div>
            <button
              onClick={handleToggleEnabled}
              disabled={isUpdating}
              className={cn(
                'relative w-9 h-5 rounded-full transition-colors duration-200',
                scheduleInfo.enabled ? 'bg-green-500' : 'bg-white/20',
                isUpdating && 'opacity-50 cursor-not-allowed'
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200',
                  scheduleInfo.enabled ? 'translate-x-4' : 'translate-x-0'
                )}
              />
            </button>
          </div>
          <div className="text-[10px] text-white/50 font-mono mb-1">
            {scheduleInfo.cron}
          </div>
          {scheduleInfo.nextRun && (
            <div className="flex items-center gap-1 text-[10px] text-white/40">
              <Clock size={10} />
              {t('iris.schedule.nextRun') || 'Next'}: {formatDate(scheduleInfo.nextRun)}
            </div>
          )}
        </div>
      )}

      {/* Timezone Selector */}
      <div className="p-3 bg-white/5 rounded-lg border border-white/10">
        <label className="text-white/70 text-xs flex items-center gap-1 mb-2">
          <Globe size={12} />
          {t('iris.schedule.timezone') || 'Timezone'}
        </label>
        <div className="relative">
          <select
            value={selectedTimezone}
            onChange={(e) => handleTimezoneChange(e.target.value)}
            className="w-full bg-white/10 border border-white/10 rounded px-2 py-1.5 text-xs text-white focus:outline-none focus:border-slate-400 appearance-none pr-6"
          >
            {timezones.map((tz) => (
              <option key={tz} value={tz} className="bg-slate-800">
                {tz}
              </option>
            ))}
          </select>
          <ChevronDown
            size={12}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none"
          />
        </div>
      </div>

      {/* Quick Select Presets */}
      <div className="p-3 bg-white/5 rounded-lg border border-white/10">
        <label className="text-white/70 text-xs mb-2 block">
          {t('iris.schedule.quickSelect') || 'Quick Select'}
        </label>

        {isFreePlan && (
          <div className="text-center py-3">
            <div className="text-[10px] text-amber-400 mb-2">
              {t('iris.schedule.upgradeRequired') || 'Upgrade to Pro or Ultra for scheduled triggers'}
            </div>
            <div className="text-[10px] text-white/40">
              Pro: {t('iris.schedule.proMin') || 'Daily or longer'}<br />
              Ultra: {t('iris.schedule.ultraMin') || 'Hourly or longer'}
            </div>
          </div>
        )}

        {!isFreePlan && presets.length > 0 && (
          <div className="grid grid-cols-2 gap-1.5">
            {presets.map((preset) => (
              <button
                key={preset.cron}
                onClick={() => handlePresetSelect(preset)}
                disabled={isUpdating}
                className={cn(
                  'p-2 text-left rounded border transition-colors text-[10px]',
                  scheduleInfo?.cron === preset.cron
                    ? 'bg-slate-400/20 border-slate-400/50 text-white'
                    : 'bg-white/5 border-white/10 text-white/70 hover:bg-white/10'
                )}
              >
                <div className="font-medium flex items-center justify-between">
                  {preset.label}
                  {scheduleInfo?.cron === preset.cron && (
                    <Check size={10} className="text-slate-300" />
                  )}
                </div>
                <div className="text-[9px] text-white/40 mt-0.5">
                  {preset.description}
                </div>
              </button>
            ))}
          </div>
        )}

        {!isFreePlan && presets.length === 0 && (
          <div className="text-center py-2 text-[10px] text-white/40">
            {t('iris.schedule.noPresets') || 'Loading presets...'}
          </div>
        )}
      </div>

      {/* Custom Cron Toggle - Only for paid plans */}
      {!isFreePlan && (
        <div className="p-3 bg-white/5 rounded-lg border border-white/10">
          <button
            onClick={() => setShowCustomCron(!showCustomCron)}
            className="w-full flex items-center justify-between text-white/70 hover:text-white transition-colors text-xs"
          >
            <span>{t('iris.schedule.customCron') || 'Custom Cron'}</span>
            <ChevronDown
              size={12}
              className={cn('transition-transform', showCustomCron && 'rotate-180')}
            />
          </button>

          {showCustomCron && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  value={customCron}
                  onChange={(e) => setCustomCron(e.target.value)}
                  placeholder="0 9 * * *"
                  className="flex-1 bg-white/10 border border-white/10 rounded px-2 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-slate-400"
                />
                <button
                  onClick={handlePreviewCron}
                  className="px-2 py-1.5 bg-white/10 hover:bg-white/20 rounded text-white/70 text-[10px]"
                >
                  {t('iris.schedule.preview') || 'Preview'}
                </button>
              </div>

              {previewRuns.length > 0 && (
                <div className="bg-white/5 rounded p-2">
                  <div className="text-[10px] text-white/50 mb-1">
                    {t('iris.schedule.nextRuns') || 'Next runs'}:
                  </div>
                  <div className="space-y-0.5">
                    {previewRuns.slice(0, 3).map((run, i) => (
                      <div key={i} className="text-[10px] text-white/60">
                        {formatDate(run)}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={handleCustomCronSave}
                disabled={isUpdating || !customCron.trim()}
                className={cn(
                  'w-full py-1.5 rounded text-xs font-medium transition-colors',
                  customCron.trim()
                    ? 'bg-slate-400 hover:bg-slate-300 text-white'
                    : 'bg-white/10 text-white/40 cursor-not-allowed'
                )}
              >
                {isUpdating
                  ? (t('iris.schedule.saving') || 'Saving...')
                  : (t('iris.schedule.save') || 'Save')}
              </button>

              <div className="text-[10px] text-white/40">
                <p>{t('iris.schedule.cronFormat') || 'Format: min hour day month weekday'}</p>
                <p className="mt-1">
                  {userPlan.toLowerCase() === 'pro'
                    ? (t('iris.schedule.proMinNote') || 'Pro: Min 1 day interval')
                    : (t('iris.schedule.ultraMinNote') || 'Ultra: Min 1 hour interval')
                  }
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Plan info for paid users */}
      {!isFreePlan && (
        <div className="text-[9px] text-white/30 text-center">
          {t('iris.schedule.yourPlan') || 'Your plan'}: {userPlan}
        </div>
      )}
    </div>
  );
}
