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

## Авторизация

Регистрация: `POST /api/v1/users`. Вход: `POST /api/v1/auth/sessions`.
Access token передаётся как Bearer, refresh token - через HttpOnly cookie.
Обновление токена: `POST /api/v1/auth/tokens`, выход: `DELETE /api/v1/auth/sessions/current`.
Регистрация создаёт роль USER. Для паролей используется scrypt, JWT подписывается HS256.

## Администрирование

В `.env` укажите `ADMIN_EMAIL` и `ADMIN_PASSWORD`, затем выполните `npm run admin:create`.
Администратор входит через тот же API. Он может добавлять валюты из каталога CoinMarketCap,
менять период опроса, приостанавливать отслеживание и настраивать срок хранения истории.
Для истории доступны общий срок, индивидуальный срок и бессрочное хранение.

Ручное обновление и очистка истории выполняются через фоновые задания. Состояние задания можно получить по его ID; очередь хранится в БД.

## Docker

Подготовьте `.env`, затем запустите сервис:

```bash
docker compose up --build -d
docker compose logs -f api
```

База хранится в volume. Остановка: `docker compose down`.

## Код

Модули разделены на маршруты, контроллеры, сервисы и репозитории. SQL находится в репозиториях, сборка зависимостей - в `src/runtime.ts`.
