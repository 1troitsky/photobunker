# Anonymous Accounts, Storage Plans & Crypto Payments
Статус: бизнес-правила с явно неутверждёнными ценами.

## 1. Principles
Payment is **one-time prepaid capacity / storage entitlement**, no recurring debit/automatic subscription, no card linkage, no mandatory email/name/phone, no per-seat pricing. Личный аккаунт и совместные Vault используют одну модель; владелец платит за ёмкость Vault. Free privacy = paid privacy.
Слово «анонимный» описывает отсутствие обязательных персональных данных у сервиса, а не невозможность идентификации транзакций, IP, провайдера кошелька или биржи. Политики прозрачны.

## 2. Entitlements (configurable)
- Free: небольшая квота (значение TBD), **каждая фотография не больше 14 дней**.
- Lower-priced (Go): квота TBD, **максимальный срок одной фотографии 3 календарных месяца**; можно выставить меньше.
- Higher (Plus/Archive): квоты TBD, предел **12 месяцев и больше** (конкретные 12/24/etc в тарифных конфигах), можно меньше.
- Expiration of prepaid entitlement separately from maximum photo TTL. Effective asset expiration = min(photo TTL, Vault policy, entitlement expiration, explicit date).
- User-selected TTL: 1 час, день, неделя, 14 дней, 3 месяца, 12 месяцев/кастомная дата в пределах тарифа. Defaults per Vault and per photo.
- Переход на более дорогой тариф может продлить будущую retention policy, но **не оживляет уже удалённые файлы**; продление существующего неистёкшего снимка требует явного действия/подтверждения в разрешённых границах.
- Expiration and delete semantics normed in 07; показывать estimated deletes и заранее предупредить об окончании paid capacity.

## 3. Top-ups / billing model
Тариф содержит bytes capacity и срок действия предоплаченного пакета. Покупка дополнительных GB или продление срока без автосписания. Не вводить «пожизненное» хранение за разовую оплату (операционные затраты растут всегда).
Open decision for billing implementation: parallel overlapping purchases can combine as additional bytes or future coverage; must choose deterministic, documented formula before enabling billing. No silently shrinking prepaid rights. Store immutable entitlement ledger and invoice receipt for disputes without identifying user.
Price and exchange-rate quote presented before crypto payment, invoice expires after defined window, handle underpay/overpay/double payment, late deposits, reorgs, refund policy, accidental wrong-chain deposits, dust limits. Confirmation threshold network-specific, not blindly 1. Object capacity available only after verified on-chain payment or explicit manual credit.

## 4. Crypto payment privacy
Preferred privacy-oriented option to evaluate: Monero (XMR) native self-hosted receiving address/subaddress per invoice. Bitcoin and other transparent chains are **pseudonymous**, not anonymous; if offered, label explicitly. User not required to connect web wallet, sign a message with personally identifying address, or disclose exchange identity to PhotoBunker.
Self-hosted invoice/watch logic preferred when feasible; avoid relying on one proprietary gateway or undocumented API. Distinguish blockchain observer, payment processor, hosting/network metadata. A provider may collect identifiable transaction/IP info. Don't expose account ID in public blockchain memo or webhooks; bind internal invoice random ID.
Payment handler only observes credits, NEVER has access to photo keys. Security: separate payment service wallet privileges; avoid storing spend keys on publicly exposed app server, key rotation and backup plan.

## 5. UX states
Free used 80/100% → capacity warning; expired/prepaid about to expire → non-sensitive banner in unlocked settings and optional generic notification. Paid activation pending confirmation → “Платёж ожидает подтверждений”; invoice expired, short-paid, invalid network; do not instantly promise new capacity. No Paywall before user captures **unless** quota actually exhausted; in that case prevent misleading upload success, keep encrypted queue if possible and give options, with TTL continuing to tick.

## 6. Privacy and legal
Provide concise Privacy Policy, terms and deletion/retention truth table; no sale of personal information. Confirm local tax/legal compliance and crypto merchant policy in launch jurisdiction before accepting real money; do not claim crypto eliminates compliance requirements. Open-source project can be monetized by storage without surveillance. Access to gallery must never depend on sending plaintext to payment service.

## 7. Costs and reliability
Cost model counts storage GB-months, temporary uploads, object operations, egress, VPS, backups and payment fees. Avoid claim “free 10GB per **person**” if supplier free tier is per account. Admin only sees aggregated usage/billing and random IDs; no plaintext content. Billing outage does not damage existing encrypted assets.
