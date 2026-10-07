# Crypto Tracker

REST API для сбора цен криптовалют через CoinMarketCap. Хранение в SQLite, котировки в USD.

Контракт API находится в `openapi.json`, схема БД - в `schemas/`.

## Запуск

Нужен Node.js 24.15 или новее в ветке 24.

```bash
npm ci --ignore-scripts
npm run setup
npm run build
npm start
```

В `.env` задаются порт, путь к БД и ключ `CMC_API_KEY`. Для запуска без внешнего API нужно поставить `SYNC_ENABLED=false`.
Документация: http://localhost:3000/docs. Проверка сервера: http://localhost:3000/health.
