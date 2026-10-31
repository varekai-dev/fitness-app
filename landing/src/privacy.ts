import { DEVELOPER_URL } from './data';
import { pathFor, type Lang } from './i18n';

/**
 * The privacy policy, for the Play Store listing and the app's settings. Keep it
 * in step with what the app sends where: src/lib/account.ts, server-backup.ts,
 * groq.ts, health/, and server/. Paragraphs and list items are HTML.
 */
type Section = { title: string; text?: string[]; list?: string[] };

export type Policy = {
  title: string;
  description: string;
  heading: string;
  updated: string;
  back: string;
  sections: Section[];
};

const UPDATED = new Date('2026-10-28');

const link = (href: string, label: string) =>
  `<a href="${href}" target="_blank" rel="noopener">${label}</a>`;

export function policyFor(lang: Lang): Policy {
  const deletePage = pathFor(lang, 'delete-account/');
  const date = UPDATED.toLocaleDateString(lang === 'uk' ? 'uk-UA' : 'en-US', { dateStyle: 'long' });
  return lang === 'uk' ? uk(date, deletePage) : en(date, deletePage);
}

const uk = (date: string, deletePage: string): Policy => ({
  title: 'Політика конфіденційності — GetFit',
  description: 'Які дані збирає GetFit, де вони зберігаються, кому передаються і як їх видалити.',
  heading: 'Політика конфіденційності',
  updated: `Оновлено ${date}`,
  back: 'На головну',
  sections: [
    {
      title: 'Коротко',
      list: [
        'Майже всі дані зберігаються в базі на вашому телефоні.',
        'На наш сервер потрапляють лише пошта й пароль акаунта, щоденна резервна копія даних, облік запитів до AI (без їхнього змісту) і відповіді AI, на які ви поскаржились.',
        'Ми не показуємо рекламу, не використовуємо аналітику чи трекери і не продаємо дані.',
        `Акаунт і всі копії на сервері можна видалити будь-коли: у застосунку або на <a href="${deletePage}">цій сторінці</a>.`,
      ],
    },
    {
      title: 'Хто ми',
      text: [
        `GetFit — застосунок для тренувань, харчування, води й ваги. Його розробляє приватна особа, Сергій Савюк (${link(DEVELOPER_URL, 'serhiisaviuk.com')}). Він відповідає за обробку даних, описану тут.`,
      ],
    },
    {
      title: 'Дані на телефоні',
      text: ['Застосунок зберігає на вашому пристрої все, що ви вносите або дозволяєте прочитати:'],
      list: [
        'тренування, програми, підходи, вправи та їхні зображення;',
        'їжу, калорії й нутрієнти, воду;',
        'вагу, фото прогресу;',
        'профіль: стать, дату народження, зріст, вагу, рівень активності й ціль;',
        'вагу з Health Connect або Apple Health (див. нижче);',
        'налаштування й нагадування.',
      ],
    },
    {
      title: 'Акаунт',
      text: [
        'Щоб користуватися застосунком, потрібен акаунт. Для нього ми зберігаємо вашу пошту, пароль у вигляді хешу (PBKDF2, сам пароль ніде не зберігається), дату реєстрації та сесії входу (лише хеш токена). Пошту використовуємо тільки для входу й надсилання коду для скидання пароля. Листи надсилаються через Gmail.',
      ],
    },
    {
      title: 'Резервні копії',
      text: [
        'Раз на день застосунок надсилає на сервер повну резервну копію ваших даних: базу з усіма записами, включно з профілем і вагою з Health Connect / Apple Health, а також фото прогресу та зображення вправ. Копії потрібні лише для того, щоб ви могли відновити дані на новому телефоні. Ми зберігаємо 7 останніх щоденних копій, старіші видаляються автоматично.',
        'Сервер працює на Cloudflare (Workers, D1 і R2). Дані передаються лише через HTTPS. Доступ до копій має тільки ваш акаунт.',
      ],
    },
    {
      title: 'Health Connect і Apple Health',
      text: [
        'Якщо ви дозволите, застосунок <strong>лише читає</strong> з Health Connect (Android) або Apple Health (iOS) один тип даних — вагу тіла, щоб показувати її в журналі ваги. Інших даних про здоров’я застосунок не запитує і нічого не записує назад.',
        'Записи ваги зберігаються в базі на телефоні та потрапляють у вашу резервну копію на сервері. Вони <strong>не</strong> передаються іншим сервісам, зокрема AI, не використовуються для реклами, не продаються і не використовуються для оцінки кредитоспроможності чи страхування.',
        'Використання інформації, отриманої з Health Connect, відповідає політиці дозволів Health Connect, зокрема вимогам щодо обмеженого використання (Limited Use). Доступ можна відкликати будь-коли в налаштуваннях Health Connect або Apple Health.',
      ],
    },
    {
      title: 'AI-функції (Groq)',
      text: [
        `AI-функції (калорії за фото чи описом страви, програми тренувань, поради щодо харчування) працюють на моделях ${link('https://groq.com', 'Groq')} через наш сервер.`,
        'Коли ви користуєтеся цими функціями, застосунок надсилає на наш сервер, а той — у Groq, лише те, що потрібно для відповіді: опис страви, фото їжі чи етикетки, записи їжі за день, а для програми тренувань — стать, вік, зріст, вагу, рівень активності й ціль. Groq обробляє ці дані за своєю ' +
          link('https://groq.com/privacy-policy/', 'політикою конфіденційності') +
          '. Наш сервер не зберігає ні запитів, ні відповідей: він записує лише, яка функція й модель відповіла, скільки токенів це зайняло і коли, щоб рахувати витрати та денний ліміт.',
        'Біля кожної відповіді AI є кнопка «Поскаржитися». Якщо ви її натиснете, на наш сервер надійде сама відповідь, назва функції, версія застосунку та ваш акаунт, щоб ми могли переглянути образливий чи шкідливий вміст.',
      ],
    },
    {
      title: 'Інші сервіси',
      text: ['Ці сервіси отримують лише технічні дані запиту (IP-адресу, версію застосунку), але не ваші записи:'],
      list: [
        'Expo (EAS Update) — перевірка й завантаження оновлень застосунку;',
        'GitHub — перевірка нової версії та фото вправ із відкритого каталогу;',
        'YouTube — відео техніки вправ, коли ви їх відкриваєте.',
      ],
    },
    {
      title: 'Дозволи',
      list: [
        'Камера й фото — щоб фотографувати прогрес, їжу та вправи. Фото залишаються на телефоні та в резервній копії. Фото їжі надсилається в Groq, лише коли ви просите AI його розпізнати.',
        'Сповіщення — нагадування про воду, тренування й фото. Усі вони плануються на телефоні.',
        'Health Connect / Apple Health — див. вище.',
      ],
    },
    {
      title: 'Безпека',
      text: [
        'Усі з’єднання з сервером використовують HTTPS. Паролі й токени сесій зберігаються лише як хеші, а сесія на телефоні — у захищеному сховищі. Жоден спосіб захисту не дає абсолютної гарантії, але ми зберігаємо мінімум даних, щоб обмежити ризики.',
      ],
    },
    {
      title: 'Видалення даних',
      list: [
        `Акаунт: Налаштування → Акаунт → Видалити акаунт або <a href="${deletePage}">сторінка видалення</a> на сайті. Пошта, пароль, сесії, усі резервні копії, облік запитів до AI та скарги на відповіді AI видаляються з сервера одразу й назавжди.`,
        'Дані на телефоні: видаліть застосунок або очистіть його дані в налаштуваннях системи.',
        'Без видалення акаунта резервні копії старші за 7 днів видаляються автоматично.',
      ],
    },
    {
      title: 'Діти',
      text: ['Застосунок не призначений для дітей молодших за 13 років, і ми свідомо не збираємо їхніх даних.'],
    },
    {
      title: 'Зміни',
      text: ['Якщо політика зміниться, ми оновимо цю сторінку та дату вгорі.'],
    },
    {
      title: 'Контакти',
      text: [`Питання щодо даних і цієї політики надсилайте через ${link(DEVELOPER_URL, 'serhiisaviuk.com')}.`],
    },
  ],
});

