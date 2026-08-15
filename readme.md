# Top Tournament — Player App

Three files. No build step, no image downloads, no external assets beyond fonts and the Supabase library.

```
player.html    all the screens (markup)
style.css      themes, layout, and the CSS-drawn game artwork
app.js         all the logic
```

## Game artwork
The Ludo board, Snake & Ladder board, Carrom board and playing-card fan on the home screen are **drawn entirely in CSS** — divs, gradients and transforms. No image files, nothing to download, no licensing to worry about, and they can never fail to load or appear broken. To restyle them, edit the `GAMEART` section at the bottom of `style.css`.

## Deploy on GitHub Pages
1. Upload all three files to your repo root (plus this README if you like).
2. Repo → **Settings → Pages** → Deploy from a branch → `main`, `/ (root)` → Save.
3. Live at `https://YOUR-USERNAME.github.io/REPO-NAME/player.html`

## Database setup (one-time, in Supabase — not in this repo)
Run these in the SQL Editor **in this order**:
`schema.sql` → `schema_v2.sql` → `schema_v3.sql` → `schema_v4.sql` → `schema_v5.sql`

## What's in the app
Login with captcha and password reset · Ludo and Snake & Ladder (real multiplayer across devices via room codes) · Tournaments with free registration and admin-confirmed placement · Leaderboard · Notifications · History · Wallet with live balance · KYC-gated withdrawals · Customer support chat · Three themes (Cream is the default).

## Notes
- The Supabase anon key in `app.js` is meant to be public — protection comes from the Row Level Security rules in the SQL files. Never put the `service_role` key here.
- Deposits are a manual, admin-confirmed flow. Before handling real money, check the gambling and payment-services rules that apply where your players are.
