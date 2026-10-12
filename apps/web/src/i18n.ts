import { ref } from 'vue'

export type Locale = 'ru' | 'en'
export const locale = ref<Locale>('ru')
const LOCALE_KEY = 'photobunker.locale'

const ru = {
  skip: 'Перейти к содержимому',
  navigation: 'Основная навигация',
  camera: 'Камера',
  gallery: 'Галерея',
  settings: 'Настройки',
  early: 'Ранняя версия',
  tagline: 'Место для ваших кадров',
  offline: 'Нет сети',
  offlineHint: 'Интерфейс доступен. Съёмка и сохранение пока не поддерживаются.',
  cameraEyebrow: 'ВАША КАМЕРА',
  cameraTitle: 'Всё начинается с кадра',
  cameraDescription: 'Камера пока недоступна в этой версии. Сделать или сохранить фото ещё нельзя.',
  cameraUnavailable: 'Съёмка пока недоступна',
  cameraFlip: 'Переключение камеры пока недоступно',
  noVault: 'Хранилище не подключено',
  photoMode: 'ФОТО',
  captureNote: 'Съёмка появится в будущих версиях',
  galleryEyebrow: 'ВАШИ ФОТОГРАФИИ',
  galleryTitle: 'Здесь будут ваши кадры',
  galleryDescription: 'Галерея пока недоступна. Подключить хранилище и открыть фотографии можно будет в следующих версиях.',
  backToCamera: 'К камере',
  settingsEyebrow: 'ПОД ВАС',
  settingsTitle: 'Настройки',
  settingsDescription: 'Пусть всё будет привычно.',
  language: 'Язык приложения',
  languageHint: 'Сохраняется на этом устройстве',
  languageUnavailable: 'Язык изменён. Сохранить выбор на этом устройстве не удалось.',
  security: 'Защита и хранилище',
  securityHint: 'Аккаунт, PIN и подключение хранилища пока недоступны.',
  comingLater: 'В следующих версиях',
  version: 'PhotoBunker · ранняя версия',
} as const

const en: Record<keyof typeof ru, string> = {
  skip: 'Skip to content',
  navigation: 'Main navigation',
  camera: 'Camera',
  gallery: 'Gallery',
  settings: 'Settings',
  early: 'Early version',
  tagline: 'A place for your moments',
  offline: 'No connection',
  offlineHint: 'The interface is available. Capture and saving are not supported yet.',
  cameraEyebrow: 'YOUR CAMERA',
  cameraTitle: 'It starts with a moment',
  cameraDescription: 'The camera is not available in this version. You cannot take or save photos yet.',
  cameraUnavailable: 'Capture is not available yet',
  cameraFlip: 'Switching cameras is not available yet',
  noVault: 'No storage connected',
  photoMode: 'PHOTO',
  captureNote: 'Photo capture is coming in a future version',
  galleryEyebrow: 'YOUR PHOTOGRAPHS',
  galleryTitle: 'A place for your moments',
  galleryDescription: 'The gallery is not available yet. Connecting storage and opening photos will arrive in future versions.',
  backToCamera: 'Back to camera',
  settingsEyebrow: 'MAKE IT YOURS',
  settingsTitle: 'Settings',
  settingsDescription: 'Make yourself at home.',
  language: 'App language',
  languageHint: 'Saved on this device',
  languageUnavailable: 'Language changed. Your choice could not be saved on this device.',
  security: 'Protection and storage',
  securityHint: 'Accounts, PIN and storage connection are not available yet.',
  comingLater: 'Coming in future versions',
  version: 'PhotoBunker · early version',
}

export function t(key: keyof typeof ru): string {
  return (locale.value === 'ru' ? ru : en)[key]
}

export function initializeLocale() {
  try {
    const saved = localStorage.getItem(LOCALE_KEY)
    if (saved === 'ru' || saved === 'en') locale.value = saved
    else locale.value = navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en'
  } catch {
    locale.value = navigator.language.toLowerCase().startsWith('ru') ? 'ru' : 'en'
  }
  document.documentElement.lang = locale.value
}

// Only an interface preference is persisted. No account, photo or security state.
export function setLocale(value: Locale): boolean {
  locale.value = value
  document.documentElement.lang = value
  try {
    localStorage.setItem(LOCALE_KEY, value)
    return true
  } catch {
    return false
  }
}
