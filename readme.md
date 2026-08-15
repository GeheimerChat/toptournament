# Top Tournament — Player App

Single static file (`player.html`) — no build step, no server. Talks directly to Supabase from the browser.

## 1. Set up the database (one-time, in Supabase — not in this repo)
In your Supabase project → **SQL Editor** → New query, run these **in order**:
1. `schema.sql` — accounts, sequential player IDs, KYC, history, withdrawals
2. `schema_v2.sql` — wallets, admin roles, tournaments, matches, support chat
3. `schema_v3.sql` — Snake & Ladder rooms

(These three files live outside this repo — keep them on your computer, they're only ever pasted into Supabase's SQL Editor.)

## 2. Deploy this repo on GitHub Pages
1. Push this repo to GitHub (**Public**, for free Pages hosting).
2. Repo → **Settings → Pages** → Source: "Deploy from a branch" → Branch `main`, folder `/ (root)` → Save.
3. Your live URL appears at the top of that page after a minute or two:
   `https://YOUR-USERNAME.github.io/REPO-NAME/player.html`

## What's in the app
- **Login** — email/password via Supabase Auth, custom "I'm not a robot" captcha, sign-up flow with sequential Player IDs (starting at 2063453).
- **Home** — pick a game:
  - **Ludo** — real 4-player multiplayer via room codes, live across devices (Supabase Realtime).
  - **Snake & Ladder** — same live multiplayer pattern, full 10×10 board with ladders/snakes and animated tokens.
  - Carrom and Rummy are listed as "In development" — real physics/card-rule engines are bigger separate builds.
- **Tournaments** — free entry, browse open tournaments with banners, register, see your confirmation status and match/colour assignment once the admin places you.
- **History** — activity from the last 5 days.
- **Profile** — live wallet balance, Settings (theme + KYC verification), Deposit (Telegram handle), Withdraw (locked until KYC, generates a 5-letter code for the organizer), Customer support chat (auto-deletes once resolved).

## Notes
- The Supabase anon key visible in this file is meant to be public — real protection comes from the Row Level Security rules set up by the SQL files, not from hiding the key.
- "Deposit" is a manual, admin-confirmed flow (no payment gateway). Before opening this to real users, it's worth checking local gambling/payment-services regulations for your audience, and considering a proper payment processor with a verifiable trail.
