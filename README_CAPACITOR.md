Capacitor Android wrap — quick steps

1. Install dependencies

```bash
cd /mnt/wrk/dev/bf
npm install
```

2. Build the web assets (copies files to `www`)

```bash
npm run build:web
```

3. Initialize Capacitor (if not already initialized)

```bash
npx cap init --web-dir=www com.example.fivavahana Fivavahana
```

If you already have `capacitor.config.json` (provided), skip `init`.

4. Add Android platform

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

Notes:

- This project uses plain static files. The `build:web` script simply copies `index.html`, `style.css`, `app.js`, and the `data/` folder to `www/`.
- You can modify `package.json` scripts to integrate a different build step if you later add a bundler.
- The `appId` in `capacitor.config.json` is set to `com.example.fivavahana` — change to your own reverse-domain identifier before publishing.
