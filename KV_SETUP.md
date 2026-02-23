# Redis — одно действие в браузере

Используется переменная **REDIS_URL** (добавляется автоматически при создании Storage → Redis).

`npm install` выполняется при деплое на Vercel автоматически.

**Минимальные шаги (если ещё не сделано):**

1. Откройте **https://vercel.com** → войдите
2. Выберите проект **1-nine-sable-41** (или ваш)
3. Вкладка **Storage** → **Create Database**
4. Выберите **Upstash Redis** → **Continue**
5. Имя: `defi-kv` → **Create**
6. **Connect to Project** → выберите ваш проект → **Connect**

Готово. Переменные `KV_REST_API_URL` и `KV_REST_API_TOKEN` добавятся автоматически.

Сделайте redeploy (Deployments → три точки → Redeploy) или `git push`.