const en = (date: string, deletePage: string): Policy => ({
  title: 'Privacy policy — GetFit',
  description: 'What data GetFit collects, where it’s kept, who it’s shared with and how to delete it.',
  heading: 'Privacy policy',
  updated: `Updated ${date}`,
  back: 'Home',
  sections: [
    {
      title: 'In short',
      list: [
        'Almost all data stays in a database on your phone.',
        'Our server only gets your account’s email and password, a daily backup of your data, a tally of AI requests (without their content) and AI answers you report.',
        'No ads, no analytics or trackers, and we never sell data.',
        `Delete the account and every backup on the server at any time: in the app or on <a href="${deletePage}">this page</a>.`,
      ],
    },
    {
      title: 'Who we are',
      text: [
        `GetFit is an app for workouts, food, water and weight, made by an individual developer, Serhii Saviuk (${link(DEVELOPER_URL, 'serhiisaviuk.com')}), who is responsible for the data handling described here.`,
      ],
    },
    {
      title: 'Data on your phone',
      text: ['The app keeps on your device everything you enter or let it read:'],
      list: [
        'workouts, programs, sets, exercises and their images;',
        'food, calories and nutrients, water;',
        'body weight, progress photos;',
        'your profile: sex, birth date, height, weight, activity level and goal;',
        'weight from Health Connect or Apple Health (see below);',
        'settings and reminders.',
      ],
    },
    {
      title: 'Account',
      text: [
        'The app needs an account. For it we keep your email, a hash of your password (PBKDF2, the password itself is never stored), the sign-up date and sign-in sessions (only a hash of each token). The email is used only to sign in and to send a password reset code, delivered through Gmail.',
      ],
    },
    {
      title: 'Backups',
      text: [
        'Once a day the app uploads a full backup of your data to the server: the database with every record, your profile and weight from Health Connect / Apple Health included, plus progress photos and exercise images. Backups exist only so you can restore your data on a new phone. We keep the 7 newest daily backups and delete older ones automatically.',
        'The server runs on Cloudflare (Workers, D1 and R2). Data travels only over HTTPS, and only your account can reach your backups.',
      ],
    },
    {
      title: 'Health Connect and Apple Health',
      text: [
        'With your permission the app <strong>only reads</strong> one data type from Health Connect (Android) or Apple Health (iOS): body weight, to show it in the weight log. It asks for no other health data and never writes anything back.',
        'Weight records are stored in the database on your phone and included in your backup on the server. They are <strong>not</strong> shared with other services, AI included, not used for advertising, not sold, and not used to judge creditworthiness or for insurance.',
        'Use of information received from Health Connect adheres to the Health Connect Permissions policy, including the Limited Use requirements. You can revoke access at any time in the settings of Health Connect or Apple Health.',
      ],
    },
    {
      title: 'AI features (Groq)',
      text: [
        `AI features (calories from a photo or a description of a dish, workout programs, food tips) run on ${link('https://groq.com', 'Groq')} models through our server.`,
        'When you use them, the app sends to our server, and the server to Groq, only what the answer needs: the dish description, a photo of food or a label, the day’s food log, and for a workout program your sex, age, height, weight, activity level and goal. Groq handles this data under its ' +
          link('https://groq.com/privacy-policy/', 'privacy policy') +
          '. Our server keeps neither the requests nor the answers: it records only which feature and model answered, how many tokens that took and when, to count costs and the daily limit.',
        'Every AI answer has a Report button. If you tap it, the answer itself, the feature’s name, the app version and your account reach our server, so we can review offensive or harmful content.',
      ],
    },
    {
      title: 'Other services',
      text: ['These get only a request’s technical details (IP address, app version), never your records:'],
      list: [
        'Expo (EAS Update) — checking for and downloading app updates;',
        'GitHub — checking for a new version, and exercise photos from an open catalog;',
        'YouTube — exercise technique videos, when you open one.',
      ],
    },
    {
      title: 'Permissions',
      list: [
        'Camera and photos — to take progress, food and exercise photos. They stay on the phone and in your backup; a food photo goes to Groq only when you ask the AI to read it.',
        'Notifications — water, workout and photo reminders, all scheduled on the phone.',
        'Health Connect / Apple Health — see above.',
      ],
    },
    {
      title: 'Security',
      text: [
        'Every connection to the server uses HTTPS. Passwords and session tokens are stored only as hashes, and the session on the phone sits in secure storage. No protection is absolute, so we keep as little data as we can.',
      ],
    },
    {
      title: 'Deleting your data',
      list: [
        `Account: Settings → Account → Delete account, or the <a href="${deletePage}">deletion page</a> on the website. Your email, password, sessions, every backup, your AI request tally and your AI reports are deleted from the server at once and for good.`,
        'Data on the phone: uninstall the app or clear its data in the system settings.',
        'Without deleting the account, backups older than 7 days are deleted automatically.',
      ],
    },
    {
      title: 'Children',
      text: ['The app isn’t meant for children under 13, and we don’t knowingly collect their data.'],
    },
    {
      title: 'Changes',
      text: ['If this policy changes, we’ll update this page and the date at the top.'],
    },
    {
      title: 'Contact',
      text: [`Send questions about your data or this policy through ${link(DEVELOPER_URL, 'serhiisaviuk.com')}.`],
    },
  ],
});
