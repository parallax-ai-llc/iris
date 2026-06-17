import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

// EN
import enCommon from '../../locales/en/common.json';
import enEditor from '../../locales/en/editor.json';
import enMenus from '../../locales/en/menus.json';
import enSettings from '../../locales/en/settings.json';
import enExtensions from '../../locales/en/extensions.json';
import enImages from '../../locales/en/images.json';
import enVideos from '../../locales/en/videos.json';
import enProfile from '../../locales/en/profile.json';

// KO
import koCommon from '../../locales/ko/common.json';
import koEditor from '../../locales/ko/editor.json';
import koMenus from '../../locales/ko/menus.json';
import koSettings from '../../locales/ko/settings.json';
import koExtensions from '../../locales/ko/extensions.json';
import koImages from '../../locales/ko/images.json';
import koVideos from '../../locales/ko/videos.json';
import koProfile from '../../locales/ko/profile.json';

// JA
import jaCommon from '../../locales/ja/common.json';
import jaEditor from '../../locales/ja/editor.json';
import jaMenus from '../../locales/ja/menus.json';
import jaSettings from '../../locales/ja/settings.json';
import jaExtensions from '../../locales/ja/extensions.json';
import jaImages from '../../locales/ja/images.json';
import jaVideos from '../../locales/ja/videos.json';
import jaProfile from '../../locales/ja/profile.json';

// HI
import hiCommon from '../../locales/hi/common.json';
import hiEditor from '../../locales/hi/editor.json';
import hiMenus from '../../locales/hi/menus.json';
import hiSettings from '../../locales/hi/settings.json';
import hiExtensions from '../../locales/hi/extensions.json';
import hiImages from '../../locales/hi/images.json';
import hiVideos from '../../locales/hi/videos.json';
import hiProfile from '../../locales/hi/profile.json';

// TH
import thCommon from '../../locales/th/common.json';
import thEditor from '../../locales/th/editor.json';
import thMenus from '../../locales/th/menus.json';
import thSettings from '../../locales/th/settings.json';
import thExtensions from '../../locales/th/extensions.json';
import thImages from '../../locales/th/images.json';
import thVideos from '../../locales/th/videos.json';
import thProfile from '../../locales/th/profile.json';

// ID
import idCommon from '../../locales/id/common.json';
import idEditor from '../../locales/id/editor.json';
import idMenus from '../../locales/id/menus.json';
import idSettings from '../../locales/id/settings.json';
import idExtensions from '../../locales/id/extensions.json';
import idImages from '../../locales/id/images.json';
import idVideos from '../../locales/id/videos.json';
import idProfile from '../../locales/id/profile.json';

// ES
import esCommon from '../../locales/es/common.json';
import esEditor from '../../locales/es/editor.json';
import esMenus from '../../locales/es/menus.json';
import esSettings from '../../locales/es/settings.json';
import esExtensions from '../../locales/es/extensions.json';
import esImages from '../../locales/es/images.json';
import esVideos from '../../locales/es/videos.json';
import esProfile from '../../locales/es/profile.json';

// PT (Brazilian)
import ptCommon from '../../locales/pt/common.json';
import ptEditor from '../../locales/pt/editor.json';
import ptMenus from '../../locales/pt/menus.json';
import ptSettings from '../../locales/pt/settings.json';
import ptExtensions from '../../locales/pt/extensions.json';
import ptImages from '../../locales/pt/images.json';
import ptVideos from '../../locales/pt/videos.json';
import ptProfile from '../../locales/pt/profile.json';

// FR
import frCommon from '../../locales/fr/common.json';
import frEditor from '../../locales/fr/editor.json';
import frMenus from '../../locales/fr/menus.json';
import frSettings from '../../locales/fr/settings.json';
import frExtensions from '../../locales/fr/extensions.json';
import frImages from '../../locales/fr/images.json';
import frVideos from '../../locales/fr/videos.json';
import frProfile from '../../locales/fr/profile.json';

