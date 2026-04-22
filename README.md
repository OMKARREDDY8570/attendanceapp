# MITS Attendance — Android App

Expo / React Native mobile companion for https://mitsattendance.onrender.com

## Features
- 🔐 Login with roll number & password (auto-login on reopen)
- 📊 Hero donut chart with animated overall percentage + status pill
- 📈 Bar chart with 75% threshold line for all subjects
- 🎯 Skip Predictor — simulate skipping or attending extra classes
- 📋 Subject list with search, filter (All / Safe / At Risk) and sort
- 📬 Telegram daily alerts — enable / disable / send now
- 🌙 Cinematic dark theme (Outfit + Plus Jakarta Sans fonts)

## Build the APK (free, ~10 min)

### Step 1 — Install dependencies

```bash
npm install
```

> If you get version warnings, run:
> ```bash
> npx expo install --fix
> ```

### Step 2 — Create an Expo account (free)

Go to https://expo.dev and sign up if you haven't already.

### Step 3 — Install EAS CLI & log in

```bash
npm install -g eas-cli
eas login
```

### Step 4 — Configure your project

```bash
eas build:configure
```

Choose **Android** when prompted.

### Step 5 — Build the APK ✨

```bash
eas build -p android --profile preview
```

EAS will build in the cloud (~5–10 min) and give you a **download link** for the `.apk`.

Install on your Android phone by opening the link in Chrome on the phone.

---

## Run locally (with Expo Go)

```bash
npx expo start
```

Scan the QR code with **Expo Go** on your phone.

---

## Project Structure

```
mits-attendance/
├── app/
│   ├── _layout.tsx    # Root layout (fonts, providers)
│   ├── index.tsx      # Login screen
│   └── dashboard.tsx  # Main dashboard
├── lib/
│   ├── api.ts         # Render backend API calls
│   ├── storage.ts     # SecureStore + localStorage wrapper
│   └── theme.ts       # Colors & font names
├── assets/            # App icons & splash
├── app.json           # Expo config
├── eas.json           # EAS build config
└── babel.config.js    # Reanimated plugin
```

## API Endpoints Used

| Method | Path | Body |
|--------|------|------|
| POST | `/api/attendance` | `{roll, password}` |
| POST | `/api/telegram-subscribe` | `{roll, password, chat_id}` |
| POST | `/api/telegram-unsubscribe` | `{roll}` |
| POST | `/api/send-now` | `{roll, password}` |
