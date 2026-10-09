<p align="center"><img src="app/icon-192.png" width="96" alt="Stub icon"></p>

<h1 align="center">Stub</h1>

<p align="center"><b>Budget one paycheck at a time.</b><br>
A free, open-source paycheck budget that runs entirely in <i>your own</i> Google account.<br>
No bank logins, no subscriptions, no company server.</p>

<p align="center"><a href="https://picovrfbt.github.io/Stub/"><b>Open Stub</b></a> · <a href="#download">Android & Windows apps</a> · <a href="#set-up">Set up (about 5 minutes)</a> · <a href="#faq">FAQ</a></p>

---

## What it does

Every payday you start fresh. Stub takes your paycheck, sets aside your **recurring bills** and your **savings goal**, and shows exactly how much you have **left to spend** until the next payday, along with how much per day.

- **Left to spend:** one big number, plus a per-day amount and a pace line. It shows whether you're spending faster than the days are going by.
- **Purchases show up on their own.** Stub reads the alert emails your bank already sends you in Gmail, every morning and whenever you open the app. You don't have to share a bank password and it doesn't use a paid bank-data service.
- **Any pay schedule:** weekly, every 2 weeks, twice a month on your own days, monthly or every 2 months, starting from your real payday. Stub can also detect your real paydays, so each period runs from one paycheck to the next.
- **Recurring bills:** they're set aside up front, so they don't eat your spending money. Stub also suggests ones it spots in your history.
- **Savings goal or spending limit:** pick one per paycheck. You can also add **category limits** with warnings.
- **Where it went:** a spending donut by category, with store logos.
- **Savings:** history per paycheck, savings goals (like "New phone, $600"), trends between paychecks, and a year in review.
- **Swipe a purchase** to leave it out of your budget or delete it.
- **Optional email summaries:** weekly, on payday, or when a category goes over its limit. They're sent from your Gmail to yourself.
- **Works on every device:** install it on your phone and computer and everything stays in sync. It works offline and has light and dark mode.

## How it works

```
 Your bank ──alert emails──▶ Your Gmail
                                 │  (read-only search, only the senders you choose)
                                 ▼
               Your Stub server: a Google Apps Script in YOUR Google account
               · stores your budget (compressed, private to the script)
               · daily 8 AM check + optional email summaries
                                 ▲
                                 │  every request carries your secret key
                                 │
          The Stub app (this repo's app/ folder, hosted on GitHub Pages)
          on your phone / computer
```

