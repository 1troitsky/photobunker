// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import App from '../src/App.vue'
import { createAppRouter } from '../src/router'
import { initializeLocale, locale, setLocale } from '../src/i18n'
import { photos } from '../src/local/library'
import { captureDemo, cameraController } from '../src/local/camera'
import { listPhotos, savePhoto } from '../src/local/photos'

vi.mock('../src/profiles/store', async () => {
  const { ref, computed } = await import('vue')
  const { defaultRules } = await import('../src/profiles/model')
  const profile = { id: 'fixture-profile', name: 'Личная съёмка', description: '', version: 1, rules: defaultRules() }
  return { profiles: ref([profile]), activeProfile: computed(() => profile), refreshProfiles: vi.fn(async () => undefined), selectProfile: vi.fn(), profilesLoading: ref(false), profilesError: ref(false), saveProfile: vi.fn() }
})
vi.mock('../src/profiles/image', async importOriginal => ({ ...await importOriginal<typeof import('../src/profiles/image')>(), applyProfile: vi.fn(async (capture: unknown) => capture) }))

vi.mock('../src/local/photos', () => ({
  localPrototype: true, listPhotos: vi.fn(async () => []), savePhoto: vi.fn(), readThumbnail: vi.fn(),
  readPhoto: vi.fn(), updatePhoto: vi.fn(), deletePhoto: vi.fn(), clearPhotos: vi.fn(),
}))
vi.mock('../src/local/camera', () => ({
  cameraController: vi.fn(() => ({ start: vi.fn(async () => undefined), stop: vi.fn(), capture: vi.fn() })),
  drawDemo: vi.fn(), captureDemo: vi.fn(),
}))
const wrappers: ReturnType<typeof mount>[] = []
async function openApp(path = '/camera') {
  const router = createAppRouter(createMemoryHistory())
  await router.push(path)
  await router.isReady()
  const wrapper = mount(App, { global: { plugins: [router] }, attachTo: document.body })
  wrappers.push(wrapper)
  await flushPromises()
  return { wrapper, router }
}
function button(wrapper: ReturnType<typeof mount>, text: string) { return wrapper.findAll('button').find(item => item.text() === text)! }
beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listPhotos).mockResolvedValue([])
  vi.mocked(savePhoto).mockReset()
  vi.mocked(captureDemo).mockResolvedValue({ blob: new Blob(['photo'], { type: 'image/jpeg' }), thumbnail: new Blob(['thumb']), width: 1600, height: 1200, method: 'demo' })
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn() } })
  vi.stubGlobal('isSecureContext', true)
  vi.stubGlobal('BroadcastChannel', class { close() {} postMessage() {} })
  URL.createObjectURL = vi.fn(() => 'blob:local-photo')
  URL.revokeObjectURL = vi.fn()
  localStorage.clear(); setLocale('ru'); photos.value = []
})
afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('working local app', () => {
  it('opens without requesting camera access and labels unencrypted local storage', async () => {
    const { wrapper } = await openApp()
    expect(wrapper.get('h1').text()).toBe('Всё начинается с кадра')
    expect(wrapper.get('button[aria-label="Снять фото"]').attributes()).toHaveProperty('disabled')
    expect(wrapper.text()).toContain('без шифрования')
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled()
    const controller = vi.mocked(cameraController).mock.results[0]!.value
    expect(controller.start).not.toHaveBeenCalled()
    await button(wrapper, 'Включить камеру').trigger('click'); await flushPromises()
    expect(controller.start).toHaveBeenCalledExactlyOnceWith('environment', undefined)
    await wrapper.get('nav a[href="/gallery"]').trigger('click'); await flushPromises()
    expect(controller.stop).toHaveBeenCalled()
  })

  it('waits for storage commit before showing capture success', async () => {
    let commit!: () => void
    vi.mocked(savePhoto).mockImplementation(() => new Promise(resolve => { commit = () => resolve({} as never) }))
    const { wrapper } = await openApp()
    await button(wrapper, 'Попробовать без камеры').trigger('click'); await flushPromises()
    await wrapper.get('button[aria-label="Снять фото"]').trigger('click'); await flushPromises()
    expect(wrapper.text()).toContain('Сохраняем кадр…')
    expect(wrapper.text()).not.toContain('Кадр сохранён')
    expect(wrapper.get('button[aria-label="Снять фото"]').attributes()).toHaveProperty('disabled')
    commit(); await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('Кадр сохранён в этом браузере')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-photo')
  })

  it('retains a failed capture, guards navigation and retries without taking another photo', async () => {
    vi.mocked(savePhoto).mockRejectedValueOnce(new DOMException('Full', 'QuotaExceededError')).mockResolvedValueOnce({} as never)
    const { wrapper, router } = await openApp()
    await button(wrapper, 'Попробовать без камеры').trigger('click'); await flushPromises()
    await wrapper.get('button[aria-label="Снять фото"]').trigger('click'); await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('Он пока только в памяти')
    expect(wrapper.get('.pending-capture img').attributes('src')).toBe('blob:local-photo')
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    await router.push('/gallery'); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/camera')
    await button(wrapper, 'Повторить').trigger('click'); await flushPromises()
    expect(savePhoto).toHaveBeenCalledTimes(2)
    expect(captureDemo).toHaveBeenCalledOnce()
    expect(wrapper.text()).toContain('Кадр сохранён в этом браузере')
  })

  it('navigates through real empty gallery and settings without synthetic photo placeholders', async () => {
    const { wrapper, router } = await openApp('/gallery')
    expect(wrapper.get('nav a[aria-current="page"]').text()).toBe('Галерея')
    expect(wrapper.text()).toContain('Здесь будут ваши кадры')
    expect(wrapper.findAll('img, video')).toHaveLength(0)
    await router.push('/settings'); await flushPromises()
    expect(wrapper.text()).toContain('Фотографии в приложении')
    expect(wrapper.text()).toContain('0 KB')
  })

  it('changes interface language, document title and restores the preference', async () => {
    const { wrapper, router } = await openApp('/settings')
    await wrapper.get('button[lang="en"]').trigger('click')
    expect(wrapper.get('h1').text()).toBe('Settings')
    expect(wrapper.findAll('nav a').map(link => link.attributes('aria-label'))).toEqual(['Profiles', 'Camera', 'Gallery', 'Settings'])
    expect(document.documentElement.lang).toBe('en')
    expect(document.title).toBe('Settings · PhotoBunker')
    locale.value = 'ru'; initializeLocale(); expect(locale.value).toBe('en')
    await router.push('/'); await flushPromises()
    expect(wrapper.text()).toContain('Try without a camera')
  })

  it('keeps language usable when preference storage is denied', async () => {
    const { wrapper } = await openApp('/settings')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError') })
    await wrapper.get('button[lang="en"]').trigger('click')
    expect(wrapper.get('h1').text()).toBe('Settings')
    expect(wrapper.get('[role="status"]').text()).toContain('Your choice could not be saved')
  })

  it('reports offline connectivity without implying an upload', async () => {
    const { wrapper } = await openApp()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    window.dispatchEvent(new Event('offline')); await flushPromises()
    expect(wrapper.get('.offline-notice').text()).toContain('Локальная съёмка и галерея работают без интернета')
  })
})
