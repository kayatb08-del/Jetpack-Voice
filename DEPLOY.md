# Deploy Jetpack Voice Hero Publicly

## Option A: Render (recommended)
1. Push this project to GitHub.
2. Go to Render dashboard and choose **New +** -> **Blueprint**.
3. Connect your GitHub repo and select this project.
4. Render will detect `render.yaml` and create the web service.
5. After deploy, your public URL will look like:
   `https://jetpack-voice-hero.onrender.com`

The game UI and `/leaderboard` API are both served by the same service.

## Option B: Railway
1. Push this project to GitHub.
2. Create a new Railway project from the repo.
3. Railway will use `npm start`.
4. Expose the service domain from Railway settings.
