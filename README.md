This is a Capacitor Android app

1. Install dependencies

```bash
npm install
```

2. Build the web assets (copies files to `www`)

```bash
npm run build:web
```

3. Add Android platform

```bash
npx cap add android
```

5. Sync web assets and open Android Studio

```bash
npm run build:web
npx cap sync android
npx cap open android
```

6. From Android Studio: build and run on emulator or device.
