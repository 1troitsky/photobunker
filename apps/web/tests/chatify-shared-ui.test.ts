import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ConversationListItem from '../src/messages/shared-ui/ConversationListItem.vue'
import MessageDateSeparator from '../src/messages/shared-ui/MessageDateSeparator.vue'
import MessageStatusTicks from '../src/messages/shared-ui/MessageStatusTicks.vue'

const conversation = {
  id: '!room:example',
  name: 'Private group',
  avatarClass: 'avatar-color-2',
  avatarInitials: 'PG',
  group: false,
  timeLabel: '12:34',
  preview: 'Decrypted only in the active Matrix session',
  unreadCount: 3,
}

describe('transport-independent adapted Chatify UI', () => {
  it('renders a prepared conversation without looking up or storing its decrypted preview', async () => {
    const wrapper = mount(ConversationListItem, {
      props: { conversation, active: false, swiped: false },
    })
    expect(wrapper.text()).toContain(conversation.name)
    expect(wrapper.text()).toContain(conversation.preview)
    expect(wrapper.text()).toContain('12:34')
    expect(wrapper.find('.chat-unread').text()).toBe('3')
    expect(wrapper.find('button').attributes('aria-current')).toBeUndefined()

    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('select')).toHaveLength(1)
  })

  it('keeps original room swipe, active and unread behavior', async () => {
    const wrapper = mount(ConversationListItem, {
      props: { conversation: { ...conversation, unreadCount: 105 }, active: true, swiped: true },
    })
    expect(wrapper.find('.chat-unread').text()).toBe('99+')
    expect(wrapper.get('button').classes()).toContain('chat-active')
    expect(wrapper.get('button').attributes('aria-current')).toBe('true')
    expect(wrapper.get('button').attributes('style')).toContain('translateX(-112px)')

    await wrapper.setProps({ conversation: { ...conversation, group: true, unreadCount: 0 }, active: false, swiped: false })
    expect(wrapper.find('.chat-unread').exists()).toBe(false)
    expect(wrapper.find('.chat-avatar svg').exists()).toBe(true)
    expect(wrapper.get('button').attributes('style') ?? '').not.toContain('translateX')
  })

  it('renders untrusted preview as text rather than interpreting HTML', () => {
    const wrapper = mount(ConversationListItem, {
      props: {
        conversation: { ...conversation, name: '<img src=x onerror=alert(1)>', preview: '<script>steal()</script>' },
        active: false,
        swiped: false,
      },
    })
    expect(wrapper.text()).toContain('<script>steal()</script>')
    expect(wrapper.find('script').exists()).toBe(false)
    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('renders date labels supplied by the host without local date or account assumptions', () => {
    const wrapper = mount(MessageDateSeparator, { props: { label: 'Сегодня' } })
    expect(wrapper.get('.message-day').text()).toBe('Сегодня')
  })

  it('shows a second read tick only when the adapter reports an actual read receipt', async () => {
    const wrapper = mount(MessageStatusTicks, { props: { read: false } })
    expect(wrapper.findAll('path')).toHaveLength(1)
    expect(wrapper.find('.chatify-message-ticks-sent').exists()).toBe(true)
    await wrapper.setProps({ read: true })
    expect(wrapper.findAll('path')).toHaveLength(2)
    expect(wrapper.find('.chatify-message-ticks-read').exists()).toBe(true)
    expect(wrapper.get('span').attributes('aria-hidden')).toBe('true')
  })
})
