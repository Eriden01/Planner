# Клиентское приложение

`public/` содержит готовый сайт. Основная разметка находится в `index.html`, стили — в `styles/app.css`, логика — в `js/app.js`, изображения — в `images/`. Файлы `manifest.webmanifest` и `service-worker.js` обеспечивают установку и офлайн-работу.

Для запуска из этого каталога:

```bash
npm start
```

Откройте [http://localhost:8080](http://localhost:8080). Приложение не требует сборки или установки npm-пакетов.

Для проверки ресурсов и service worker выполните `npm test`. Браузерные сценарии запускаются через `npm run test:browser`, если установлен Playwright и доступен Chrome.