// BN
import bnCommon from '../../locales/bn/common.json';
import bnEditor from '../../locales/bn/editor.json';
import bnMenus from '../../locales/bn/menus.json';
import bnSettings from '../../locales/bn/settings.json';
import bnExtensions from '../../locales/bn/extensions.json';
import bnImages from '../../locales/bn/images.json';
import bnVideos from '../../locales/bn/videos.json';
import bnProfile from '../../locales/bn/profile.json';

// TE
import teCommon from '../../locales/te/common.json';
import teEditor from '../../locales/te/editor.json';
import teMenus from '../../locales/te/menus.json';
import teSettings from '../../locales/te/settings.json';
import teExtensions from '../../locales/te/extensions.json';
import teImages from '../../locales/te/images.json';
import teVideos from '../../locales/te/videos.json';
import teProfile from '../../locales/te/profile.json';

// TA
import taCommon from '../../locales/ta/common.json';
import taEditor from '../../locales/ta/editor.json';
import taMenus from '../../locales/ta/menus.json';
import taSettings from '../../locales/ta/settings.json';
import taExtensions from '../../locales/ta/extensions.json';
import taImages from '../../locales/ta/images.json';
import taVideos from '../../locales/ta/videos.json';
import taProfile from '../../locales/ta/profile.json';

// MR
import mrCommon from '../../locales/mr/common.json';
import mrEditor from '../../locales/mr/editor.json';
import mrMenus from '../../locales/mr/menus.json';
import mrSettings from '../../locales/mr/settings.json';
import mrExtensions from '../../locales/mr/extensions.json';
import mrImages from '../../locales/mr/images.json';
import mrVideos from '../../locales/mr/videos.json';
import mrProfile from '../../locales/mr/profile.json';

export type AppLanguage = 'en' | 'ko' | 'ja' | 'hi' | 'th' | 'id' | 'es' | 'pt' | 'fr' | 'bn' | 'te' | 'ta' | 'mr';

export const APP_LANGUAGES: AppLanguage[] = ['en', 'ko', 'ja', 'hi', 'th', 'id', 'es', 'pt', 'fr', 'bn', 'te', 'ta', 'mr'];

/**
 * 브라우저(또는 OS) 언어를 감지해서 지원하는 AppLanguage 로 매핑한다.
 * 매칭되는 게 없으면 영어로 폴백한다.
 */
export function detectBrowserLocale(): AppLanguage {
  if (typeof navigator === 'undefined') return 'en';
  const navLang = (navigator.languages?.[0] || navigator.language || '').toLowerCase();
  if (navLang.startsWith('ko')) return 'ko';
  if (navLang.startsWith('ja')) return 'ja';
  if (navLang.startsWith('hi')) return 'hi';
  if (navLang.startsWith('th')) return 'th';
  if (navLang.startsWith('id')) return 'id';
  if (navLang.startsWith('es')) return 'es';
  if (navLang.startsWith('pt')) return 'pt';
  if (navLang.startsWith('fr')) return 'fr';
  if (navLang.startsWith('bn')) return 'bn';
  if (navLang.startsWith('te')) return 'te';
  if (navLang.startsWith('ta')) return 'ta';
  if (navLang.startsWith('mr')) return 'mr';
  return 'en';
}

