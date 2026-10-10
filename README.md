# fitness-app

Особистий фітнес-трекер на React Native (Expo). Усі дані зберігаються локально на пристрої.

- **Тренування** — плеєр: підходи вводяться колесами, як у годиннику iOS, таймер відпочинку з кільцем, пауза / завершення утриманням.
- **Програми** — дні, що йдуть по колу, з цілями: підходи, діапазон повторень, час / дистанція, відпочинок.
- **Вправи** — бібліотека з групами м'язів, фото та відео техніки на YouTube.
- **Прогрес** — історія, «минулого разу», графік по вправі (e1RM для силових), особисті рекорди, календар активності.
- **Вага тіла і калорії** — щоденна вага з графіком, орієнтовні спалені калорії за тренування й тиждень.

## Скріншоти

| Головна | Тренування | Програми | Програма |
|:-:|:-:|:-:|:-:|
| <img src="docs/screenshots/home.png" width="200"> | <img src="docs/screenshots/workout.png" width="200"> | <img src="docs/screenshots/programs.png" width="200"> | <img src="docs/screenshots/program.png" width="200"> |

| Вправи | Вправа | Історія | Вага тіла |
|:-:|:-:|:-:|:-:|
| <img src="docs/screenshots/exercises.png" width="200"> | <img src="docs/screenshots/exercise.png" width="200"> | <img src="docs/screenshots/history.png" width="200"> | <img src="docs/screenshots/body-weight.png" width="200"> |

## Стек

Expo SDK 57 · Expo Router · TypeScript · expo-sqlite + Drizzle ORM

## Запуск

```bash
npm install
npx expo start          # Expo Go
npx expo run:ios        # dev build (потрібен Xcode 26.4+)
npx expo run:android
```

## Міграції БД

Після зміни `src/db/schema.ts`:

```bash
npx drizzle-kit generate
```

Міграції застосовуються автоматично при запуску застосунку.

## Зображення вправ

Фото вправ у `assets/exercises/` взяті з [free-exercise-db](https://github.com/yuhonas/free-exercise-db) (The Unlicense, public domain).
