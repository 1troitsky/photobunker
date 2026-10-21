<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRouter, useRoute, RouterView } from 'vue-router'
import VoiceRecorder from '../components/VoiceRecorder.vue'
import MessageComposer from '../messages/shared-ui/MessageComposer.vue'
import VoiceMessagePlayer from '../components/VoiceMessagePlayer.vue'
import ConversationListItem from '../messages/shared-ui/ConversationListItem.vue'
import MessageBubble from '../messages/shared-ui/MessageBubble.vue'
import MessageList from '../messages/shared-ui/MessageList.vue'
import ScrollToBottomButton from '../messages/shared-ui/ScrollToBottomButton.vue'
import MessageActionList from '../messages/shared-ui/MessageActionList.vue'
import ConversationSearch from '../messages/shared-ui/ConversationSearch.vue'
import SidebarHeader from '../messages/shared-ui/SidebarHeader.vue'
import ThreadHeader from '../messages/shared-ui/ThreadHeader.vue'
import MessengerSplitLayout from '../messages/shared-ui/MessengerSplitLayout.vue'
import { voiceText } from '../messages/voice-text'
import type { VoiceDraft } from '../messages/voice'
import CallPanel from '../components/CallPanel.vue'
import ContactsView from './ContactsView.vue'
import {
  phase as callPhase,
  enabled as callsEnabled,
  joinCall,
} from '../calls/store'
import { t as callText } from '../calls/text'
import AppIcon from '../components/AppIcon.vue'
import AppSheet from '../components/AppSheet.vue'
import { account, deviceId as identityDeviceId } from '../identity/store'
import { IdentityError } from '../identity/api'
import { a } from '../identity/text'
import { u } from '../app/text'
import { s } from '../studio/text'
import { guardReload } from '../studio/unsaved'
import { w } from '../workspace/text'
import { m } from '../messages/text'
import { ui, initials, avatarColor, dayLabel, chatTime } from '../messages/presentation'
import { usePersonLookup } from '../messages/lookup'
import { personText } from '../identity/person-text'
import type { Message } from '../messages/store'
import {
  accountRecoveryReady,
  preserveMessageKeys,
  archiveConversation,
  deleteConversation,
  deleteMessages,
  canDeleteForEveryone,
  loadAllMessages,
  pinMessage,
  canPinMessage,
  pinnedIds,
  searchMessages,
  cancelMessageSearch,
  searchResults,
  searchBusy,
  historyBusy,
  openingHistory,
  openingHistoryError,
  loadInitialHistory,
  openAssignmentDiscussion,
  peerVerified,
  restoredKeys,
  refreshPeers,
  diagnostic,
  connection,
  failure,
  rooms,
  peers,
  selected,
  messages,
  security,
  recoveryBusy,
  recoveryError,
  restored,
  verification,
  sas,
  verificationPhase,
  activeChat,
  directPeer,
  startMessaging,
  stopMessaging,
  openRoom,
  createChat,
  sendVoice,
  loadVoice,
  joinIncomingConversations,
  incomingError,
  queueTextMessage,
  retryMessage,
  olderMessages,
  olderAvailable,
  leaveChat,
  blockContact,
  restoreHistory,
  verifyContact,
  verifyOwnDevice,
  acceptVerification,
  confirmVerification,
  cancelVerification,
  markRead,
} from '../messages/store'
const router = useRouter(),
  route = useRoute()
const profileOpen = computed(() => route.name === 'conversation-profile')
function openPerson(handle: string) {
  if (voiceDirty.value && !confirm(voiceText('discard'))) return
  newOpen.value = false; detailsOpen.value = false
  void router.push(`/messages/profile/${encodeURIComponent(handle)}`)
}
function profileMessage(handle: string, call = false) {
  void router.replace({ path: '/messages', query: { peer: handle, ...(call ? { call: 'audio' } : {}) } })
}
const linkedErrorCode = ref('')
const linkedError = ref(''),
  linkedPhoto = ref('')
let linkedAttempt = ''
async function enterDiscussion() {
  const id = String(route.query.assignment || '')
  if (
    !/^[a-f0-9-]{36}$/i.test(id) ||
    !security.value.verified ||
    connection.value !== 'ready'
  )
    return
  const key = `${account.value?.id}:${identityDeviceId.value}:${id}`
  if (linkedAttempt === key) return
  linkedAttempt = key
  linkedError.value = ''
  linkedErrorCode.value = ''
  try {
    await openAssignmentDiscussion(id)
    if (
      key !==
      `${account.value?.id}:${identityDeviceId.value}:${String(route.query.assignment || '')}`
    )
      return
    const photo = String(route.query.photo || '')
    if (/^[a-f0-9-]{36}$/i.test(photo)) {
      linkedPhoto.value = photo
      draft.value = `${w('photoReference')}: ${photo}`
    }
  } catch (error) {
    linkedErrorCode.value =
      error instanceof Error &&
      ['not_ready', 'unsafe_room', 'workspace.pending', 'cancelled'].includes(
        error.message,
      )
        ? error.message
        : 'request_failed'
    linkedError.value =
      linkedErrorCode.value === 'unsafe_room'
        ? m('unencrypted')
        : w('discussionPending')
    linkedAttempt = ''
  }
}
watch(
  [() => route.query.assignment, () => security.value.verified, connection],
  () => {
    if (!security.value.verified) linkedAttempt = ''
    else void enterDiscussion()
  },
)
const tab = ref('chats'),
  newOpen = ref(false),
  securityOpen = ref(false),
  detailsOpen = ref(false),
  draft = ref(''),
  reply = ref(''),
  chatName = ref(''),
  chosen = ref<string[]>([]),
  group = ref(false),
  actionBusy = ref(false),
  actionError = ref(''),
  restoreInput = ref(''),
  hidden = ref(document.hidden),
  log = ref<HTMLElement>()