i18n
  .use(initReactI18next)
  .init({
    lng: 'en', // 기본값 — App.tsx에서 저장된 언어 또는 브라우저 언어로 교체됨
    fallbackLng: 'en',
    defaultNS: 'common',
    ns: ['common', 'editor', 'menus', 'settings', 'extensions', 'images', 'videos', 'profile'],
    resources: {
      en: {
        common: enCommon,
        editor: enEditor,
        menus: enMenus,
        settings: enSettings,
        extensions: enExtensions,
        images: enImages,
        videos: enVideos,
        profile: enProfile,
      },
      ko: {
        common: koCommon,
        editor: koEditor,
        menus: koMenus,
        settings: koSettings,
        extensions: koExtensions,
        images: koImages,
        videos: koVideos,
        profile: koProfile,
      },
      ja: {
        common: jaCommon,
        editor: jaEditor,
        menus: jaMenus,
        settings: jaSettings,
        extensions: jaExtensions,
        images: jaImages,
        videos: jaVideos,
        profile: jaProfile,
      },
      hi: {
        common: hiCommon,
        editor: hiEditor,
        menus: hiMenus,
        settings: hiSettings,
        extensions: hiExtensions,
        images: hiImages,
        videos: hiVideos,
        profile: hiProfile,
      },
      th: {
        common: thCommon,
        editor: thEditor,
        menus: thMenus,
        settings: thSettings,
        extensions: thExtensions,
        images: thImages,
        videos: thVideos,
        profile: thProfile,
      },
      id: {
        common: idCommon,
        editor: idEditor,
        menus: idMenus,
        settings: idSettings,
        extensions: idExtensions,
        images: idImages,
        videos: idVideos,
        profile: idProfile,
      },
      es: {
        common: esCommon,
        editor: esEditor,
        menus: esMenus,
        settings: esSettings,
        extensions: esExtensions,
        images: esImages,
        videos: esVideos,
        profile: esProfile,
      },
      pt: {
        common: ptCommon,
        editor: ptEditor,
        menus: ptMenus,
        settings: ptSettings,
        extensions: ptExtensions,
        images: ptImages,
        videos: ptVideos,
        profile: ptProfile,
      },
      fr: {
        common: frCommon,
        editor: frEditor,
        menus: frMenus,
        settings: frSettings,
        extensions: frExtensions,
        images: frImages,
        videos: frVideos,
        profile: frProfile,
      },
      bn: {
        common: bnCommon,
        editor: bnEditor,
        menus: bnMenus,
        settings: bnSettings,
        extensions: bnExtensions,
        images: bnImages,
        videos: bnVideos,
        profile: bnProfile,
      },
      te: {
        common: teCommon,
        editor: teEditor,
        menus: teMenus,
        settings: teSettings,
        extensions: teExtensions,
        images: teImages,
        videos: teVideos,
        profile: teProfile,
      },
      ta: {
        common: taCommon,
        editor: taEditor,
        menus: taMenus,
        settings: taSettings,
        extensions: taExtensions,
        images: taImages,
        videos: taVideos,
        profile: taProfile,
      },
      mr: {
        common: mrCommon,
        editor: mrEditor,
        menus: mrMenus,
        settings: mrSettings,
        extensions: mrExtensions,
        images: mrImages,
        videos: mrVideos,
        profile: mrProfile,
      },
    },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;

/**
 * 언어를 변경하고 electron-store에 저장합니다.
 */
export async function changeLanguage(lang: AppLanguage): Promise<void> {
  await i18n.changeLanguage(lang);
  await window.electronAPI?.storage?.set('app:language', lang);
}

/**
 * 우선순위에 따라 초기 표시 언어를 결정한다.
 *
 *   1. electron-store 에 저장된 사용자 선택 (있으면 그대로 사용)
 *   2. 브라우저/OS 언어 감지 결과로 폴백
 *   3. 둘 다 없으면 'en'
 *
 * 저장된 값이 없을 때 (즉, 브라우저 언어를 사용하게 됐을 때) 는
 * electron-store 에 아무 것도 기록하지 않는다 — 다음에도 OS 언어가
 * 바뀌면 자연스럽게 따라가도록 둔다.
 */
export async function resolveInitialLanguage(): Promise<AppLanguage> {
  const saved = await window.electronAPI?.storage?.get<string>('app:language');
  if (saved && (APP_LANGUAGES as string[]).includes(saved)) {
    return saved as AppLanguage;
  }
  return detectBrowserLocale();
}
