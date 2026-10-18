import { locale } from '../i18n'
const copy = {
  search: ['Поиск чатов и сообщений', 'Search chats and messages'], searchChat: ['Поиск сообщений', 'Search messages'],
  searchHistory: ['Искать сообщения во всех чатах', 'Search messages in all chats'], searching: ['Ищем в истории…', 'Searching history…'],
  archive: ['Архив', 'Archived chats'], archiveAction: ['В архив', 'Archive'], unarchive: ['Из архива', 'Unarchive'],
  deleteChat: ['Удалить чат', 'Delete chat'], chatActions: ['Действия с чатом', 'Chat actions'], messageActions: ['Действия с сообщением', 'Message actions'],
  select: ['Выбрать сообщения', 'Select messages'], selectOne: ['Выбрать', 'Select'], selectAll: ['Выбрать все', 'Select all'], cancelSelection: ['Отменить выбор', 'Cancel selection'],
  deleteMine: ['Удалить у меня', 'Delete for me'], deleteAll: ['Удалить у всех', 'Delete for everyone'],
  pin: ['Закрепить', 'Pin'], unpin: ['Открепить', 'Unpin'], pinned: ['Закреплённое сообщение', 'Pinned message'],
  newGroup: ['Создать группу', 'New group'], newMessage: ['Новое сообщение', 'New message'],
  lookup: ['ID или @username', 'ID or @username'], lookupHint: ['ID, @username или имя контакта', 'ID, @username or contact name'], write: ['Написать', 'Message'],
  findingPerson: ['Ищем пользователя…', 'Finding user…'], personFound: ['Найденный пользователь', 'User found'],
  lookupFailed: ['Не удалось найти пользователя. Проверьте соединение и повторите поиск.', 'Could not look up the user. Check your connection and retry.'],
  callsUnavailable: ['Звонки сейчас недоступны.', 'Calls are currently unavailable.'],
  noMatches: ['Ничего не найдено', 'No results'], noMatchesHint: ['Попробуйте другое имя или слово.', 'Try another name or word.'],
  emptyHint: ['Нажмите +, чтобы написать человеку или создать группу.', 'Tap + to message someone or create a group.'],
  threadEmpty: ['Выберите чат', 'Select a chat'], threadEmptyHint: ['Откройте переписку слева или начните новую.', 'Open a conversation on the left or start a new one.'],
  direct: ['Личная переписка', 'Direct conversation'], participant: ['Пользователь', 'User'],
  members: ['участников', 'members'], today: ['Сегодня', 'Today'], yesterday: ['Вчера', 'Yesterday'],
  noMessages: ['Сообщений пока нет', 'No messages yet'], firstMessage: ['Напишите первое сообщение', 'Send the first message'],
  jump: ['К последним сообщениям', 'Jump to latest messages'], loadingHistory: ['Загружаем историю…', 'Loading history…'],
  historyFailed: ['Не удалось загрузить сообщения. Повторите загрузку.', 'Could not load messages. Retry loading.'],
  closeSearch: ['Закрыть поиск', 'Close search'], clearSearch: ['Очистить поиск', 'Clear search'],
  messageSelected: ['Выбрано', 'Selected'], contacts: ['Контакты', 'Contacts'],
  deletedMessage: ['Сообщение удалено', 'Message deleted'], delete: ['Удалить', 'Delete'],
  offlineShort: ['Нет подключения', 'No connection'],
  deleteConversation: ['Удалить переписку', 'Delete conversation'], deletingHistory: ['Удаляем историю…', 'Deleting history…'],
  deleteConversationQuestion: ['Будет удалена вся история переписки, включая сообщения, которые ещё не загружены на это устройство.', 'The entire conversation history will be deleted, including messages not yet loaded on this device.'],
  deleteBoth: ['Также удалить сообщения у собеседника', 'Also delete messages for the other person'],
  deleteConversationHint: ['Удаление у меня синхронизируется между моими устройствами. Полученные и сохранённые вне приложения копии удалить невозможно.', 'Deleting for me syncs across my devices. Copies received and saved outside the app cannot be removed.'],
} as const
export function ui(key: keyof typeof copy) { return copy[key][locale.value === 'ru' ? 0 : 1] }
export function initials(name: string) {
  const words = name.replace(/^@/, '').trim().split(/\s+/).filter(Boolean)
  return ((words[0]?.[0] ?? '?') + (words.length > 1 ? words.at(-1)![0] : '')).toLocaleUpperCase()
}
export function avatarColor(id: string) {
  let hash = 0
  for (const char of id) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0
  return `avatar-color-${Math.abs(hash) % 6}`
}
export function dayLabel(time: number, now = Date.now()) {
  const date = new Date(time), today = new Date(now), yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return ui('today')
  if (date.toDateString() === yesterday.toDateString()) return ui('yesterday')
  return date.toLocaleDateString(locale.value === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'long', ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) })
}
export function chatTime(time?: number, now = Date.now()) {
  if (!time) return ''
  const date = new Date(time)
  return date.toDateString() === new Date(now).toDateString()
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString(locale.value === 'ru' ? 'ru-RU' : 'en-US', { day: 'numeric', month: 'short' })
}
