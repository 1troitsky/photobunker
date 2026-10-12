import { createRouter, createWebHistory } from 'vue-router'
import type { RouterHistory } from 'vue-router'
import CameraView from './views/CameraView.vue'
import GalleryView from './views/GalleryView.vue'
import SettingsView from './views/SettingsView.vue'
import PhotoView from './views/PhotoView.vue'
import ProfilesView from './views/ProfilesView.vue'
import ProfileEditView from './views/ProfileEditView.vue'
import { activeProfile } from './profiles/store'

export function createAppRouter(history: RouterHistory = createWebHistory()) {
  return createRouter({
    history,
    routes: [
      { path: '/', redirect: () => activeProfile.value ? '/camera' : '/profiles' },
      { path: '/camera', name: 'camera', component: CameraView },
      { path: '/profiles', name: 'profiles', component: ProfilesView },
      { path: '/profiles/:id', name: 'profile-edit', component: ProfileEditView },
      { path: '/gallery', name: 'gallery', component: GalleryView },
      { path: '/gallery/:id', name: 'photo', component: PhotoView },
      { path: '/settings', name: 'settings', component: SettingsView },
      { path: '/:pathMatch(.*)*', redirect: '/' },
    ],
  })
}
