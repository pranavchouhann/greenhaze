# GreenHaze — Localhost Edition

This is a **localhost-only** GreenHaze project. It runs only on your own computer and saves local accounts, schedules, contact messages, and admin AI settings in `local-data/greenhaze.local.json`.

## Run it

Install Node.js 20 or newer. Open PowerShell in this folder and run:

```powershell
pnpm install
pnpm run setup
pnpm start
```

Then open:

```text
http://localhost:3000
```

`pnpm run setup` asks you to choose an administrator password and creates a private `local.config.json` file on your computer. That private file is ignored by Git and is not included in the master ZIP.

## One local settings file

After setup, edit `local.config.json` in Notepad or VS Code if you want to change the local administrator password or use AI immediately.

```json
{
  "adminPassword": "YOUR_OWN_ADMIN_PASSWORD",
  "aiApiKey": "PASTE_YOUR_GOOGLE_AI_STUDIO_KEY_HERE",
  "aiApiUrl": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  "aiModel": "gemini-2.5-flash"
}
```

Open `http://localhost:3000/admin` and use the password you chose during setup. No account is needed for the admin panel.

You can also leave `aiApiKey` blank, start GreenHaze, open `/admin`, and paste the AI key in the **AI connection** form. Local AI settings are saved in `local-data/greenhaze.local.json`.

## Tests

```powershell
pnpm test
pnpm run check
```

## Important

Everything is local to your computer. Do not share `local.config.json` after adding a real API key. If you want a fresh project, stop the server and delete the `local-data` folder.
