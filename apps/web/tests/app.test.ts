// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory } from 'vue-router'
import App from '../src/App.vue'
import { createAppRouter } from '../src/router'
import { initializeLocale, locale, setLocale } from '../src/i18n'

const wrappers: ReturnType<typeof mount>[] = []

async function openApp(path = '/') {
  const router = createAppRouter(createMemoryHistory())
  await router.push(path)
  await router.isReady()
  const wrapper = mount(App, { global: { plugins: [router] }, attachTo: document.body })
  wrappers.push(wrapper)
  return { wrapper, router }
}

beforeEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
  setLocale('ru')
})
afterEach(() => { wrappers.splice(0).forEach((wrapper) => wrapper.unmount()) })

describe('the early app shell', () => {
  it('opens camera first without requesting media or pretending capture is ready', async () => {
    const getUserMedia = vi.fn()
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
    const { wrapper, router } = await openApp()

    expect(router.currentRoute.value.name).toBe('camera')
    expect(wrapper.get('h1').text()).toBe('Всё начинается с кадра')
    expect(wrapper.get('button[aria-label="Съёмка пока недоступна"]').attributes()).toHaveProperty('disabled')
    expect(wrapper.text()).toContain('Сделать или сохранить фото ещё нельзя')
    expect(wrapper.text()).toContain('Хранилище не подключено')
    expect(getUserMedia).not.toHaveBeenCalled()
    expect(wrapper.find('video').exists()).toBe(false)
  })

  it('navigates with accessible links and shows unavailable gallery without private placeholders', async () => {
    const { wrapper, router } = await openApp()
    expect(wrapper.findAll('nav a').map((link) => link.attributes('aria-label'))).toEqual(['Камера', 'Галерея', 'Настройки'])
    await wrapper.get('nav a[href="/gallery"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.path).toBe('/gallery')
    expect(wrapper.get('nav a[aria-current="page"]').text()).toBe('Галерея')
    expect(wrapper.text()).toContain('Галерея пока недоступна')
    expect(wrapper.findAll('img, video')).toHaveLength(0)

    await wrapper.get('nav a[href="/settings"]').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/settings')
    expect(wrapper.text()).toContain('Аккаунт, PIN и подключение хранилища пока недоступны')
  })

  it('changes the full interface language, updates document language and restores the preference', async () => {
    const { wrapper, router } = await openApp('/settings')
    await wrapper.get('button[lang="en"]').trigger('click')

    expect(wrapper.get('h1').text()).toBe('Settings')
    expect(wrapper.findAll('nav a').map((link) => link.attributes('aria-label'))).toEqual(['Camera', 'Gallery', 'Settings'])
    expect(wrapper.get('button[lang="en"]').attributes('aria-pressed')).toBe('true')
    expect(document.documentElement.lang).toBe('en')
    expect(document.title).toBe('Settings · PhotoBunker')
    locale.value = 'ru'
    initializeLocale()
    expect(locale.value).toBe('en')

    await router.push('/')
    await flushPromises()
    expect(wrapper.text()).toContain('You cannot take or save photos yet')
  })

  it('keeps language usable and gives an honest notice when preference storage is denied', async () => {
    const { wrapper } = await openApp('/settings')
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Denied', 'SecurityError') })
    await wrapper.get('button[lang="en"]').trigger('click')

    expect(wrapper.get('h1').text()).toBe('Settings')
    expect(wrapper.get('[role="status"]').text()).toContain('Your choice could not be saved')
  })

  it('reports offline connectivity independently without claiming photos were queued or uploaded', async () => {
    const { wrapper } = await openApp()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    window.dispatchEvent(new Event('offline'))
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toContain('Нет сети')
    expect(wrapper.get('[role="status"]').text()).toContain('Съёмка и сохранение пока не поддерживаются')
  })
})
