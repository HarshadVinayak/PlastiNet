# PlastiNet

PlastiNet is a local-first recycling demo with a trainable Cloe assistant, QR scan flow, rewards, and profile history.

## Deploy to the public web

This project is ready to deploy as one Node web service on Render. The same Express server serves the frontend and the API, so you do not need separate frontend and backend hosting.

### What I already prepared

- `render.yaml` for a Render web service
- same-origin API calls so the frontend works on any deployed domain
- `.env.example` with the MongoDB variable you need

### What you still need to do manually

1. Push this project to a GitHub repository.
2. Create a MongoDB Atlas cluster.
3. In Atlas, create a database user with a username and password.
4. In Atlas, add a network access entry for your app.
5. Copy the Atlas driver connection string and replace the placeholders with your real username, password, and database name.
6. Create a new Render Blueprint or Web Service from your GitHub repo.
7. Set `MONGODB_URI` in Render to your Atlas connection string.
8. Deploy and open your Render URL.

### Manual steps in detail

#### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Prepare PlastiNet for deployment"
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
```

#### 2. Create MongoDB Atlas

MongoDB Atlas says application connections use a URI connection string such as `mongodb+srv://<db_username>:<db_password>@<clusterName>.mongodb.net/?retryWrites=true&w=majority`, and Atlas requires a Node.js driver version that supports MongoDB 7.0+ for M0 Free or Flex clusters.

In Atlas:

1. Create a project and cluster.
2. Go to `Database Access` and create a database user.
3. Go to `Network Access` and add an IP access list entry.
4. For a quick first deploy, you can allow `0.0.0.0/0`, but Atlas warns this allows access from anywhere, so use strong credentials and tighten it later.
5. Click `Connect` on your cluster, choose `Drivers`, and copy the Node connection string.

Use a final URI like:

```text
mongodb+srv://YOUR_USER:YOUR_PASSWORD@YOUR_CLUSTER.mongodb.net/plastinet?retryWrites=true&w=majority
```

#### 3. Deploy on Render

Render's current docs say a web service can be created from a GitHub repo, must bind to the `PORT` environment variable on `0.0.0.0`, and can use `npm install` and `npm start` as the build and start commands for Node apps.

In Render:

1. Sign in and click `New` -> `Blueprint` or `New` -> `Web Service`.
2. Connect your GitHub repo.
3. If you use the Blueprint flow, Render reads `render.yaml` automatically.
4. If you use the Web Service form manually, use:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Health Check Path: `/health`
5. Add an environment variable:
   - Key: `MONGODB_URI`
   - Value: your Atlas connection string
6. Create the service and wait for the first deploy.

When it finishes, your app will be live at a URL like:

```text
https://your-service-name.onrender.com
```

### After deploy

- Open the Render URL
- Sign up in the app
- Test one scan flow
- If scans fail, first check the Render logs and then verify the Atlas username, password, and network access list

## Share Cloe without hosting

Cloe's custom training lives in browser storage under `plastinetCloeCustomEntries`, so you can share the project and its training data without deploying anything.

1. Start the app locally with `npm install` and `npm start`.
2. Open `http://localhost:3000`.
3. In the Cloe panel, use `Export brain JSON` to download the current custom training.
4. Send your friend the repo plus that exported JSON file through a zip, shared drive, git bundle, or USB.
5. On their machine, they run the same local setup and use `Import shared brain` to load the training file into their browser.

## Run locally

Requirements:

- Node.js 18+
- MongoDB running locally at `mongodb://127.0.0.1:27017/plastinet` if you want the scan API to persist data

Install and start:

```bash
npm install
npm start
```

Then open `http://localhost:3000`.

The same Node process now serves:

- the front end from `index.html`
- the API from `server.js`

## Make it Android downloadable

PlastiNet is already wired as a Progressive Web App (PWA) so any Android phone with Chrome/Edge/Brave can install it directly.

- Host the app over HTTPS (Render already provides this) and visit the deployed URL in Chrome on Android. Once the service worker (`sw.js`) is registered, Chrome fires `beforeinstallprompt` and the `Install App` button in the hero section appears automatically.
- Tap `Install App` or use the browser menu → **Add to Home screen**; the manifest (`manifest.webmanifest`) supplies a standalone display mode, neon icons, and theme colors so the shortcut behaves like a native app.
- After installation you can launch PlastiNet from the home screen, and the built-in service worker keeps the shell available offline.
- If the install prompt still hides, open Chrome’s menu, choose **Add to Home screen**, and wait for the “Add PlastiNet?” dialog—the service worker registration completes before that prompt becomes available, so refreshing the page can help trigger it.

If you need a traditional Android package (`.apk` / `.aab`) for sideloading or Play Store distribution, wrap this PWA in a Trusted Web Activity (TWA):

1. Install the Bubblewrap CLI: `npm install -g @bubblewrap/cli`.
2. Run `bubblewrap init --manifest=https://your-service.onrender.com/manifest.webmanifest` and answer the prompts (set `packageId`, `applicationName`, point `launcherIcon` to `assets/app-icon-512.png`, etc.).
3. Build and preview with `bubblewrap build` followed by `bubblewrap install` (Android Studio / SDK required).
4. Sign and export the resulting APK/AAB via the generated Gradle project (`./gradlew bundleRelease` or `./gradlew assembleRelease`) before sharing or uploading to the Play Console.

The PWA shell already provides the offline cache, install prompt, and icon assets that TWAs rely on, so the same deployment powering the web version becomes the Android download.

## Training file format

Starter examples live in `training/initial-entries.json`.

Each custom entry uses this shape:

```json
[
  {
    "id": "custom-example-1",
    "title": "Pickup partner script",
    "tags": ["partner", "pickup", "schedule"],
    "response": "Pickup partners can verify the QR trail from the history tab before confirming a collection run.",
    "trainedAt": 1710000000000
  }
]
```

You can also train Cloe directly inside the UI with the `Teach Cloe a new insight` form. Those entries are immediately added to the local browser brain and can be exported again later.
