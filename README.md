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

## Чтение данных

Доступны список отслеживаемых валют, последние котировки и история за период.
В запросах нужен `Authorization: Bearer <SERVICE_API_KEY>`. Ключ создаётся командой `npm run setup`.
Список начальных валют задаётся через `TRACKED_CURRENCIES`. Ключ CoinMarketCap используется только на сервере.

```bash
npm test
```

Тесты используют временные файлы SQLite и подмену ответов CoinMarketCap.

Для графиков добавлена агрегация истории: OHLC, средняя цена и число наблюдений. Список поддерживаемых интервалов есть в OpenAPI.
