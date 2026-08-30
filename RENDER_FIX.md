# Fix Render: Cannot find module 'express'

## Your real problem

GitHub has a **nested** folder:

```text
WatchSync/              ← GitHub repo
  WatchSync/            ← extra folder (wrong)
    package.json
    server.js
    client/
```

Render runs `npm install` at the **repo root**, where there is **no** `package.json` with `express`.
Then it starts `WatchSync/server/server.js`, which loads `WatchSync/server.js`, which cannot find `express`.

## Fix (pick ONE)

### Option A — Flatten the repo (best)

1. Unzip **WatchSync-FLAT.zip**
2. Put those files at the **root** of the GitHub repo (same level as `.git`), so you have:

```text
WatchSync/              ← repo root
  package.json
  server.js
  rooms.js
  store.js
  client/
  ...
```

3. **Delete** the nested `WatchSync/WatchSync/` folder if it exists.
4. **Delete** `server/server.js` if it exists (only `server.js` at root).
5. Push to GitHub.

### Option B — Keep nested folder, set Root Directory

In Render → Settings:

| Setting | Value |
|--------|--------|
| **Root Directory** | `WatchSync` |
| **Build Command** | `npm install` |
| **Start Command** | `node server.js` |

Then **Clear build cache & deploy**.

## After deploy, logs must show

```text
🎬 WatchSync → http://0.0.0.0:PORT
```

not `Cannot find module 'express'`.
