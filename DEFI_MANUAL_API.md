# DeFi Manual API — контракт и формат данных

## POST /api/defi-position-manual

**URL:** `POST /api/defi-position-manual`

**Принимает (JSON body):**
| Поле | Тип | Обязательно | Описание |
|------|-----|-------------|----------|
| `wallet` | string | да | Адрес кошелька (0x + 40 hex) |
| `chain` | string | да | Сеть, напр. `eth`, `manta` |
| `protocol_id` | string | да | ID протокола DeBank |
| `position_type` | string | да | Тип позиции: `lp`, `lending`, `stake`, etc. |
| `position_key` | string | нет | Ключ позиции (pool.id или default) |
| `opened_at_manual` | string \| null | нет | Дата открытия в формате `YYYY-MM-DD` |
| `initial_deposit_usd` | number \| null | нет | Начальная сумма в USD |

**Возвращает (200):** сохранённая запись:
```json
{
  "wallet": "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
  "chain": "manta",
  "protocol_id": "manta_izumi",
  "position_type": "lp",
  "position_key": "0x19b683a2f45012318d9b2ae1280d68d3ec54d663",
  "opened_at_manual": "2025-02-15T00:00:00.000Z",
  "initial_deposit_usd": 1000,
  "created_at": "2026-02-23T11:12:25.160Z",
  "updated_at": "2026-02-23T11:21:31.886Z"
}
```

**Дата:** backend конвертирует `YYYY-MM-DD` → `YYYY-MM-DDT00:00:00.000Z`.

---

## GET /api/defi-positions

**URL:** `GET /api/defi-positions?id={wallet}`

**Возвращает:** массив позиций. Для каждой позиции:
- читается Redis по ключу `wallet:{wallet}:position:{chain}:{protocol_id}:{position_type}:{position_key}`;
- если запись найдена — подставляются `opened_at_manual`, `initial_deposit_usd`;
- вычисляются `opened_at_effective`, `days_open`, `profit_usd`, `apy_percent`.

---

## Redis

**Ключ:**
```
wallet:{wallet}:position:{chain}:{protocol_id}:{position_type}:{position_key}
```
Пример: `wallet:0xd8da6bf26964af9d7eed9e03e53415d37aa96045:position:manta:manta_izumi:lp:0x19b683a2f45012318d9b2ae1280d68d3ec54d663`

**Значение (JSON):**
```json
{
  "wallet": "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
  "chain": "manta",
  "protocol_id": "manta_izumi",
  "position_type": "lp",
  "position_key": "0x19b683a2f45012318d9b2ae1280d68d3ec54d663",
  "opened_at_manual": "2025-02-15T00:00:00.000Z",
  "initial_deposit_usd": 1000,
  "created_at": "2026-02-23T11:12:25.160Z",
  "updated_at": "2026-02-23T11:21:31.886Z"
}
```

---

## Позиция из /api/defi-positions

**До ручного ввода:**
```json
{
  "chain": "manta",
  "protocol_id": "manta_izumi",
  "opened_at_manual": null,
  "has_manual_opened_at": false,
  "opened_at_effective": null,
  "initial_deposit_usd": null,
  "days_open": null,
  "profit_usd": null,
  "apy_percent": null
}
```

**После ручного ввода (дата + сумма):**
```json
{
  "chain": "manta",
  "protocol_id": "manta_izumi",
  "opened_at_manual": "2025-02-15T00:00:00.000Z",
  "has_manual_opened_at": true,
  "opened_at_effective": "2025-02-15T00:00:00.000Z",
  "initial_deposit_usd": 1000,
  "days_open": 365,
  "profit_usd": 3506.68,
  "apy_percent": 450.67
}
```

---

## Изменённые файлы

| Файл | Изменения |
|------|-----------|
| `api/defi-position-manual.js` | Логирование POST и Redis save |
| `api/defi-positions.js` | Логирование первого lookup, Cache-Control no-store |
| `debank.html` | Обработка ошибок JSON, cache: no-store для fetch |
| `lib/redis.js` | Поддержка REDIS_URL и KV_REST_API |
| `lib/position-key.js` | Общий формат ключа |
