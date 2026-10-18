import { account, loadIdentity } from '../identity/store'
import * as workspace from '../workspace/api'
import { invitations } from '../workspace/state'
import { taskGrants } from '../workspace/access'
import { computed, ref, watch } from 'vue'
import { accessLibraryId } from '../server/api'
import { profiles } from '../profiles/store'
import {
  clone,
  newPreset,
  sessionFor,
  validateParticipants,
  validatePreset,
  validateTask,
  type Preset,
  type Session,
  type Task,
  type Team,
} from './model'
import * as repository from './repository'
import { cleanupVersions } from './versions'

export const localPresets = ref<Preset[]>([]),
  localTasks = ref<Task[]>([]),
  teams = ref<Team[]>([])
export const personalCategories = ref<string[]>([])
let categoryRevision = 0
export const selectedCategory = ref('')
export const studioReady = ref(false),
  studioError = ref(false)
export const studioSession = ref<Session | null>(null)
const scope = () =>
  account.value
    ? `account:${account.value.id}`
    : accessLibraryId.value || 'device'
let generation = 0
const changed = () => {
  window.dispatchEvent(new Event('photobunker-studio'))
  channel?.postMessage('changed')
}
let channel: BroadcastChannel | undefined
let loadingStudio: { owner: string; promise: Promise<void> } | undefined
export async function loadStudio(): Promise<void> {
  await loadIdentity()
  const owner = scope()
  if (loadingStudio?.owner === owner) return loadingStudio.promise
  const promise = loadStudioData()
  loadingStudio = { owner, promise }
  void promise.finally(() => {
    if (loadingStudio?.promise === promise) loadingStudio = undefined
  })
  return promise
}
async function loadStudioData() {
  const current = ++generation,
    owner = scope()
  try {
    if (account.value) {
      const data = await workspace.index()
      if (current !== generation || owner !== scope()) return
      localPresets.value = data.presets
      localTasks.value = data.tasks
      teams.value = data.teams
      personalCategories.value = data.categories.names
      categoryRevision = data.categories.revision
      invitations.value = data.invitations
      taskGrants.value = data.tasks
      studioError.value = false
      void cleanupVersions(owner).catch(() => {})
      return
    }
    const [p, a, t] = await Promise.all([
      repository.list<Preset>(owner, 'presets'),
      repository.list<Task>(owner, 'tasks'),
      repository.list<Team>(owner, 'teams'),
    ])
    if (current !== generation) return
    const documents = await repository.list<{
      id: string
      revision: number
      names: string[]
    }>(owner, 'categories')
    if (current !== generation) return
    const document = documents[0]
    categoryRevision = document?.revision ?? 0
    personalCategories.value = document?.names ?? [
      ...new Set(
        [...p, ...profiles.value]
          .flatMap((preset) => preset.rules.categories)
          .concat(
            !studioSession.value?.taskId
              ? (studioSession.value?.rules.categories ?? [])
              : [],
          ),
      ),
    ]
    if (!document && personalCategories.value.length) {
      const saved = await repository
        .save(
          owner,
          'categories',
          { id: 'personal', revision: 0, names: [...personalCategories.value] },
          0,
        )
        .catch(() => undefined)
      if (saved && current === generation) categoryRevision = saved.revision
    }
    if (current !== generation) return
    localPresets.value = p
    localTasks.value = a.sort((a, b) => b.createdAt - a.createdAt)
    teams.value = t
    studioError.value = false
    void cleanupVersions(owner).catch(() => {})
  } catch {
    if (current === generation) studioError.value = true
  } finally {
    if (current === generation) studioReady.value = true
  }
}
export const presetChoices = computed(() =>
  account.value
    ? localPresets.value.filter((item) => !item.hidden)
    : [
        ...localPresets.value.filter((item) => !item.hidden),
        ...profiles.value.filter(
          (item) => !localPresets.value.some((local) => local.id === item.id),
        ),
      ],
)
export async function savePreset(value: Preset): Promise<Preset> {
  if (validatePreset(value)) throw new Error('workspace.invalid_preset')
  const item = clone(value)
  item.name = item.name.trim()
  item.version++
  item.rules.resolution = item.options.size === 'custom' ? 'fixed' : 'maximum'
  item.rules.keepDate = item.options.date && item.options.time
  const owner = scope()
  const saved = account.value
    ? await workspace.save('preset', item)
    : await repository.save(owner, 'presets', item, value.revision)
  if (owner === scope()) {
    generation++
    localPresets.value = [
      ...localPresets.value.filter((item) => item.id !== saved.id),
      saved,
    ]
  }
  changed()
  return saved
}
export async function saveTask(value: Task): Promise<Task> {
  if (validateTask(value)) throw new Error('workspace.invalid_task')
  const owner = scope(),
    saved = account.value
      ? await workspace.save('task', value)
      : await repository.save(
          owner,
          'tasks',
          { ...clone(value), name: value.name.trim() },
          value.revision,
        )
  if (owner === scope()) {
    generation++
    localTasks.value = [
      saved,
      ...localTasks.value.filter((item) => item.id !== saved.id),
    ]
  }
  changed()
  return saved
}
export async function saveTeam(value: Team): Promise<Team> {
  if (
    !value.name.trim() ||
    value.name.length > 80 ||
    !validateParticipants(value.participants)
  )
    throw new Error('workspace.invalid_team')
  const owner = scope(),
    saved = account.value
      ? await workspace.save('team', value)
      : await repository.save(
          owner,
          'teams',
          { ...clone(value), name: value.name.trim() },
          value.revision,
        )
  if (owner === scope()) {
    generation++
    teams.value = [...teams.value.filter((item) => item.id !== saved.id), saved]
  }
  changed()
  return saved
}
export async function removeItem(
  collection: 'presets' | 'tasks' | 'teams',
  item: Preset | Task | Team,
) {
  if (account.value)
    await workspace.remove(
      collection === 'tasks'
        ? 'task'
        : collection === 'teams'
          ? 'team'
          : 'preset',
      item,
    )
  else await repository.remove(scope(), collection, item)
  await loadStudio()
  changed()
}
export async function savePersonalCategories(names: string[]) {
  const owner = scope(),
    clean = [...new Set(names.map((name) => name.trim()).filter(Boolean))]
  if (clean.length > 100 || clean.some((name) => name.length > 80))
    throw new Error('categories.invalid')
  const saved = account.value
    ? await workspace.request<{ names: string[]; revision: number }>(
        '/categories',
        'PUT',
        { revision: categoryRevision, names: clean },
      )
    : await repository.save(
        owner,
        'categories',
        { id: 'personal', revision: categoryRevision, names: clean },
        categoryRevision,
      )
  if (owner === scope()) {
    personalCategories.value = saved.names
    categoryRevision = saved.revision
  }
  changed()
}
export function choosePreset(preset: Preset | null) {
  studioSession.value = sessionFor(undefined, preset)
  studioSession.value.category = selectedCategory.value
  persistSession()
}
export function startTask(task: Task) {
  studioSession.value = sessionFor(task)
  studioSession.value.category =
    !task.rules.particularCategory ||
    task.rules.categories.includes(selectedCategory.value)
      ? selectedCategory.value
      : ''
  persistSession()
}
export function clearStudioSession() {
  studioSession.value = null
  persistSession()
}
export function updateSessionCategory(category: string) {
  selectedCategory.value = category
  try {
    localStorage.setItem(`photobunker-category:${scope()}`, category)
  } catch {}
  if (studioSession.value) {
    studioSession.value.category = category
    persistSession()
  }
}
function persistSession() {
  try {
    localStorage.setItem(
      `photobunker-ui-session:${scope()}`,
      JSON.stringify(studioSession.value),
    )
  } catch {
    /* Capture works; context may need selecting after reload. */
  }
}
function readSession() {
  studioSession.value = null
  try {
    selectedCategory.value =
      localStorage.getItem(`photobunker-category:${scope()}`) ?? ''
  } catch {}
  try {
    const item = JSON.parse(
      localStorage.getItem(`photobunker-ui-session:${scope()}`) ?? 'null',
    )
    if (
      item &&
      typeof item.taskId === 'string' &&
      item.rules &&
      Array.isArray(item.shots)
    )
      studioSession.value = item
  } catch {}
}
readSession()
export function asLocalPreset(id: string): Preset | undefined {
  const item = presetChoices.value.find((item) => item.id === id)
  return item
    ? 'uiOnly' in item
      ? clone(item as Preset)
      : newPreset(item.name, item)
    : undefined
}
export function startStudio() {
  if ('BroadcastChannel' in window) {
    channel = new BroadcastChannel('photobunker-ui-workspace')
    channel.onmessage = () => {
      void loadStudio()
    }
  }
  const focus = () => {
    void loadStudio()
  }
  window.addEventListener('focus', focus)
  void loadStudio()
  return () => {
    channel?.close()
    channel = undefined
    window.removeEventListener('focus', focus)
  }
}
watch(accessLibraryId, () => {
  generation++
  localPresets.value = []
  localTasks.value = []
  teams.value = []
  studioReady.value = false
  readSession()
  void loadStudio()
})

watch(profiles, () => {
  if (!categoryRevision) void loadStudio()
})

watch(
  () => account.value?.id,
  () => {
    generation++
    localPresets.value = []
    localTasks.value = []
    teams.value = []
    personalCategories.value = []
    invitations.value = []
    taskGrants.value = []
    categoryRevision = 0
    studioReady.value = false
    readSession()
    void loadStudio()
  },
)
