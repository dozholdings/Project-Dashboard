# Project Dashboard

A dashboard for the projects you're building: links to each site, a status, a progress
gauge, and a running log of what moved. Locked behind a PIN.

Everything you type is stored **on the device you typed it on**. Nothing is uploaded,
and nothing lands in this repository.

---

## Put it online

### 1. Make the repository

1. Go to [github.com/new](https://github.com/new).
2. Name it `project-dashboard`.
3. Set it to **Public** — GitHub Pages needs public on the free plan.
4. Create the repository.

### 2. Upload the files

On the empty repository page, click **uploading an existing file**, then drag in
everything from this folder. Upload the files themselves, not the folder.

The file `.nojekyll` matters — it stops GitHub mangling the build. If your computer
hides dotfiles, press `Cmd + Shift + .` in Finder to reveal it.

Commit the upload.

### 3. Switch on Pages

1. Repository **Settings** → **Pages** in the left sidebar.
2. Under **Source**, choose **Deploy from a branch**.
3. Branch: `main`, folder: `/ (root)`. Save.

Wait a minute or two, then reload the Pages settings screen. Your address appears at
the top:

```
https://YOUR-USERNAME.github.io/project-dashboard/
```

---

## Put it on your iPhone

1. Open that address in **Safari** (this only works in Safari, not Chrome).
2. Tap the **Share** button — the square with the arrow.
3. Scroll down and tap **Add to Home Screen**.
4. Name it, tap **Add**.

You'll get an icon on your home screen. Opening it launches the dashboard full
screen with no address bar, and it works with no signal once it has loaded once.

Set your PIN the first time you open it.

---

## Things worth knowing

**Each device has its own data.** Your phone and your laptop keep separate lists —
they don't sync. The download button in the header exports your projects as a file
if you want to move them across.

**Back up now and then.** iOS clears website data for sites you haven't opened in a
while. Adding it to your home screen and using it regularly avoids this, but export
occasionally anyway.

**The PIN is a privacy screen, not a safe.** It keeps your projects out of sight if
someone picks up your phone. It is not encryption — anyone who knows browser dev
tools could read the stored data. Don't keep secrets in the log entries.

**Forgetting the PIN means losing the data.** There's no recovery. The lock screen
offers to erase everything and start over, and that's the only way past it.

---

## Changing it later

Small text edits — a heading, the status names — can be made directly in
`src/App.jsx` on GitHub, but the site serves the built file `app.js`, so you have
to rebuild for changes to show up:

```bash
npm install
node build.mjs
npx tailwindcss -i src/index.css -o app.css --minify
```

Then upload the new `app.js` and `app.css`, and bump `CACHE = "dashboard-v1"` to
`"dashboard-v2"` in `sw.js` so phones fetch the new version instead of the cached one.

---

## What each file does

| File | Purpose |
| --- | --- |
| `index.html` | The page itself |
| `app.js` | The whole app, compiled |
| `app.css` | Styles |
| `sw.js` | Makes it work offline |
| `manifest.webmanifest` | Name and icon for the home screen |
| `icon-*.png` | App icons |
| `.nojekyll` | Tells GitHub to serve the files untouched |
| `src/` | Editable source, only needed if you rebuild |
