# Netlify Instagram Feed (мінімальна конфігурація)

1) У Netlify → Site settings → Environment додайте:
   - IG_TOKEN   = <довгий IG Graph API токен>
   - IG_USER_ID = <ID Instagram Business/Creator акаунта>

2) Деплой.

3) Ендпойнт:
   /.netlify/functions/ig?limit=6

4) На фронті (Webflow) просто робіть fetch цього URL і відмальовуйте.
   Для VIDEO використовуйте `thumbnail_url` як постер, а `media_url` – для відтворення в модалці.
