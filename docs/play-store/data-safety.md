# Google Play: Data safety

Відповіді для форми **App content → Data safety** у Play Console. Складено за тим, що реально робить код: `src/lib/account.ts`, `src/lib/server-backup.ts`, `src/lib/groq.ts`, `src/lib/health/`, `server/`. Коли застосунок почне збирати чи передавати нові дані, онови і цей файл, і форму, і політику конфіденційності (`landing/src/privacy.ts`).

## Крок 1. Data collection and security

| Питання | Відповідь |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes**: увесь зв'язок із сервером і з Groq іде по HTTPS |
| Which of the following methods of account creation does your app support? | **Username and password** (пошта й пароль) |
| Delete account URL | Сторінка видалення акаунта на лендингу |
| Do you provide a way for users to request that some or all of their data is deleted, without requiring them to delete their account? | **No** |

## Крок 2. Типи даних

- **Shared: No** для всіх типів. Cloudflare (сервер, D1, R2) і Groq (AI) обробляють дані від нашого імені. За визначенням Google це service providers, а не передача третім особам.
- **Processed ephemerally: No** для всіх типів. AI-запити сервер не зберігає, але ті самі дані потрапляють у щоденну резервну копію.

| Категорія → тип | Required / Optional | Purposes | Що це в застосунку |
|---|---|---|---|
| Personal info → **Email address** | Required | Account management | Вхід, коди для скидання пароля |
| Personal info → **User IDs** | Required | Account management | ID акаунта на сервері |
| Personal info → **Other info** | Optional | App functionality | Дата народження і стать з профілю, для розрахунку калорій і програм |
| Health and fitness → **Health info** | Required | App functionality | Вага (зокрема з Health Connect), зріст, журнал їжі й води, ціль |
| Health and fitness → **Fitness info** | Required | App functionality | Тренування, програми, рівень активності |
| Photos and videos → **Photos** | Optional | App functionality | Фото прогресу й вправ у резервній копії, фото їжі для AI |
| App activity → **Other user-generated content** | Optional | Fraud prevention, security, and compliance | Відповіді AI, на які користувач поскаржився (`ai_reports`) |

Health info і Fitness info позначені як **Required**, бо резервна копія на сервер вантажиться автоматично раз на день і вимкнути її не можна. Якщо з'явиться перемикач, ці типи можна змінити на Optional.

## Що не декларується, і чому

- **App info and performance** (креші, діагностика): в застосунку немає Sentry, Firebase, Amplitude чи інших SDK аналітики.
- **Device or other IDs**: EAS Update, за [поясненням Expo](https://expo.dev/privacy-explained), не передає ідентифікаторів пристрою, лише випадковий токен установки. Push-токени не збираються: сповіщення лише локальні.
- **Location, Contacts, Messages, Audio, Calendar, Financial info, Files and docs**: не використовуються. Мікрофон заблоковано в `app.json` (`blockedPermissions`).
- **AI-облік (`ai_usage`)**: сервер записує лише функцію, модель, кількість токенів і час, без змісту запиту. Це службові дані для рахунку витрат і ліміту, вони не належать до жодного типу з форми.

## Окремі декларації

- **Health Connect** (App content → Health apps і форма Health Connect permissions): дозвіл `android.permission.health.READ_WEIGHT`. Пояснення: імпорт записів ваги в журнал ваги для графіка, тренду й прогнозу досягнення цілі. Google може попросити коротке відео з тим, як застосунок використовує дозвіл.
- **Privacy policy**: URL політики на лендингу. Вона вже описує все перелічене тут, зокрема передачу даних у Groq через сервер.
