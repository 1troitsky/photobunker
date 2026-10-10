# UI / UX Foundation — native-feeling PWA
Статус: требования к поведению, не пиксельный макет.

## 1. Design intent
Приложение по ощущению — камера iPhone/Android и быстрый приватный архив, НЕ сайт с верхним меню. Минимальное количество текстов и экранов до съёмки. Без рекламных экранов, обязательных туториалов, принудительных social login, громоздкой корпоративной панели, модальных подтверждений каждого кадра. Responsive **adaptive**: мобильная оболочка со своей навигацией, планшетная, десктопная галерея/редактор.

## 2. Launch
Настройка home screen: Camera (default), Gallery, Last screen. В PWA standalone есть splash/loading skeleton без длинного логотипа; сразу восстановить последний выбранный Vault, если это безопасно. При отсутствии camera permission показать короткий понятный экран «Разрешите камеру» и retry, а не пустой видоискатель. Camera preview не должен перекрываться браузерными прокрутками. Safe-area top/bottom, notch, home-indicator, landscape, keyboard, reduced motion, high contrast, larger font.

## 3. Camera UI
Полноэкранный live preview; крупная кнопка shutter в нижней reachable зоне; переключение камеры, миниатюра/переход в Vault (под PIN), переключатель Vault/profile одним действием, индикатор связи/очереди. Без звука/вибрации приложения по умолчанию. Последний thumbnail перед PIN не должен показывать содержимое закрытого архива (может быть нейтральная иконка). UI response shutter немедленный; состояние полной фиксации снимка должно различаться.
Никакого пост-кадрового обязательного экрана «Сохранить». Сессия помнит контекст; required metadata can be deferred и показывается как incomplete, без отмены кадра.

## 4. PIN / security screens
Default: Capture accessible, Gallery/Editor/Vault list/Settings guarded by PIN; режимы All protected и Off; длина PIN 4/6/8 по настройке, six preferred. PIN повторно после background/idle; настройка таймаута. Два слоя UX: local gate и strong cryptographic unlock (реализовать без ложного обещания, см. 06). Не показывать открытый архив под overlay lock; очищать/скрывать decrypted previews при lock/visibility change. При отказе в PIN — rate-limit/локальная задержка, без утечек существования альбомов. Recovery phrase shown once with confirmation; потеря Recovery Key + устройств необратима.

## 5. Sync indications — **обязательны**
- Camera top status: icon и лаконичная подпись («В облаке» / «В очереди: 3» / «Нет сети»).
- После каждого захвата маленькое неблокирующее подтверждение; если **ещё не загружено**, явное предупреждение **«Фото ещё не в облаке. Оно хранится только в зашифрованной очереди устройства. Не удаляйте данные приложения»**. При закрытии/Quick Exit warning доступно без открытия приватной галереи: только статус и count, не thumbnails.
- Не показывать green cloud/success до серверной проверки upload finalize.
- GPS pending: **«Местоположение уточняется»**; при недостаточной точности: **«GPS неточен: ± N м»**, при отказе/невозможности: «Без геолокации». Если пользователь уходит с кадром pending, предупреждение «Точные координаты могут не успеть определиться при закрытии приложения».
- Статусы загрузки и GPS **независимы**: фото уже в облаке + GPS пока уточняется — нормальный сценарий.
- Экраны с ошибками: offline, permission denied, quota exceeded, encrypted queue storage full, upload failed, auth expired, geo permission denied, expired object, invalid recovery, lost key.

## 6. Quick Exit
Доступный из камеры жест/кнопка (обнаружимый, не конфликтующий с системными жестами): остановить camera track, скрыть всю приватную информацию, очистить decrypt-preview из UI и показать нейтральный экран. Не заявлять, что он закрывает установленную PWA программно или завершает фоновые операции. Когда есть неотправленные файлы, вывести **не раскрывающее содержимого** предупреждение об их статусе; можно настроить баланс между conspicuous warning и discretion (например, отдельный нейтральный значок/count). Отдельно показать предупреждение GPS при незавершённом уточнении.

## 7. Gallery
Сетка thumbnails, локально расшифровываемых по мере надобности; списки Vault/Album, сортировка, фильтры по локально расшифрованным category/time/location, поиск локальным индексом, карточка с metadata status и edit history. Bulk select/share/delete; virtualized gallery, ограниченная память, prefetch без угрозы скрытым plaintext caches. При PIN lock — убрать изображения, не просто наложить декоративный слой.
Навигация жестами (swipe между фото, pinch zoom), но все функции доступны и кнопками/клавиатурой.

## 8. Editing & sharing
Editor на отдельной рабочей поверхности: сразу фото, маленькая toolbar, отмена/повтор, кнопка version save; ошибки сохранения и offline явно обозначены. На десктопе — двухпанельный layout с настройками; на мобильном — bottom sheet. Shared vault показывает status review и заметки, не перегружая личную галерею.

## 9. Accessibility & performance
Target как инженерные цели: input-to-visual-shutter <100ms на тестовых современных устройствах; быстрое возвращение к повторной съёмке; запускаем camera first без ожидания GPS/облака. Это targets, НЕ гарантия. Не сжимать каждый оригинал в FullHD по умолчанию; оригинал высокого качества, если браузер разрешает. Сетевые загрузки отдельно от UI thread, heavy image processing worker/offscreen canvas где доступно. Реальные тесты iPhone Safari Home Screen, Android Chrome PWA, desktop browsers.
Копирайт локализуемый, контраст читаемый на live viewfinder, reduced motion.