const directHandle = ref(''), pendingPeer = ref(''), pendingCall = ref(false)
const { person: foundPerson, busy: lookupBusy, error: lookupError, find: findPerson } = usePersonLookup(
  directHandle,
  computed(() => newOpen.value && !group.value && !hidden.value),
  computed(() => `${account.value?.id || ''}:${identityDeviceId.value}`),
)
const chatDrafts = new Map<string, { text: string; reply: string }>()
function readyToWrite(handle?: string) {
  if (security.value.verified && connection.value === 'ready') return true
  pendingPeer.value = handle || ''
  if (connection.value !== 'ready' || diagnostic.value !== 'ready') {
    actionError.value = m(connection.value === 'error' ? failure.value || 'failed' : connection.value === 'offline' ? 'offline' : connection.value === 'unsupported' ? 'unsupported' : connection.value === 'otherTab' ? 'otherTab' : 'connecting')
    return false
  }
  newOpen.value = false
  securityOpen.value = true
  return false
}
async function writeDirect(handle: string, call = false) {
  if (actionBusy.value) return
  pendingCall.value = call
  await perform(async () => {
    const version = actionGeneration
    await startMessaging()
    if (version !== actionGeneration) return
    if (!readyToWrite(handle)) return
    await createChat([handle.trim()], '')
    if (version !== actionGeneration) return
    directHandle.value = ''
    newOpen.value = false
    tab.value = 'chats'
    if (route.query.peer) void router.replace({ query: { ...route.query, peer: undefined, call: undefined } })
    if (call) await joinCall(selected.value)
  })
}
watch(
  [() => route.query.peer, () => security.value.verified, connection, diagnostic],
  () => {
    if (
      typeof route.query.peer === 'string' &&
      security.value.verified &&
      connection.value === 'ready' && diagnostic.value === 'ready'
    )
      void writeDirect(route.query.peer, route.query.call === 'audio')
  },
  { immediate: true },
)
const listQuery = ref(''),
  messageQuery = ref(''),
  contactQuery = ref(''),
  selecting = ref(false),
  selectedMessages = ref<string[]>([]),
  swiped = ref(''),
  deleteTarget = ref(''),
  deleteForAll = ref(false)
let swipeX = 0,
  swipeY = 0
function endSwipe(event: TouchEvent, id: string) {
  const touch = event.changedTouches[0]
  if (
    touch &&
    swipeX - touch.clientX > 45 &&
    Math.abs(touch.clientY - swipeY) < 40
  ) {
    event.preventDefault()
    swiped.value = id
  } else if (touch && touch.clientX - swipeX > 45) {
    event.preventDefault()
    swiped.value = ''
  }
}
function askDelete(id: string) {
  deleteTarget.value = id
  deleteForAll.value = false
}
async function confirmDelete() {
  await perform(async () => {
    await deleteConversation(deleteTarget.value, deleteForAll.value)
    deleteTarget.value = ''
  })
}
async function selectAll() {
  await perform(async () => {
    await loadAllMessages()
    selectedMessages.value = messages.value.map((message) => message.id)
  })
}
const displayedMessages = computed(() =>
  messages.value.filter(
    (message) =>
      !messageQuery.value ||
      message.body
        .toLocaleLowerCase()
        .includes(messageQuery.value.toLocaleLowerCase()),
  ),
)
const listedPeers = computed(() =>
  peers.value.filter(
    (peer) =>
      peer.ready &&
      [
        peer.publicId,
        peer.username,
        peer.fields.name,
        peer.fields.username,
      ].some((value) =>
        value
          ?.toLocaleLowerCase()
          .includes(
            contactQuery.value.trim().toLocaleLowerCase().replace(/^@/, ''),
          ),
      ),
  ),
)
watch(
  () => activeChat.value?.deleted,
  (value) => {
    if (value) openRoom('')
  },
)
watch(messages, () => {
  selectedMessages.value = selectedMessages.value.filter((id) =>
    messages.value.some((message) => message.id === id),
  )
})
watch(selected, () => {
  messageSearchOpen.value = false
  messageMenu.value = undefined
  selecting.value = false
  selectedMessages.value = []
  messageQuery.value = ''
  cancelPress()
})
const listed = computed(() =>
  rooms.value.filter(
    (room) =>
      !room.deleted &&
      room.membership === 'join' &&
      room.archived === (tab.value === 'archive') &&
      (!listQuery.value ||
        room.name
          .toLocaleLowerCase()
          .includes(listQuery.value.toLocaleLowerCase())),
  ),
)
const needsSecurity = computed(() => connection.value === 'ready' && diagnostic.value === 'ready' && !security.value.verified)
watch([() => security.value.verified, connection], ([value, state]) => {
  if (value && state === 'ready' && pendingPeer.value) {
    const peer = pendingPeer.value
    pendingPeer.value = ''
    securityOpen.value = false
    void writeDirect(peer, pendingCall.value)
  }
})
const voiceDirty = ref(false)
const dirty = computed(
  () =>
    voiceDirty.value || !!draft.value.trim() ||
    messages.value.some(
      (message) => message.status === 'sending' || message.status === 'notSent',
    ),
)
guardReload(dirty, recoveryBusy)
let actionGeneration = 0
function resume(event: PageTransitionEvent) {
  if (event.persisted && account.value) void startMessaging()
}
function visibility() {
  hidden.value = document.hidden
  if (!hidden.value && !profileOpen.value && atBottom.value) void markRead()
}
onMounted(() => {
  void startMessaging()
  updateViewport()
  window.visualViewport?.addEventListener('resize', updateViewport)
  window.addEventListener('resize', updateViewport)
  document.addEventListener('visibilitychange', visibility)
  window.addEventListener('pageshow', resume)
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', visibility)
  window.removeEventListener('pageshow', resume)
  restoreInput.value = ''
  cancelPress()
  clearTimeout(searchTimer)
  window.visualViewport?.removeEventListener('resize', updateViewport)
  window.removeEventListener('resize', updateViewport)
  document.documentElement.style.removeProperty('--messenger-viewport')
  stopMessaging()
})
onBeforeRouteLeave(async () => {
  if (connection.value === 'connecting' || (connection.value === 'ready' && diagnostic.value !== 'ready')) await startMessaging()
  if (recoveryBusy.value || (callPhase.value !== 'idle' && !confirm(callText('leave'))) || (dirty.value && !confirm(s('leave')))) return false
  try { await preserveMessageKeys() }
  catch { actionError.value = m('backupBeforeLeaving'); return false }
  return true
})

watch(
  () => `${account.value?.id || ''}:${identityDeviceId.value}`,
  (identity, previous) => {
    if (identity !== previous) {
      actionGeneration++
      actionBusy.value = false
      linkedError.value = ''
      linkedPhoto.value = ''
      linkedAttempt = ''
      restoreInput.value = ''
      pendingPeer.value = ''
      directHandle.value = ''
      chatDrafts.clear()
      contactQuery.value = ''
      listQuery.value = ''
      draft.value = ''
      reply.value = ''
      securityOpen.value = false
      newOpen.value = false
      detailsOpen.value = false
      chosen.value = []
      chatName.value = ''
      actionError.value = ''
    }
    if (account.value) void startMessaging()
  },
)

