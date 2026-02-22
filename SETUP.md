# Настройка API DeBank

## 1. Создайте файл `.env`

```bash
cp .env.example .env
```

Откройте `.env` и вставьте ваш DeBank API key:
```
DEBANK_API_KEY=ваш_ключ_от_debank
```

**Важно:** файл `.env` в `.gitignore` — он не попадёт в GitHub.

## 2. Локальная разработка (с прокси)

Установите Vercel CLI и запустите:

```bash
npm i -g vercel
vercel dev
```

Сайт будет на `http://localhost:3000`, API — `http://localhost:3000/api/debank`.

## 3. Деплой на Vercel

1. Зарегистрируйтесь на [vercel.com](https://vercel.com)
2. Подключите репозиторий GitHub
3. В настройках проекта → **Environment Variables** добавьте:
   - Name: `DEBANK_API_KEY`
   - Value: ваш ключ
4. Деплой

## 4. Использование в коде

Вместо прямого запроса к DeBank, вызывайте ваш прокси:

```javascript
// Было (небезопасно — ключ виден в браузере):
// fetch('https://pro-openapi.debank.com/v1/user/total_balance?addr=0x...', {
//   headers: { AccessKey: 'ключ' }
// })

// Стало (ключ на сервере):
fetch('/api/debank?path=user/total_balance&addr=0x123...')
  .then(r => r.json())
  .then(data => console.log(data));
```

Параметр `path` — путь после `v1/` в DeBank API (например `user/total_balance`, `token/balance`).
