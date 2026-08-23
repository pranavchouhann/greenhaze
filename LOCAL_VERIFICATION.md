# Local Verification Results

The packaged local server was started at `http://127.0.0.1:3000` and the browser-level flows below were verified on 17 August 2026.

| Route or flow | Result |
|---|---|
| `/` | Homepage rendered from the self-contained local Node server. |
| `/admin` | The local password-only prompt rendered. A user-created local password unlocked the admin panel without an account. |
| Admin settings | The default URL/model settings saved successfully and the local confirmation message appeared. |
| `/scan` | The chat rendered. With no AI key configured, it showed the expected local instruction to open `/admin` and save a key. |
| `/auth` | Local account registration/sign-in page rendered. |
| `/schedule` | Local schedule page rendered and correctly directed an unauthenticated user to the local account route. |
| API routes | The local admin, settings, account registration, reminder creation, and contact form APIs were verified with local requests. |