watch(newOpen, (value) => {
  if (value) { pendingPeer.value = ''; pendingCall.value = false; directHandle.value = ''; contactQuery.value = ''; group.value = false; chosen.value = []; actionError.value = ''; void refreshPeers().catch(() => {}) }
})
watch(selected, (id, previous) => {
  if (previous) chatDrafts.set(previous, { text: draft.value, reply: reply.value })
  draft.value = chatDrafts.get(id)?.text || ''
  reply.value = chatDrafts.get(id)?.reply || ''
  actionError.value = ''
  void nextTick(() => {
    if (log.value) { log.value.scrollTop = log.value.scrollHeight; atBottom.value = true }
  })
})
watch(
  () => messages.value.at(-1)?.id,
  () => {
    // The composer clears only after its own queueTextMessage succeeds.
    // Never erase typed text based on body equality: identical consecutive
    // messages and interleaved local echoes must remain independent.
    if (!profileOpen.value && atBottom.value) void nextTick(scrollToLatest)
    if (!profileOpen.value && atBottom.value) void markRead()
  },
)
async function perform(action: () => Promise<unknown>) {
  if (actionBusy.value) return
  const version = actionGeneration
  actionBusy.value = true
  actionError.value = ''
  try {
    await action()
  } catch (error) {
    if (version === actionGeneration)
      actionError.value = m(
        error instanceof IdentityError && error.status === 404 ? 'contactUnavailable'
          : error instanceof IdentityError && error.status === 403 ? 'contactBlocked'
          : error instanceof IdentityError && error.status === 503 ? 'serviceUnavailable'
          : error instanceof Error && error.message === 'invalid_peers' ? 'contactNotReady'
          : error instanceof Error && error.message === 'not_ready' ? 'deviceRecoveryHint'
          : 'failed',
      )
  } finally {
    if (version === actionGeneration) actionBusy.value = false
  }
}
async function submitVoice(value: VoiceDraft) {
  if (actionBusy.value) throw new Error('busy')
  const version = actionGeneration
  actionBusy.value = true
  try { await sendVoice(value, reply.value || undefined); if (version === actionGeneration) reply.value = '' }
  finally { if (version === actionGeneration) actionBusy.value = false }
}
function submit() {
  if (actionBusy.value || voiceDirty.value || connection.value !== 'ready' || !security.value.verified) return
  const body = draft.value
  if (!body.trim()) return
  const roomId = selected.value
  try {
    // Synchronous validation + local queue insert; network preflight happens
    // afterwards. A rejected queue never clears a draft.
    queueTextMessage(body, reply.value || undefined, linkedPhoto.value || undefined)
    chatDrafts.delete(roomId)
    if (selected.value !== roomId) return
    if (draft.value === body) {
      draft.value = ''
      reply.value = ''
      linkedPhoto.value = ''
    }
    if (atBottom.value) void nextTick(scrollToLatest)
  } catch (error) {
    actionError.value = m(error instanceof Error && error.message === 'not_ready'
      ? 'deviceRecoveryHint' : 'failed')
  }
}
async function newChat() {
  if (!readyToWrite()) return
  const version = actionGeneration
  await perform(async () => {
    await createChat(chosen.value, group.value ? chatName.value : '')
    if (version !== actionGeneration) return
    newOpen.value = false
    chatName.value = ''
    chosen.value = []
  })
}
async function restore() {
  const version = actionGeneration
  await restoreHistory(restoreInput.value)
  if (version === actionGeneration && !recoveryError.value)
    restoreInput.value = ''
}
async function leave() {
  const version = actionGeneration
  if (confirm(m('leaveQuestion')))
    await perform(async () => {
      await leaveChat()
      if (version === actionGeneration) detailsOpen.value = false
    })
}
async function block() {
  const version = actionGeneration
  if (confirm(m('block')))
    await perform(async () => {
      await blockContact()
      if (version === actionGeneration) detailsOpen.value = false
    })
}
const replyBody = (id: string) =>
  messages.value.find((message) => message.id === id)?.body || ui('deletedMessage')

