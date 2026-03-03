# Ручные поправки DeFi-позиций (KV-хранилище)

Перед деплоем выполните `npm install` для установки `@vercel/kv`.

## Где хранится

**Redis** (REDIS_URL). Создаётся в Vercel Dashboard → Storage → Redis. Переменная `REDIS_URL` добавляется в проект автоматически.

## Ключ и структура значения

**Ключ:** `wallet:{walletAddress}:position:{positionId}`

**positionId** = `chain:protocol_id:position_type:position_key` (символы кроме `a-zA-Z0-9:_.-` заменяются на `_`)

**position_key** = `pool.id` из DeBank (PortfolioItemObject) или `position_index` или `default`, если оба отсутствуют.

**Значение (JSON):**
```json
{
  "wallet": "0x...",
  "chain": "eth",
  "protocol_id": "aave2",
  "position_type": "lending",
  "position_key": "0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9",
  "opened_at_manual": "2024-02-20T00:00:00.000Z",
  "initial_deposit_usd": 73674.36,
  "created_at": "2025-02-23T08:00:00.000Z",
  "updated_at": "2025-02-23T08:00:00.000Z"
}
```

## Endpoints

- **GET /api/defi-positions?id=0x...** — позиции из DeBank + ручные поправки из KV
- **POST /api/defi-position-manual** — сохранить/обновить ручные значения

## Пример JSON одной позиции из /api/defi-positions

```json
{
  "wallet": "0x0fdbe030de89fd11a20ffd48a3d63fb7eec468b1",
  "chain": "eth",
  "protocol_id": "aave2",
  "protocol_name": "Aave",
  "protocol_logo_url": "https://...",
  "position_type": "lending",
  "position_name": "Lending",
  "position_key": "0x7d2768de32b0b80b7a3454c06bdac94a69ddc7a9",
  "tokens": [
    { "symbol": "USDC", "amount": 50000, "amount_usd": 50000 },
    { "symbol": "ETH", "amount": 5, "amount_usd": 15000 }
  ],
  "total_usd": 65000,
  "opened_at_auto": "2022-10-15T00:00:00Z",
  "opened_at_manual": "2022-12-16T00:00:00.000Z",
  "opened_at_effective": "2022-12-16T00:00:00.000Z",
  "days_open": 800,
  "initial_deposit_usd": 73674.36,
  "profit_usd": -8674.36
}
```

*APR (годовая доходность) рассчитывается на фронтенде, в API не возвращается.*

## Изменённые/добавленные файлы

| Файл | Действие |
|------|----------|
| `package.json` | Зависимость `redis` |
| `api/defi-positions.js` | Добавлены position_key, KV-слияние, opened_at_effective, profit_usd |
| `api/defi-position-manual.js` | POST для сохранения ручных значений |
| `lib/redis.js` | Redis-клиент (REDIS_URL) |
| `debank.html` | Редактируемые колонки «Открыта», «Нач. сумма», колонки «Прибыль», «APR» |
| `vercel.json` | Добавлена функция defi-position-manual |
