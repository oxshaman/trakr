# trakr

A small app for tracking your weight, body measurements and gym workouts. It runs in the browser, installs to a phone's home screen, works offline, and can sync to a Google Sheet that you own.

## What it does

- **Weight.** One weigh-in per day, a goal weight, and a chart with daily points plus a trend line. The trend is the average of the last 7 days.
- **Measurements.** Waist, chest, arm and others. You pick which ones to track in Settings.
- **Workouts.** Start from a saved routine or from empty. Each set records weight, reps and RPE. Empty fields show last time's numbers in grey, and marking a set done accepts them.
- **Routines.** Named lists of exercises, such as Push, Pull and Legs.
- **Progress.** Workouts per week, the heaviest set per exercise, and a chart per exercise.
- **Units.** kg and cm by default, with a switch to lb and inches.

## Run it

There is no build step and nothing to install. The app is plain JavaScript modules, so it only needs a web server.

```bash
python3 tools/serve.py
```

Then open http://localhost:5173. To open it from a phone on the same Wi-Fi, start the server with `python3 tools/serve.py 5173 0.0.0.0` and visit `http://<your-computer's-ip>:5173`. Over plain http on a network address the app works, but it cannot be installed or used offline. For that it needs https, which is what hosting gives you.

## Put it on your phone

Host the folder on any static host that serves https. GitHub Pages and Cloudflare Pages are free and both work with the folder as it is. All paths in the app are relative, so it also runs from a sub-path such as `https://you.github.io/trakr/`.

Then open the address on your phone:

- **iPhone:** Safari, Share, Add to Home Screen.
- **Android:** Chrome, menu, Install app.

After you publish a change, the first load still shows the old version and the second load shows the new one. The app answers from its offline copy first and refreshes that copy in the background.

## Sync with a Google Sheet

Without sync, data stays in the browser on that one device. To back it up and share it between devices, connect a sheet:

1. Create a new Google Sheet.
2. In the sheet, open Extensions, then Apps Script.
3. Replace the editor contents with [apps-script/Code.gs](apps-script/Code.gs). The Settings screen in the app has a button that copies it.
4. Near the top of the script, change `SECRET` from `change-me` to a passphrase of your own.
5. Click Deploy, then New deployment. Choose the type "Web app". Set "Execute as" to Me and "Who has access" to Anyone. Approve the permission prompt.
6. Copy the web app URL. In trakr, open Settings and paste the URL and the passphrase.

On a second device, enter the same URL and passphrase.

The URL and the passphrase together work like a password to that sheet. Anyone who has both can read and change it through the script. Keep them to yourself.

If you edit the script later, use Deploy, Manage deployments, Edit, New version. That keeps the same URL.

### How sync works

The app saves every change on the device first, so logging is instant and works with no signal. A few seconds later it sends the changed records to the script in one request. The script writes them into the sheet and answers with everything that changed since this device last synced.

- The sheet gets one tab per data type: `weights`, `measurements`, `exercises`, `routines`, `workouts`, `sets`, `settings`. Each row is one record.
- When two devices change the same record, the later change wins.
- Deleted records stay in the sheet with `deleted` set to TRUE. That is how other devices learn about the delete.
- A workout is sent when you finish it. A workout in progress exists only on the device you are using.
- The app syncs when it opens, when it returns to the foreground, when the connection comes back, and after changes.

You can read and chart the data in the sheet. Editing rows by hand is not supported: the app only picks up rows that the script wrote, because the script stamps each write with a revision number.

## Backup

Settings has Export and Import. Export writes everything on the device to a JSON file. Import merges a file back in and keeps the newer version of each record.

## Project layout

```
index.html            page shell
styles.css            all styles
sw.js                 service worker for offline use
manifest.webmanifest  install metadata
src/main.js           start-up
src/app.js            routes
src/lib/              data: store, sync, calculations, actions
src/ui/               shared parts: charts, sheets, navigation, icons
src/screens/          one file per area of the app
apps-script/Code.gs   the Google Sheet script
vendor/               Preact and htm in one file, see vendor/README.md
icons/                app icons
tools/                dev server, tests, icon generator
```

The UI is written with Preact and htm, which gives React-style components without a compile step. The file in `vendor/` is the only third-party code.

## Tests

Start the dev server and open http://localhost:5173/tools/test.html. The page runs the tests and shows the result in its title.

The sync tests run the real `apps-script/Code.gs` against a fake spreadsheet (`tools/fake-gas.js`) with two simulated devices. They cover conflicts, deletes, starter data on two devices, and the sheet turning date text into real dates.

## Changing things

- **A new source file** must be added to the `ASSETS` list in `sw.js`, or it will not be available offline. A test fails when one is missing.
- **Icons** are drawn by `python3 tools/make_icons.py`.
- **Fonts** (Bricolage Grotesque and Figtree) load from Google Fonts. The service worker keeps a copy after the first load.
- **Local development** runs without the service worker so edits always show up. Add `?sw=1` to the URL to test offline behaviour on localhost.