const messageSearchOpen = ref(false), messageMenu = ref<Message>(), chatMenu = ref(''), atBottom = ref(true), highlighted = ref('')
const messageDeleteOpen = ref(false), messageDeleteEveryone = ref(false), deletingMessages = ref<string[]>([])
const viewport = ref(window.visualViewport?.height ?? window.innerHeight)
const archiveCount = computed(() => rooms.value.filter(room => !room.deleted && room.archived && room.membership === 'join').length)
const timeline = computed(() => displayedMessages.value.map((message, index, all) => {
  const previous = all[index - 1]
  const day = !previous || new Date(previous.time).toDateString() !== new Date(message.time).toDateString()
  return { message, day, dayLabel: day ? dayLabel(message.time) : '', grouped: !day && previous?.mine === message.mine && previous.sender === message.sender && message.time - previous.time < 180000 }
}))
function updateViewport() { viewport.value = window.visualViewport?.height ?? window.innerHeight; document.documentElement.style.setProperty('--messenger-viewport', viewport.value + 'px') }
function scrollToLatest() { if (log.value && !profileOpen.value && !hidden.value) { log.value.scrollTop = log.value.scrollHeight; atBottom.value = true; void markRead() } }
watch(profileOpen, open => { if (!open && atBottom.value) void nextTick(scrollToLatest) })
function scrolled() {
  if (!log.value || profileOpen.value || hidden.value) return
  const previouslyBottom = atBottom.value
  atBottom.value = log.value.scrollHeight - log.value.scrollTop - log.value.clientHeight < 80
  if (atBottom.value && !previouslyBottom) void markRead()
  if (log.value.scrollTop < 60 && log.value.scrollHeight > log.value.clientHeight + 100 && olderAvailable.value && !historyBusy.value && !actionBusy.value) void older()
}
async function older() {
  const element = log.value, roomId = selected.value
  const height = element?.scrollHeight ?? 0, top = element?.scrollTop ?? 0
  await perform(olderMessages); await nextTick()
  if (element && log.value === element && selected.value === roomId) {
    element.scrollTop = top + element.scrollHeight - height
  }
}
async function jumpToMessage(id: string) {
  const roomId = selected.value
  messageQuery.value = ''; messageSearchOpen.value = false
  if (!messages.value.some(message => message.id === id)) await perform(loadAllMessages)
  if (selected.value !== roomId || hidden.value || profileOpen.value) return
  await nextTick()
  if (selected.value !== roomId) return
  const element = [...log.value?.querySelectorAll<HTMLElement>('[data-event-id]') ?? []].find(item => item.dataset.eventId === id)
  element?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  highlighted.value = id
  setTimeout(() => { if (highlighted.value === id) highlighted.value = '' }, 2000)
}
function chooseRoom(id: string) { if (voiceDirty.value && !confirm(voiceText('discard'))) return; openRoom(id) }
async function openSearchResult(roomId: string, id: string) { openRoom(roomId); await nextTick(); await jumpToMessage(id) }
async function copyMessage() { const text = messageMenu.value?.body; if (text) await navigator.clipboard.writeText(text) }
function selectMessage(message: Message) {
  selecting.value = true; selectedMessages.value = [message.id]; messageMenu.value = undefined
}
function cancelSelection() { selecting.value = false; selectedMessages.value = [] }
function closeNewMessage() { newOpen.value = false; pendingPeer.value = '' }
function toggleMessage(id: string) {
  selectedMessages.value = selectedMessages.value.includes(id) ? selectedMessages.value.filter(value => value !== id) : [...selectedMessages.value, id]
}
function askMessageDelete(ids: string[], everyone = false) {
  deletingMessages.value = [...ids]; messageDeleteEveryone.value = everyone && canDeleteForEveryone(ids); messageDeleteOpen.value = true; messageMenu.value = undefined
}
type MessageActionId = 'reply' | 'copy' | 'pin' | 'select' | 'retry' | 'delete'
const messageActions = computed(() => {
  const item = messageMenu.value
  const actions: { id: MessageActionId; label: string; destructive?: boolean }[] = []
  if (!item) return actions
  if (!item.locked) {
    actions.push({ id: 'reply', label: m('reply') }, { id: 'copy', label: a('copy') })
    if (canPinMessage()) actions.push({ id: 'pin', label: ui(pinnedIds.value.includes(item.id) ? 'unpin' : 'pin') })
  }
  actions.push({ id: 'select', label: ui('selectOne') })
  if (item.status === 'notSent') actions.push({ id: 'retry', label: m('retrySend') })
  actions.push({ id: 'delete', label: ui('delete'), destructive: true })
  return actions
})
function handleMessageAction(id: MessageActionId) {
  const item = messageMenu.value
  if (!item || !messageActions.value.some(action => action.id === id)) return
  switch (id) {
    case 'reply': reply.value = item.id; messageMenu.value = undefined; break
    case 'copy': void perform(copyMessage); messageMenu.value = undefined; break
    case 'pin': void perform(() => pinMessage(item.id, !pinnedIds.value.includes(item.id))); messageMenu.value = undefined; break
    case 'select': selectMessage(item); break
    case 'retry': void perform(() => retryMessage(item.id)); messageMenu.value = undefined; break
    case 'delete': askMessageDelete([item.id]); break
  }
}
async function confirmMessageDelete() {
  await perform(async () => { await deleteMessages(deletingMessages.value, messageDeleteEveryone.value); messageDeleteOpen.value = false; selectedMessages.value = []; selecting.value = false })
}
let pressTimer: ReturnType<typeof setTimeout> | undefined, pressX = 0, pressY = 0
function cancelPress() { clearTimeout(pressTimer); pressTimer = undefined }
function press(event: PointerEvent, message: Message) {
  if (event.pointerType === 'mouse' || event.button !== 0 || selecting.value) return
  pressX = event.clientX; pressY = event.clientY
  cancelPress(); pressTimer = setTimeout(() => { messageMenu.value = message; pressTimer = undefined }, 450)
}
function movePress(event: PointerEvent) { if (Math.abs(event.clientX - pressX) > 12 || Math.abs(event.clientY - pressY) > 12) cancelPress() }
function releasePress(event: PointerEvent, message: Message) {
  if (event.pointerType !== 'mouse' && !selecting.value && !message.locked && event.clientX - pressX > 65 && Math.abs(event.clientY - pressY) < 35) reply.value = message.id
  cancelPress()
}
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(directHandle, value => { contactQuery.value = value; actionError.value = ''; pendingPeer.value = ''; pendingCall.value = false })
watch(listQuery, query => {
  clearTimeout(searchTimer); cancelMessageSearch()
  if (query.trim().length > 1) searchTimer = setTimeout(() => { void searchMessages(query).catch(() => { actionError.value = m('failed') }) }, 350)
})
watch(messageSearchOpen, open => { if (open) { void perform(loadAllMessages); void nextTick(() => document.querySelector<HTMLInputElement>('.conversation-search input')?.focus()) } else messageQuery.value = '' })
</script>
<template>
  <section class="native-screen messages-screen" :class="{ 'has-conversation': !!activeChat }" :style="{ '--messenger-viewport': viewport + 'px' }" :data-room="selected" :data-connection="connection" :data-crypto-stage="diagnostic" :data-device-verified="security.verified" :data-history-backup="security.backup" :data-discussion-state="linkedErrorCode">
    <CallPanel v-if="!hidden" />
    <div v-if="hidden" class="native-empty"><AppIcon name="lock" /><h2>{{ m('privacy') }}</h2></div>
    <RouterView v-else-if="profileOpen" v-slot="{ Component }"><component :is="Component" in-messages @message="profileMessage" @call="(id: string) => profileMessage(id, true)" /></RouterView>
    <template v-if="!hidden">
      <div v-if="!profileOpen && typeof route.query.peer === 'string'" class="messenger-opening" role="status"><p>{{ actionError || (actionBusy ? personText('opening') : m(connection === 'error' ? failure || 'failed' : connection === 'otherTab' ? 'otherTab' : connection === 'unsupported' ? 'unsupported' : connection === 'offline' ? 'offline' : 'connecting')) }}</p><button v-if="!actionBusy" class="quiet-button" @click="writeDirect(String(route.query.peer), route.query.call === 'audio')">{{ personText('retry') }}</button><button v-if="!actionBusy" class="quiet-button" @click="openPerson(String(route.query.peer))">{{ personText('open') }}</button></div>
      <MessengerSplitLayout v-show="!profileOpen">
        <aside class="messenger-sidebar" :aria-label="m('chats')">
          <SidebarHeader
            :title="tab === 'contacts' ? a('contacts') : u('messages')"
            :subtitle="connection === 'ready' ? '' : connection === 'offline' ? ui('offlineShort') : m('connecting')"
          >
            <template #leading>
              <button v-if="tab === 'contacts'" class="app-icon-button" :aria-label="s('back')" @click="tab = 'chats'"><AppIcon name="back" /></button>
            </template>
            <template #actions>
              <button class="app-icon-button" :aria-label="a('contacts')" :aria-pressed="tab === 'contacts'" @click="tab = tab === 'contacts' ? 'chats' : 'contacts'"><AppIcon name="users" /></button>
              <button class="app-icon-button messenger-compose-button" :aria-label="m('newChat')" @click="newOpen = true"><AppIcon name="plus" /></button>
            </template>
          </SidebarHeader>
          <div v-if="['error', 'otherTab', 'unsupported'].includes(connection)" class="messenger-connection-error" role="status">
            <p>{{ m(connection === 'otherTab' ? 'otherTab' : connection === 'unsupported' ? 'unsupported' : failure || 'failed') }}</p>
            <button v-if="failure === 'keysUnavailable'" class="quiet-button" @click="router.push('/profile/account?mode=recover')">{{ m('newDevice') }}</button>
            <button v-else class="quiet-button" @click="startMessaging">{{ m('retry') }}</button>
          </div>
          <div v-if="incomingError" class="messenger-connection-error" role="status"><p>{{ m('failed') }}</p><button class="quiet-button" @click="joinIncomingConversations(true)">{{ m('retry') }}</button></div>
          <p v-if="actionError && !activeChat && !newOpen" class="message-error form-error" role="alert">{{ actionError }}</p>
          <div v-if="needsSecurity" class="message-backup-notice"><p>{{ m(accountRecoveryReady ? 'accountRecoveryPending' : 'accountKeyRequired') }}</p><button class="quiet-button" @click="accountRecoveryReady ? securityOpen = true : router.push('/profile/account?mode=connect')">{{ m(accountRecoveryReady ? 'security' : 'connectAccountKey') }}</button></div>
          <ContactsView v-if="tab === 'contacts'" embedded @profile="openPerson" />
          <template v-else>
            <ConversationSearch
              v-model="listQuery"
              :placeholder="ui('search')"
              :clear-label="ui('clearSearch')"
              :history-label="ui(searchBusy ? 'searching' : 'searchHistory')"
              :searching="searchBusy"
              @search-history="perform(() => searchMessages(listQuery))"
            />
            <div v-if="archiveCount || tab !== 'chats'" class="messenger-filters" :aria-label="m('chats')">
              <button :aria-pressed="tab === 'chats'" @click="tab = 'chats'">{{ m('chats') }}</button>
              <button v-if="archiveCount || tab === 'archive'" :aria-pressed="tab === 'archive'" @click="tab = 'archive'">{{ ui('archive') }}<span v-if="archiveCount">{{ archiveCount }}</span></button>
            </div>
            <div class="messenger-chat-list">
              <div v-if="connection === 'connecting' && !listed.length" class="chat-skeletons" aria-hidden="true"><div v-for="i in 4" :key="i"><i /><span><b /><b /></span></div></div>
              <template v-else>
                <div v-for="room in listed" :key="room.id" class="chat-swipe-row" @touchstart="event => { swipeX = event.touches[0]?.clientX ?? 0; swipeY = event.touches[0]?.clientY ?? 0 }" @touchend="endSwipe($event, room.id)" @contextmenu.prevent="chatMenu = room.id">
                  <div v-if="swiped === room.id" class="chat-swipe-actions"><button :aria-label="ui(room.archived ? 'unarchive' : 'archiveAction')" @click="perform(() => archiveConversation(room.id, !room.archived)); swiped = ''"><AppIcon name="archive" /></button><button :aria-label="ui('deleteChat')" @click="askDelete(room.id)"><AppIcon name="trash" /></button></div>
                  <ConversationListItem
                    :conversation="{ id: room.id, name: room.name, avatarClass: avatarColor(room.id), avatarInitials: initials(room.name), group: !room.direct, timeLabel: chatTime(room.lastTime), preview: (room.lastMine && room.preview ? m('you') + ': ' : '') + (room.preview || ui('noMessages')), unreadCount: room.unread }"
                    :active="selected === room.id"
                    :swiped="swiped === room.id"
                    @select="swiped ? swiped = '' : chooseRoom(room.id)"
                  />
                  <button v-if="swiped !== room.id" class="app-icon-button chat-row-menu" :aria-label="ui('chatActions')" @click="chatMenu = room.id"><AppIcon name="more" /></button>
                </div>
                <button v-for="hit in searchResults" :key="hit.id" class="search-result" @click="openSearchResult(hit.roomId, hit.id)"><span class="search-result-label">{{ hit.roomName }}</span><span>{{ hit.body }}</span><AppIcon name="search" /></button>
                <div v-if="!listed.length && !searchResults.length" class="native-empty messenger-empty"><AppIcon :name="listQuery ? 'search' : tab === 'archive' ? 'archive' : 'messages'" /><h2>{{ listQuery ? ui('noMatches') : tab === 'archive' ? ui('archive') : m('empty') }}</h2><p>{{ listQuery ? ui('noMatchesHint') : ui('emptyHint') }}</p><button v-if="!listQuery && tab === 'chats'" class="primary-button" @click="newOpen = true">{{ ui('newMessage') }}</button></div>
              </template>
            </div>
          </template>
        </aside>
        <main class="messenger-thread" :class="{ 'messenger-thread-placeholder': !activeChat }" :aria-label="activeChat?.name || ui('threadEmpty')">
          <template v-if="activeChat">
            <ThreadHeader
              :name="selecting ? selectedMessages.length + ' ' + ui('messageSelected').toLocaleLowerCase() : activeChat.name"
              :subtitle="connection === 'offline' ? ui('offlineShort') : activeChat.direct ? ui('direct') : activeChat.members.length + ' ' + ui('members')"
              :avatar-class="avatarColor(activeChat.id)"
              :initials="initials(activeChat.name)"
              :group="!activeChat.direct"
              :selecting="selecting"
              :show-back="true"
              :back-label="selecting ? ui('cancelSelection') : s('back')"
              :open-label="activeChat.name"
              @back="selecting ? cancelSelection() : chooseRoom('')"
              @open="directPeer ? openPerson(directPeer.id) : detailsOpen = true"
            >
              <template #actions>
                <template v-if="selecting"><button class="app-icon-button" :aria-label="ui('selectAll')" :disabled="historyBusy" @click="selectAll"><AppIcon name="check" /></button></template>
                <template v-else>
                  <button v-if="callsEnabled && activeChat.membership === 'join' && activeChat.encrypted && !activeChat.blocked && security.verified" class="app-icon-button messenger-audio-call" :aria-label="callText('audio')" :disabled="connection !== 'ready' || callPhase !== 'idle'" @click="joinCall(selected, false)"><AppIcon name="phone" /></button>
                  <button v-if="!messageSearchOpen" class="app-icon-button" :aria-label="ui('searchChat')" @click="messageSearchOpen = !messageSearchOpen"><AppIcon name="search" /></button>
                  <button class="app-icon-button" :aria-label="ui('chatActions')" @click="chatMenu = selected"><AppIcon name="more" /></button>
                </template>
              </template>
            </ThreadHeader>
            <div v-if="activeChat.membership !== 'join'" class="messenger-joining" role="status"><p>{{ personText('opening') }}</p><button v-if="incomingError" class="quiet-button" @click="joinIncomingConversations(true)">{{ personText('retry') }}</button></div>
            <div v-else class="conversation">
              <div v-if="messageSearchOpen" class="messenger-search conversation-search"><AppIcon name="search" /><input v-model="messageQuery" type="search" :aria-label="ui('searchChat')" :placeholder="ui('searchChat')" /><button class="app-icon-button" :aria-label="ui('closeSearch')" @click="messageSearchOpen = false"><AppIcon name="close" /></button></div>
              <button v-if="pinnedIds.length" class="pinned-strip" @click="jumpToMessage(pinnedIds[0]!)"><span class="pinned-indicator" /><span><strong>{{ ui('pinned') }}<small v-if="pinnedIds.length > 1"> · {{ pinnedIds.length }}</small></strong><span>{{ messages.find(message => message.id === pinnedIds[0])?.body || ui('pinned') }}</span></span><AppIcon name="chevron" /></button>
              <div ref="log" class="message-log" role="log" aria-live="polite" :aria-label="u('messages')" @scroll="scrolled">
                <p v-if="historyBusy || openingHistory" class="history-loading" role="status">{{ ui('loadingHistory') }}</p>
                <p v-if="openingHistoryError" class="form-error" role="alert">{{ ui('historyFailed') }}<button class="quiet-button" @click="loadInitialHistory(true)">{{ personText('retry') }}</button></p>
                <div v-if="!messages.length" class="thread-start"><span>{{ ui('firstMessage') }}</span></div>
                <MessageList :items="timeline" v-slot="{ item }">
                  <MessageBubble
                    :id="item.message.id"
                    :mine="item.message.mine"
                    :locked="item.message.locked"
                    :grouped="item.grouped"
                    :highlighted="highlighted === item.message.id"
                    :selected="selectedMessages.includes(item.message.id)"
                    :selecting="selecting"
                    :sender="item.message.sender"
                    :show-sender="!activeChat.direct && !item.message.mine && !item.grouped"
                    :body="item.message.body"
                    :time-label="new Date(item.message.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })"
                    :status="item.message.status"
                    :status-label="m(item.message.status)"
                    :menu-label="ui('messageActions')"
                    :select-label="ui('selectOne') + ': ' + item.message.body"
                    :reply-id="item.message.reply"
                    :reply-preview="item.message.reply ? replyBody(item.message.reply) : undefined"
                    :has-voice="!!item.message.voice"
                    :has-photo="!!item.message.photoId"
                    @menu="messageMenu = item.message"
                    @toggle="toggleMessage(item.message.id)"
                    @reply-jump="jumpToMessage"
                    @press-start="press($event, item.message)"
                    @press-move="movePress"
                    @press-end="releasePress($event, item.message)"
                    @press-cancel="cancelPress"
                  >
                    <template #voice>
                      <VoiceMessagePlayer
                        v-if="item.message.voice && !item.message.locked"
                        :duration="item.message.voice.duration"
                        :waveform="item.message.voice.waveform"
                        :active="!profileOpen && !hidden"
                        :load="signal => loadVoice(item.message, signal)"
                      />
                    </template>
                    <template #photo>
                      <button
                        v-if="item.message.photoId && !item.message.locked"
                        class="message-photo"
                        @click.stop="router.push(`/gallery/${item.message.photoId}`)"
                      ><AppIcon name="gallery" />{{ w('openPhoto') }}</button>
                    </template>
                  </MessageBubble>
                </MessageList>
                <div v-if="messageQuery && !displayedMessages.length" class="thread-start">{{ ui('noMatches') }}</div>
              </div>
              <ScrollToBottomButton v-if="!atBottom" :label="ui('jump')" @click="scrollToLatest" />
              <div v-if="selecting" class="message-selection"><button class="quiet-button" :disabled="!selectedMessages.length || actionBusy" @click="askMessageDelete(selectedMessages, false)">{{ ui('deleteMine') }}</button><button v-if="canDeleteForEveryone(selectedMessages)" class="quiet-button" :disabled="!selectedMessages.length || actionBusy" @click="askMessageDelete(selectedMessages, true)">{{ ui('deleteAll') }}</button></div>
              <p v-else-if="!activeChat.encrypted || activeChat.blocked" class="message-error form-error" role="alert">{{ m(activeChat.blocked ? 'blocked' : 'unencrypted') }}</p>
              <div v-else-if="!security.verified" class="message-device-setup"><p>{{ m(diagnostic === 'ready' ? 'deviceRecoveryHint' : 'connecting') }}</p><button v-if="diagnostic === 'ready'" class="quiet-button" @click="securityOpen = true">{{ m(security.storage ? 'restore' : 'verifyDevice') }}</button></div>
              <MessageComposer
                v-else
                v-model="draft"
                :placeholder="m('message')"
                :input-label="m('message')"
                :send-label="m('send')"
                :cancel-reply-label="m('cancelReply')"
                :reply-label="m('reply')"
                :reply-preview="reply ? replyBody(reply) : undefined"
                :voice-dirty="voiceDirty"
                :disabled="actionBusy || connection !== 'ready' || !security.verified"
                @submit="submit"
                @cancel-reply="reply = ''"
              >
                <template #voice>
                  <VoiceRecorder
                    v-show="!draft.trim() || voiceDirty"
                    :key="selected"
                    :disabled="actionBusy || connection !== 'ready'"
                    :active="!profileOpen && !hidden"
                    :send="submitVoice"
                    @dirty="voiceDirty = $event"
                  />
                </template>
              </MessageComposer>
            </div>
            <p v-if="linkedError" class="form-error message-error" role="alert">{{ linkedError }}<button class="quiet-button" @click="enterDiscussion">{{ w('retry') }}</button></p>
            <p v-if="actionError" class="form-error message-error" role="alert">{{ actionError }}</p>
          </template>
          <div v-else class="messenger-desktop-empty"><span class="service-emblem"><AppIcon name="messages" /></span><h2>{{ ui('threadEmpty') }}</h2><p>{{ ui('threadEmptyHint') }}</p></div>
        </main>
      </MessengerSplitLayout>
    </template>
    <AppSheet :open="newOpen && !hidden" :title="group ? ui('newGroup') : ui('newMessage')" :busy="actionBusy" @close="closeNewMessage">
      <form class="new-message-sheet" @submit.prevent="group ? newChat() : findPerson()">
        <template v-if="!group"><button type="button" class="messenger-action" @click="group = true; directHandle = ''"><span class="action-icon"><AppIcon name="users" /></span>{{ ui('newGroup') }}<AppIcon name="chevron" /></button><button type="button" class="messenger-action" @click="newOpen = false; tab = 'contacts'"><span class="action-icon"><AppIcon name="plus" /></span>{{ m('addContact') }}<AppIcon name="chevron" /></button></template>
        <label v-if="group" class="native-form new-group-name">{{ m('chatName') }}<input v-model="chatName" maxlength="80" required /></label>
        <div class="messenger-search"><AppIcon name="search" /><input v-model="directHandle" :aria-label="ui('lookup')" :placeholder="ui('lookupHint')" autocapitalize="off" spellcheck="false" autocomplete="off" /><button v-if="!group" type="submit" class="app-icon-button" :aria-label="s('search')" :disabled="lookupBusy || !directHandle.trim()"><AppIcon name="chevron" /></button></div>
        <p v-if="lookupBusy" class="field-hint" role="status">{{ ui('findingPerson') }}</p>
        <article v-if="foundPerson && !group" class="messenger-found-person" :aria-label="ui('personFound')">
          <button type="button" class="messenger-person" :aria-label="personText('open')" @click="openPerson(foundPerson.publicId)"><span :class="['chat-avatar', avatarColor(foundPerson.publicId)]">{{ initials(foundPerson.fields.name || foundPerson.username || foundPerson.publicId) }}</span><span><strong>{{ foundPerson.fields.name || (foundPerson.username ? '@' + foundPerson.username : foundPerson.publicId) }}</strong><small v-if="foundPerson.username">@{{ foundPerson.username }}</small></span><AppIcon name="chevron" /></button>
          <p class="person-public-id">{{ foundPerson.publicId }}</p>
          <p v-if="foundPerson.fields.about" class="person-about">{{ foundPerson.fields.about }}</p>
          <dl v-if="foundPerson.fields.email || foundPerson.fields.phone || foundPerson.fields.links" class="native-facts"><template v-for="field in (['email', 'phone', 'links'] as const)" :key="field"><div v-if="foundPerson.fields[field]"><dt>{{ a(field) }}</dt><dd>{{ foundPerson.fields[field] }}</dd></div></template></dl>
          <div class="person-primary-actions"><button type="button" class="primary-button" :disabled="actionBusy" @click="writeDirect(foundPerson.publicId)"><AppIcon name="messages" />{{ actionBusy ? personText('opening') : ui('write') }}</button><button type="button" class="secondary-button" :disabled="actionBusy || !callsEnabled || callPhase !== 'idle'" @click="writeDirect(foundPerson.publicId, true)"><AppIcon name="phone" />{{ callText('audio') }}</button></div>
          <p v-if="!callsEnabled" class="field-hint">{{ ui('callsUnavailable') }}</p>
          <p v-else-if="callPhase !== 'idle'" class="field-hint">{{ callText('busy') }}</p>
        </article>
        <p v-if="lookupError && !listedPeers.length" class="field-hint" role="status">{{ lookupError === 'missing' ? m('contactUnavailable') : ui('lookupFailed') }}</p>
        <p v-if="!listedPeers.length && !foundPerson && !lookupBusy && !lookupError" class="new-message-empty">{{ directHandle ? ui('noMatches') : m('noContacts') }}</p>
        <template v-for="peer in listedPeers.filter(peer => peer.publicId !== foundPerson?.publicId)" :key="peer.publicId">
          <label v-if="group" class="messenger-person"><span :class="['chat-avatar', avatarColor(peer.publicId)]">{{ initials(peer.fields.name || peer.username || peer.publicId) }}</span><span><strong>{{ peer.fields.name || (peer.username ? '@' + peer.username : peer.fields.username || peer.publicId) }}</strong><small>{{ peer.username ? '@' + peer.username : peer.publicId }}</small></span><input v-model="chosen" type="checkbox" :aria-label="peer.publicId" :value="peer.publicId" /></label>
          <button v-else type="button" class="messenger-person picker-row" :disabled="actionBusy" @click="directHandle = peer.publicId"><span :class="['chat-avatar', avatarColor(peer.publicId)]">{{ initials(peer.fields.name || peer.username || peer.publicId) }}</span><span><strong>{{ peer.fields.name || (peer.username ? '@' + peer.username : peer.fields.username || peer.publicId) }}</strong><small>{{ peer.username ? '@' + peer.username : peer.publicId }}</small></span><AppIcon name="chevron" /></button>
        </template>
        <button v-if="group" class="primary-button" :disabled="actionBusy || !chosen.length || !chatName.trim()">{{ m('create') }}<span v-if="chosen.length" aria-hidden="true"> · {{ chosen.length }}</span></button>
        <p v-if="actionError" class="form-error" role="alert">{{ actionError }}</p>
      </form>
    </AppSheet>
    <AppSheet :open="!!messageMenu && !hidden" :title="ui('messageActions')" :busy="actionBusy" @close="messageMenu = undefined">
      <MessageActionList
        v-if="messageMenu"
        :preview="messageMenu.body"
        :actions="messageActions"
        @action="handleMessageAction"
      />
    </AppSheet>
    <AppSheet :open="!!chatMenu && !hidden" :title="rooms.find(room => room.id === chatMenu)?.name || ui('chatActions')" :busy="actionBusy" @close="chatMenu = ''">
      <button v-if="chatMenu === selected" class="messenger-action" @click="messageSearchOpen = true; chatMenu = ''"><AppIcon name="search" />{{ ui('searchChat') }}</button>
      <button v-if="chatMenu === selected" class="messenger-action" @click="selecting = true; selectedMessages = []; chatMenu = ''"><AppIcon name="check" />{{ ui('select') }}</button>
      <button class="messenger-action" @click="perform(() => archiveConversation(chatMenu, !rooms.find(room => room.id === chatMenu)?.archived)); chatMenu = ''; swiped = ''"><AppIcon name="archive" />{{ ui(rooms.find(room => room.id === chatMenu)?.archived ? 'unarchive' : 'archiveAction') }}</button>
      <button v-if="chatMenu === selected" class="messenger-action" @click="detailsOpen = true; chatMenu = ''"><AppIcon name="users" />{{ m('details') }}</button>
      <button v-if="callsEnabled && chatMenu === selected" class="messenger-action" :disabled="connection !== 'ready' || callPhase !== 'idle'" @click="joinCall(selected, true); chatMenu = ''"><AppIcon name="video" />{{ callText('video') }}</button>
      <button class="messenger-action subtle-danger" @click="askDelete(chatMenu); chatMenu = ''"><AppIcon name="trash" />{{ ui('deleteChat') }}</button>
    </AppSheet>
    <AppSheet :open="messageDeleteOpen && !hidden" :title="ui('delete')" :busy="actionBusy" @close="messageDeleteOpen = false">
      <p>{{ ui('messageSelected') }}: {{ deletingMessages.length }}</p><label v-if="canDeleteForEveryone(deletingMessages)" class="check-row"><input v-model="messageDeleteEveryone" type="checkbox" />{{ ui('deleteAll') }}</label><button class="danger-button" :disabled="actionBusy" @click="confirmMessageDelete">{{ ui(messageDeleteEveryone ? 'deleteAll' : 'deleteMine') }}</button><p v-if="actionError" class="form-error" role="alert">{{ actionError }}</p>
    </AppSheet>
    <AppSheet
      :open="!!deleteTarget && !hidden"
      :title="ui('deleteConversation')"
      :busy="actionBusy || historyBusy"
      @close="deleteTarget = ''"
      ><div class="native-form">
        <p>
          {{ ui('deleteConversationQuestion') }}
        </p>
        <label
          v-if="rooms.find((room) => room.id === deleteTarget)?.direct"
          class="check-row"
          ><input v-model="deleteForAll" type="checkbox" />{{ ui('deleteBoth') }}</label
        >
        <p class="field-hint">
          {{ ui('deleteConversationHint') }}
        </p>
        <button
          class="primary-button"
          :disabled="actionBusy || historyBusy"
          @click="confirmDelete"
        >
          {{ ui(historyBusy ? 'deletingHistory' : 'deleteConversation') }}
        </button>
        <p v-if="actionError" role="alert">{{ actionError }}</p>
      </div></AppSheet
    >
    <AppSheet
      :open="securityOpen && !hidden"
      :title="m('security')"
      :busy="recoveryBusy"
      @close="() => { securityOpen = false; pendingPeer = '' }"
      ><div class="native-form">
        <p class="field-hint">{{ m('singleKeyHint') }}</p>
        <p v-if="security.verified" class="form-notice">{{ m('deviceVerified') }}</p>
        <p v-if="security.backup" class="field-hint">{{ m('backupEnabled') }}</p>
        <button v-if="!accountRecoveryReady" class="primary-button" @click="router.push('/profile/account?mode=connect')">{{ m('connectAccountKey') }}</button>
        <button v-else class="secondary-button" @click="router.push('/profile/photos-security')">{{ m('saveAccountKey') }}</button>
        <template v-if="!security.verified && accountRecoveryReady">
          <p class="field-hint">{{ m('accountRecoveryPending') }}</p>
          <button class="secondary-button" :disabled="recoveryBusy" @click="perform(async () => { await verifyOwnDevice(); securityOpen = false })">{{ m('verifyDevice') }}</button>
          <details v-if="security.storage">
            <summary>{{ m('legacyImport') }}</summary>
            <form class="native-form" @submit.prevent="restore">
              <label>{{ m('legacyHistoryKey') }}<textarea v-model="restoreInput" rows="4" spellcheck="false" autocomplete="off" /></label>
              <button class="primary-button" :disabled="recoveryBusy || !restoreInput.trim()">{{ m('legacyImport') }}</button>
            </form>
          </details>
        </template>
        <p v-if="recoveryError" class="form-error" role="alert">
          {{ m(recoveryError) }}
        </p>
        <p v-if="actionError" class="form-error" role="alert">{{ actionError }}</p>
        <p v-if="restored" class="form-notice" role="status">
          {{ m('restored') }} · {{ restoredKeys }}
        </p>
      </div></AppSheet
    >
    <AppSheet
      :open="detailsOpen && !hidden"
      :title="m('details')"
      :busy="actionBusy"
      @close="detailsOpen = false"
      ><div v-if="activeChat" class="inline-actions">
        <button
          class="secondary-button"
          @click="
            () => {
              perform(() =>
                archiveConversation(selected, !activeChat?.archived),
              )
              detailsOpen = false
            }
          "
        >
          {{ activeChat.archived ? 'Из архива' : 'В архив' }}</button
        ><button
          class="secondary-button subtle-danger"
          @click="
            () => {
              askDelete(selected)
              detailsOpen = false
            }
          "
        >
          Удалить переписку
        </button>
      </div>
      <div v-if="activeChat" class="native-form">
        <p class="field-hint">{{ m('metadataHint') }}</p>
        <p v-for="member in activeChat.members" :key="member.id">
          {{ member.name }}
        </p>
        <p v-if="activeChat.direct" class="field-hint">
          {{ m(peerVerified ? 'verified' : 'notVerified') }}
        </p>
        <button
          v-if="activeChat.direct"
          class="secondary-button"
          @click="perform(verifyContact)"
        >
          {{ m('verify') }}</button
        ><button
          v-if="activeChat.direct"
          class="quiet-button subtle-danger"
          @click="block"
        >
          {{ m('block') }}</button
        ><button class="quiet-button subtle-danger" @click="leave">
          {{ m('leave') }}
        </button>
        <p v-if="actionError" class="form-error" role="alert">
          {{ actionError }}
        </p>
      </div></AppSheet
    >
    <AppSheet
      :open="!!verification && !hidden"
      :title="m('verifyIncoming')"
      :busy="false"
      @close="cancelVerification"
      ><div class="native-form">
        <p class="field-hint">{{ m('verifyHint') }}</p>
        <div v-if="sas" class="sas-grid">
          <span v-for="(emoji, index) in sas.sas.emoji" :key="index"
            ><strong>{{ emoji[0] }}</strong
            ><small>{{ emoji[1] }}</small></span
          >
        </div>
        <template v-if="sas"
          ><button
            class="primary-button"
            @click="perform(() => confirmVerification(true))"
          >
            {{ m('match') }}</button
          ><button
            class="secondary-button"
            @click="perform(() => confirmVerification(false))"
          >
            {{ m('mismatch') }}
          </button></template
        ><button
          v-else-if="verificationPhase === 2 && !verification?.initiatedByMe"
          class="primary-button"
          @click="perform(acceptVerification)"
        >
          {{ m('verifyAccept') }}
        </button>
        <p v-else role="status">
          {{
            m(
              verificationPhase === 6
                ? 'verified'
                : verificationPhase === 5
                  ? 'cancelled'
                  : 'verifyWaiting',
            )
          }}
        </p>
      </div></AppSheet
    >
  </section>
</template>
