<script setup lang="ts">
// PhotoBunker adaptation of Chatify v2 MessageBubble/MessageDeliveryStatus.
// Source: munafio/chatify@4a39eacb44e2405baa8c1e3bd3b4644fc5c8707d
// Display only: no Matrix client, crypto, key store, network or storage.
import MessageStatusTicks from './MessageStatusTicks.vue'

defineProps<{
  id: string
  mine: boolean
  locked: boolean
  grouped: boolean
  highlighted: boolean
  selected: boolean
  selecting: boolean
  sender: string
  showSender: boolean
  body: string
  timeLabel: string
  status: 'sending' | 'sent' | 'read' | 'notSent'
  statusLabel: string
  menuLabel: string
  selectLabel: string
  replyId?: string
  replyPreview?: string
  hasVoice: boolean
  hasPhoto: boolean
  hasAttachment?: boolean
}>()

const emit = defineEmits<{
  menu: []
  toggle: []
  replyJump: [id: string]
  pressStart: [event: PointerEvent]
  pressMove: [event: PointerEvent]
  pressEnd: [event: PointerEvent]
  pressCancel: []
}>()
</script>

<template>
  <article
    :class="['message-bubble', 'chatify-message-bubble', {
      'message-mine': mine,
      'message-locked': locked,
      'message-grouped': grouped,
      'message-highlighted': highlighted,
      'message-selected': selected,
    }]"
    :data-event-id="id"
    tabindex="0"
    aria-haspopup="dialog"
    :aria-label="menuLabel"
    @contextmenu.prevent="emit('menu')"
    @keydown.enter.self.prevent="emit('menu')"
    @pointerdown="emit('pressStart', $event)"
    @pointermove="emit('pressMove', $event)"
    @pointerup="emit('pressEnd', $event)"
    @pointercancel="emit('pressCancel')"
    @click="selecting && emit('toggle')"
  >
    <label v-if="selecting" class="message-select" @click.stop>
      <input type="checkbox" :checked="selected" :aria-label="selectLabel" @change="emit('toggle')" />
    </label>
    <strong v-if="showSender" class="message-author">{{ sender }}</strong>
    <blockquote
      v-if="replyId"
      class="chatify-reply-preview"
      role="button"
      tabindex="0"
      @click.stop="emit('replyJump', replyId)"
      @keydown.enter.stop.prevent="emit('replyJump', replyId)"
    >{{ replyPreview }}</blockquote>
    <slot v-if="hasVoice && !locked" name="voice" />
    <slot v-if="hasAttachment && !locked" name="attachment" />
    <p v-if="locked || (!hasVoice && !hasAttachment) || (hasAttachment && !!body)" class="message-body">{{ body }}</p>
    <slot v-if="hasPhoto && !locked" name="photo" />
    <footer>
      <time>{{ timeLabel }}</time>
      <span v-if="mine" :class="['message-state', 'message-state-' + status]" :aria-label="statusLabel">
        <svg v-if="status === 'sending'" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="6" stroke="currentColor" />
          <path d="M8 4v4l3 2" stroke="currentColor" />
        </svg>
        <svg v-else-if="status === 'notSent'" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="6" stroke="currentColor" />
          <path d="m5.5 5.5 5 5m0-5-5 5" stroke="currentColor" />
        </svg>
        <MessageStatusTicks v-else :read="status === 'read'" />
      </span>
    </footer>
    <button
      v-if="!selecting"
      type="button"
      class="app-icon-button message-menu-button"
      :aria-label="menuLabel"
      @click.stop="emit('menu')"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="5" cy="12" r="1.7" />
        <circle cx="12" cy="12" r="1.7" />
        <circle cx="19" cy="12" r="1.7" />
      </svg>
    </button>
  </article>
</template>
