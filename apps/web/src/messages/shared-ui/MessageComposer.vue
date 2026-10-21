<script setup lang="ts">
// UI adapted from Chatify v2 MessageComposer.vue, commit
// 4a39eacb44e2405baa8c1e3bd3b4644fc5c8707d (MIT).
// No Matrix, Laravel, SDK, crypto, storage, network, or side effects.
import { nextTick, ref, watch } from 'vue'

const props = defineProps<{
  modelValue: string
  placeholder: string
  inputLabel: string
  sendLabel: string
  cancelReplyLabel: string
  replyLabel: string
  replyPreview?: string
  voiceDirty: boolean
  disabled: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [text: string]
  submit: []
  cancelReply: []
}>()

const textarea = ref<HTMLTextAreaElement>()
const MAX_HEIGHT = 140
function resize() {
  const input = textarea.value
  if (!input) return
  input.style.height = 'auto'
  input.style.height = Math.min(input.scrollHeight, MAX_HEIGHT) + 'px'
  input.style.overflowY = input.scrollHeight > MAX_HEIGHT ? 'auto' : 'hidden'
}
function onInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLTextAreaElement).value)
  resize()
}
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' || event.isComposing || event.shiftKey || event.defaultPrevented || props.disabled || !props.modelValue.trim()) return
  // Desktop Enter and Cmd/Ctrl+Enter; mobile Enter inserts a newline.
  const finePointer = typeof matchMedia === 'function' && matchMedia('(pointer:fine)').matches
  if (!event.ctrlKey && !event.metaKey && !finePointer) return
  event.preventDefault()
  emit('submit')
}
watch(() => props.modelValue, () => { void nextTick(resize) })
defineExpose({ focus: () => textarea.value?.focus() })
</script>

<template>
  <form class="message-composer chatify-message-composer" @submit.prevent="!disabled && modelValue.trim() && emit('submit')">
    <div v-if="replyPreview !== undefined" class="reply-preview chatify-composer-reply">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="m10 8-6 4 6 4V8Zm-6 4h9a6 6 0 0 1 6 6" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      <span><strong>{{ replyLabel }}</strong><span>{{ replyPreview }}</span></span>
      <button type="button" class="app-icon-button" :aria-label="cancelReplyLabel" @click="emit('cancelReply')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="m6 6 12 12M18 6 6 18" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
    </div>
    <label v-show="!voiceDirty" class="message-input">
      <span class="visually-hidden">{{ inputLabel }}</span>
      <textarea
        ref="textarea"
        :value="modelValue"
        :aria-label="inputLabel"
        :placeholder="placeholder"
        :disabled="disabled"
        maxlength="10000"
        rows="1"
        @input="onInput"
        @keydown="onKeydown"
      />
    </label>
    <slot name="voice" />
    <button
      v-if="modelValue.trim() && !voiceDirty"
      type="submit"
      class="app-icon-button message-send"
      :aria-label="sendLabel"
      :disabled="disabled"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="m4 4 16 8-16 8 3.5-8L4 4Z" stroke-linejoin="round" /><path d="M8 12h12" />
      </svg>
    </button>
  </form>
</template>