The app at `picovrfbt.github.io/Stub` is a static page; it has no database and never sees your data. Your data goes straight from your device to **your own** Apps Script, and only requests with your secret key are answered. You can also [host the app yourself](#host-the-app-yourself-optional).

---

## Download

Use Stub in any browser at **[picovrfbt.github.io/Stub](https://picovrfbt.github.io/Stub/)**, or get an app from the **[latest release](https://github.com/picovrfbt/Stub/releases/latest)**:

| | File | Notes |
|---|---|---|
| **Android** | `Stub-<version>.apk` | Full screen: no status bar or navigation buttons; Stub shows its own time and battery. Open the file on your phone and allow *Install unknown apps* when asked. Requires Chrome. |
| **Windows 10/11** | `Stub-Setup-<version>.exe` | Its own window, Start-menu and desktop shortcuts. Windows may show *"Windows protected your PC"* because the installer isn't code-signed: click **More info → Run anyway**. |
| **iPhone / Mac / Linux** | – | Open the web app and use **Add to Home Screen** (iPhone) or your browser's **Install** button. |

All of them run the same app and update automatically; only the window around it is different. You still need your own server (below) the first time.

## Set up

You need a Google account with Gmail, and a bank that can email you transaction alerts. Most US banks and credit unions can.

### 1. Create your Stub server (Google Apps Script)

1. Go to **[script.google.com](https://script.google.com)** and click **New project**. Name it **Stub** (click "Untitled project" at the top).
2. In the editor, select everything in **`Code.gs`**, delete it, and paste in the contents of [`server/Code.gs`](server/Code.gs). Use the "Copy raw file" button on GitHub.
3. Click **+** next to *Files*, choose **Script**, and name it **`Core`**. Paste in the contents of [`app/core.js`](app/core.js). (This is the budget logic the app and the server share.)
4. Click **⚙ Project Settings** (left side) and set **Time zone** to yours. Dates and the 8 AM check use it.
5. Back in the **‹ › Editor**, pick **`setup`** in the function dropdown at the top and click **Run**.
   - Google asks you to authorize the script. Choose your account. You'll see *"Google hasn't verified this app"*. That's expected, because it's your own script, not a published app. Click **Advanced → Go to Stub (unsafe)** → **Allow**.
   - When it finishes, the **Execution log** shows **your key**: a long line of letters and numbers. **Copy it somewhere safe now**; it's only shown once.
6. Click **Deploy → New deployment**. Click the gear next to *Select type* and choose **Web app**:
   - **Execute as:** Me
   - **Who has access:** Anyone *(needed so your phone can reach it; without your key it answers nothing)*

   Click **Deploy**, then copy the **Web app URL**. It ends in `/exec`.

### 2. Open the app

1. Open **[picovrfbt.github.io/Stub](https://picovrfbt.github.io/Stub/)** (or the [Android / Windows app](#download)).
2. Paste your **server address** (the `/exec` URL) and your **key**, then tap **Continue**.
3. Install it. On Android/Chrome, tap **Install** (or ⋮ → *Add to Home screen*). On iPhone/Safari, tap **Share → Add to Home Screen**. On a computer, click the install icon in the address bar.

### 3. Connect your bank alerts

1. In your bank's app or website, find **Alerts** (sometimes called *Notifications*). Turn on **email** alerts for **card purchases / transactions**, **deposits** and **transfers**, for each account you want to track. Set the minimum amount to $0 or $0.01 if your bank asks for one.
2. Wait for one alert to arrive, open it in Gmail, and note the **From** address, e.g. `alerts@mybank.com`.
3. In Stub, go to **Settings → Bank sync** and **add that address**. You can enter the whole domain (`mybank.com`) instead. Stub immediately looks back 90 days.

> **Tip:** to keep alerts out of your inbox, make a Gmail filter: search `from:alerts@mybank.com`, then choose *Create filter → Skip the Inbox* and *Apply the label "Bank alerts"*. Stub still reads them.

### 4. Tell Stub about your paycheck

**Settings → Paycheck & goal**:
- **How often you're paid:** slide to one of
  - weekly,
  - every 2 weeks,
  - twice a month (on any two days you choose, like the 1st & 15th or the 5th & 20th),
  - every month,
  - every 2 months.

  Then enter **your most recent payday**, or the two days for twice a month. Each budget period runs from one payday to the next.
- **Got paid?** Tap **+**, choose **Received**, and leave **This is my paycheck** on. That starts a new pay period on that date, and your next paydays follow from it. It's handy when your payday moves or you change jobs.
- **Detect my paydays (recommended):** enter the last 4 digits of the account your paycheck lands in, the smallest amount a paycheck could be, and optionally a word from your employer's name as it appears in the deposit. Each period then runs from one real payday to the next.
- **Fixed paycheck:** your take-home amount and a recent payday. It repeats on your schedule.
- Then choose a **Savings goal** (save at least $X per paycheck) or a **Spending limit** (spend no more than $X).

### 5. Add your other devices

On a device that's set up, go to **Settings → Devices → Show QR code** and scan it with your phone's camera. It carries your server address and key, so there's nothing to type. Only show it to your own devices.

That's it. Settings → **How Stub works** has a full guide inside the app, and the intro replays from there too.

---

## Using Stub

| Tab | What's there |
|---|---|
| **Home** | Left to spend, the spending-money bar with today's pace line (tap to swap to the whole-paycheck view), where it went, recent purchases |
| **Activity** | Every purchase and deposit. Search, change categories (Stub remembers it per store), swipe left to leave out or delete |
| **Recurring** | Bills set aside from each paycheck, plus suggestions Stub spotted |
| **Savings** | Saved per paycheck, savings goals, trends, year in review |
| **Settings** | Paycheck & goal, category limits, bank sync, email summaries, accounts, categories, appearance, devices, CSV import, backup |

Other handy things:
- **Pull down** on any screen to check for new alerts right now.
- Tap **+** to add cash purchases or anything the bank missed.
- **Transfers** between your own accounts (like savings → checking) are recognized and don't count as spending.
- **CSV import** (Settings → Import a CSV) works for history from before you turned on alerts.
- **Backup:** export or restore a JSON file anytime.

## Updating your server

When a new version of Stub comes out:
1. Paste the new [`server/Code.gs`](server/Code.gs) into `Code.gs`, and the new [`app/core.js`](app/core.js) into `Core`.
2. Click **Deploy → Manage deployments → ✏️ (edit)**, set **Version** to **New version**, and click **Deploy**. Your server address stays the same.

The app itself updates automatically.

## FAQ

**Is my data safe?**
Your budget lives in your Google account, inside your own Apps Script's private storage. The app page is static and has no backend. Requests go straight from your device to your script, and every request must include your key. Only the key's SHA-256 fingerprint is stored, never the key itself. Your server address and key are saved only on your devices.

**Why does Google say the app isn't verified?**
Because it's *your* script running under *your* account, not an app published to others. The permissions it asks for are:
- **Gmail:** to search for your bank's alert emails and send your own summaries to yourself.
- **Run when you're not present:** for the daily check.
- **Connect to an external service:** this is how the app talks to your script.

**My bank's alerts aren't being read.**
Check that the sender is listed in **Settings → Bank sync**, then tap **Re-read last 90 days**. If Stub found the emails but couldn't understand them, they're listed under *"emails I couldn't read"*. Please [open an issue](https://github.com/picovrfbt/Stub/issues) with the wording of one alert, with your name, account digits and amounts removed. Stub was first tuned for Regions Bank alerts, but its reader looks for common patterns (`Amount: $12.34`, `at STORE`, `ending in 1234`) that most banks use.

**What else does the app connect to?**
To show store logos, store names are looked up through:
- Google's and DuckDuckGo's favicon services,
- Clearbit's company-name lookup,
- the Simple Icons library on jsDelivr.

Only the store name or website is sent, never amounts or your account details. If a logo isn't found, Stub falls back to a category icon.

**Are the Android and Windows apps safe to install?**
They're thin windows around the same web app, built from the [`desktop/`](desktop/) code and the Bubblewrap setup described below. They can't see anything the web app can't. They aren't in the Play Store or code-signed by Microsoft, which is why your phone or PC asks for confirmation.

**Does it cost anything?**
No. Google Apps Script and GitHub Pages are free for personal use.

**I lost my key / got a new phone.**
- **New phone:** scan the QR code from another signed-in device.
- **Lost key:** open your script, run **`newKey`**, and copy the new key from the log. Devices using the old key will ask for the new one. Your data is untouched.

**Can I use it without bank alerts?**
Yes. Add purchases with **+** or import a CSV. The budgeting works the same.

## Host the app yourself (optional)

The app is the static [`app/`](app/) folder. There's no build step, so any static host works (GitHub Pages, Netlify, Cloudflare Pages, Firebase Hosting…). If you fork this repo, the included workflow publishes `app/` to your own GitHub Pages: go to **Settings → Pages** and choose **Source: GitHub Actions**. Then change `APP_URL` at the top of `server/Code.gs` to your address, so email summaries link to it.

### For developers: using clasp

```bash
npm i -g @google/clasp && clasp login
cp app/core.js server/Core.gs
cd server
clasp create --type webapp --title Stub --rootDir .   # first time only
clasp push
```
Then run `setup` once in the editor (`clasp open`) and deploy as described above. `server/Core.gs` and `server/.clasp.json` are git-ignored; `app/core.js` is the single source.

## Project layout

```
app/              the app (static PWA): index.html, core.js (shared logic), sw.js, manifest, icons
server/           the Apps Script server: Code.gs + appsscript.json (Core = app/core.js)
desktop/          the Windows app (Electron): opens the app in its own window
.github/workflows pages.yml publishes app/ to GitHub Pages
```

### Building the apps

- **Windows:** `cd desktop && npm install && npm run dist` → `desktop/dist/Stub-Setup-<version>.exe`. Try it without installing: `npm start`.
- **Android:** a [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) Trusted Web Activity for `https://picovrfbt.github.io/Stub/` (package `io.github.picovrfbt.stub`), in immersive full-screen mode that also covers the camera cutout. Android trusts it via [`picovrfbt.github.io/.well-known/assetlinks.json`](https://picovrfbt.github.io/.well-known/assetlinks.json). Forks hosting their own copy need their own package name, signing key and assetlinks file.

## Contributing

Issues and pull requests are welcome. These are especially useful:
- alert formats from other banks;
- store → logo mappings;
- translations;
- accessibility fixes.

Please never post real account numbers or personal details in an issue.

## License

[MIT](LICENSE)
