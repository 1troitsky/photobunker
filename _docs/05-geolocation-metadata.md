# Geolocation & Metadata — Delayed Enrichment
Статус: обязательная спецификация. **Местоположение асинхронное и необязательное для физического захвата.**

## 1. Capture first, location later
При открытии камеры (только после явного разрешения пользователя и если location включена для Vault/profile) стартовать navigator.geolocation.watchPosition с enableHighAccuracy: true и осторожным maximumAge/timeout; получить samples ещё до shutter. Нажатие затвора фиксирует snapshot capture_at + sample history; оно **никогда не ждёт GPS**. После захвата координаты могут «догонять» уже загруженный asset отдельной зашифрованной metadata revision. Файл/оригинал заново не передаётся.

## 2. Разные времена и данные
- captured_at: клиентская отметка времени кадра; received_at: отдельная серверная отметка поступления, не доказательство снимка.
- sample measured_at: timestamp геоизмерения (не timestamp callback), observed_at клиентом, lat/long, accuracy meters, optional altitude/altitudeAccuracy/heading/speed только если действительно есть, permission/precision state.
- selected location: lat/long/accuracy + source pre-capture/post-capture/manual/approximate + offset_ms к captured_at + quality status + algorithm version.
- Всегда показывать **accuracy radius (95% confidence)**, никогда не объявлять 7 десятичных знаков «точностью до шага». GPS.gov для смартфонов в открытом небе приводит ориентир около 4.9 м, в городе/помещении хуже; лучшие результаты возможны, но не гарантируются.
- Все samples, окончательная location, категория, описание, session context, адрес/geocoding, теги и содержимое EXIF шифруются на клиенте. Server-visible GPS запрещён по умолчанию. Reverse-geocoding внешним API может раскрывать локацию: default OFF, только explicit opt-in / self-hosted service и disclosure.

## 3. Выбор измерения
Алгоритм должен быть документирован и тестируем, а не просто «самое маленькое accuracy»:
1. Отфильтровать invalid coordinates, NaN, implausible timestamps, stale samples; сохранить информацию о причинах discard.
2. Определить диапазон рядом с capture_at. Предпочесть снимок максимально близкий по времени и с подходящей accuracy; учитывать движение/скорость и возможное перемещение.
3. Если измерение точнее, но получено значительно позже (человек ушёл), не подменять снимок этой позицией. Выставить post-capture approximation + time delta. Не выдавать интерполяцию за measured at shutter.
4. Прозрачно показывать achieved accuracy и measured_at / offset. Явно отличать measured, estimated/interpolated, manual.
5. Кураторские required location/accuracy правила могут пометить asset «requirements incomplete», но кадр и очередь остаются доступны.
Рекомендуемые default capture-location window 15 секунд active foreground после затвора; это **конфиг**, не обещание точности. Порог «good accuracy» конфиг профиля; необязательный в личном Vault. Если нет годного измерения — no location.

## 4. UI состояния независимы от sync
- GPS_DISABLED (по настройке Vault), PERMISSION_NEEDED, ACQUIRING, PRECISE, APPROXIMATE, INSUFFICIENT_ACCURACY, PERMISSION_DENIED, UNAVAILABLE, TIMED_OUT.
- В момент выхода с ACQUIRING/INSUFFICIENT показывать **«GPS не успел точно определиться. После закрытия PWA уточнение, вероятно, остановится»**. Не блокировать shutter/Quick Exit.
- Текущее состояние server upload может быть CLOUD_CONFIRMED, пока location ACQUIRING. Отобразить оба.
- Редактирование metadata revision возможно владельцем/куратором при наличии прав; ручная координата всегда помечена MANUAL и не заменяет original evidence.
- Пользователь может выключить GPS для отдельного Vault/кадра; точные координаты чувствительны. Не пытаться обойти OS approximate location.

## 5. Финализация
Когда появилось лучшее измерение, создать versioned encrypted sidecar, upload/finalize independently, bind to asset ID + revision monotonic counter. Клиент может закончить GPS watch, когда достигнут threshold или истекло active window; не отслеживать местоположение непрерывно вне съёмки. Очередь metadata revisions offline допускается; late write must check asset expires_at and membership epoch; при конфликте revision merge без потери источника.
Статус «Местоположение получено» только после локального успешного sidecar; «Сохранено в облаке» для metadata — после отдельного server commit.

## 6. Integrity / trust boundaries
Client location can be forged, OS clock spoofed, location permission denied, photo can be captured from screen/another source. Даже C2PA не подтверждает правдивость события. Не использовать слова «юридически доказанный GPS» или «гарантированно на объекте». Сервер не может проверить зашифрованные координаты без разрушения E2EE. Если профилю нужны строгие требования, client attestation — дополнительная несовершенная мера и должна быть opt-in.

## 7. Tests
GPS arrives 6s after photo; no GPS entire session; 5m sample pre-capture vs 2m sample 20s post-capture with walking; permission denied mid-session; precise location disabled; upload completes before geo; leave app at shutter+1s; client clock change; encrypted metadata conflict; shared contributor without read keys.
