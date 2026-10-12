import { createRouter, createWebHistory } from 'vue-router'
import type { RouterHistory } from 'vue-router'
import CameraView from './views/CameraView.vue'
import GalleryView from './views/GalleryView.vue'
import SettingsView from './views/SettingsView.vue'
import PhotoView from './views/PhotoView.vue'

export function createAppRouter(history: RouterHistory = createWebHistory()) {
  return createRouter({
    history,
    routes: [
      { path: '/', name: 'camera', component: CameraView },
      { path: '/camera', redirect: '/' },
      { path: '/gallery', name: 'gallery', component: GalleryView },
      { path: '/gallery/:id', name: 'photo', component: PhotoView },
      { path: '/settings', name: 'settings', component: SettingsView },
      { path: '/:pathMatch(.*)*', redirect: '/' },
    ],
  })
}
