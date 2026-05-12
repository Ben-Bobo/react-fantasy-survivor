# Family Fantasy Draft — Survivor 50

> *Outwit. Outplay. Outscore.*

A real-time fantasy league tracker for watching **Survivor Season 50** with the family. Everyone drafts a team of contestants, points are scored each episode based on in-game events, and the leaderboard updates live for everyone to see.

No spreadsheets. No group texts arguing about the rules. Just standings.

---

## Features

- **Live leaderboard** — scores sync in real time via Firestore; no refresh needed
- **Spoiler gate** — warns viewers who haven't caught up before showing results
- **Per-episode breakdown** — drill into exactly who scored what and when
- **Admin panel** — password-protected score entry with episode management, eliminations, merge tracking, and final placements

---

## Tech Stack

- **React** + **Vite**
- **Firebase Firestore** — real-time database, all state lives here
- **Lucide React** — icons

---

## Running Locally

```bash
npm install
npm run dev
```

The app connects to the live Firestore database, so you'll see real data immediately.

---

## Admin Access

Navigate to the **Admin** tab and enter the password. The password is a famous Survivor host's name. You'll know it.

---

## What People Are Saying

> *"Wow!! I am so impressed with this new app!!! Over the top user friendly, and high quality data!"*
> — Lisa

> *"[this app] is really awesome. Does something like this exist or could you start selling these?"*
> — Meghan

> *"Cool."*
> — Abby
