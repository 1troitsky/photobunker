import { createApp } from 'vue'
import App from './App.vue'
import { createAppRouter } from './router'
import { initializeLocale } from './i18n'
import './style.css'
import './prototype.css'

initializeLocale()
createApp(App).use(createAppRouter()).mount('#app')

// The development server deliberately does not install an offline worker.
// A production build served over HTTPS (or localhost) precaches public shell files.
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Failure must not block the app or imply that offline storage is ready.
    })
  })
}
