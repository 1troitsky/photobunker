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
  attachLabel?: string
  removeAttachmentLabel?: string
  attachment?: { name: string; size: number; kind: 'image' | 'file'; preview?: string }
  attachmentBusy?: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [text: string]
  submit: []
  cancelReply: []
  attach: []
  removeAttachment: []
  selectFile: [file: File]
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
  if (event.key !== 'Enter' || event.isComposing || event.shiftKey || event.defaultPrevented || props.disabled || (!props.modelValue.trim() && !props.attachment)) return
  // Desktop Enter and Cmd/Ctrl+Enter; mobile Enter inserts a newline.
  const finePointer = typeof matchMedia === 'function' && matchMedia('(pointer:fine)').matches
  if (!event.ctrlKey && !event.metaKey && !finePointer) return
  event.preventDefault()
  emit('submit')
}
function onDrop(event: DragEvent) {
  if (props.disabled || props.voiceDirty || props.attachment) return
  const file = event.dataTransfer?.files?.[0]
  if (file) emit('selectFile', file)
}
function onPaste(event: ClipboardEvent) {
  if (props.disabled || props.voiceDirty || props.attachment) return
  const file = event.clipboardData?.files?.[0]
  if (file) { event.preventDefault(); emit('selectFile', file) }
}
watch(() => props.modelValue, () => { void nextTick(resize) })
defineExpose({ focus: () => textarea.value?.focus() })
</script>

<template>
  <form class="message-composer chatify-message-composer" @submit.prevent="!disabled && (modelValue.trim() || attachment) && emit('submit')" @dragover.prevent @drop.prevent="onDrop" @paste="onPaste">
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
    <div v-if="attachment" class="chatify-composer-attachment" :aria-busy="attachmentBusy">
      <img v-if="attachment.kind === 'image' && attachment.preview" :src="attachment.preview" :alt="attachment.name" />
      <span><strong>{{ attachment.name }}</strong><small>{{ (attachment.size / 1024 / 1024).toFixed(1) }} MB</small></span>
      <button type="button" class="app-icon-button" :aria-label="removeAttachmentLabel || 'Remove attachment'" :disabled="attachmentBusy" @click="emit('removeAttachment')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
      </button>
    </div>
    <button v-if="attachLabel" type="button" class="app-icon-button chatify-composer-attach" :aria-label="attachLabel" :disabled="disabled || voiceDirty" @click="emit('attach')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="m21 11.5-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l9.8-9.8a3.7 3.7 0 0 1 5.3 5.2l-9.7 9.7a1.9 1.9 0 0 1-2.7-2.6l8.5-8.5"/></svg>
    </button>
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
      v-if="(modelValue.trim() || attachment) && !voiceDirty"
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
