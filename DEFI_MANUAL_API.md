# DeFi Manual API — упрощённый контракт

## POST /api/defi-position-manual

**Поле с датой:** `openedAt` (строка YYYY-MM-DD)

**Принимает:**
```json
{
  "wallet": "0x...",
  "chain": "eth",
  "protocol_id": "manta_izumi",
  "position_type": "lp",
  "position_key": "0x19b683a2...",
  "openedAt": "2026-01-09",
  "initialDepositUsd": 67265.0
}
```

**Возвращает:** тот же объект + `created_at`, `updated_at`.

---

## Redis

**Ключ:** `wallet:{wallet}:position:{chain}:{protocol_id}:{position_type}:{position_key}`

**Значение (JSON):**
```json
{
  "wallet": "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
  "chain": "manta",
  "protocol_id": "manta_izumi",
  "position_type": "lp",
  "position_key": "0x19b683a2f45012318d9b2ae1280d68d3ec54d663",
  "openedAt": "2026-01-09",
  "initialDepositUsd": 67265.0,
  "created_at": "...",
  "updated_at": "..."
}
```

---

## GET /api/defi-positions

**Проп для даты:** `manualOpenedAt`

**Проп для начальной суммы:** `manualInitialUsd`

**Пример позиции:**
```json
{
  "chain": "manta",
  "protocol_id": "manta_izumi",
  "manualOpenedAt": "2026-01-09",
  "manualInitialUsd": 67265.0,
  "daysOpen": 45,
  "profitUsd": 1234.56,
  "apyPercent": 12.34
}
```

---

## Frontend

| Действие | Проп / поле |
|----------|-------------|
| Отображение в колонке «Открыта» | `position.manualOpenedAt` |
| Значение в инпуте модалки | `position.manualOpenedAt ?? ""` |
| Отправка в POST | `openedAt` |
