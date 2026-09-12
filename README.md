# CrossRoads

*(formerly "Study Peer Finder")*

A web app where VIT students sign up, build a profile, and get matched with the classmates most similar to them — by course, interests, subjects, hostel block, and city.

---

## What's inside

```
CrossRoads/
├── server.js          Backend (Express + SQLite) — auth + matching logic lives here
├── package.json        Project config and dependencies
├── public/
│   ├── index.html       Auth screen, dashboard, profile form, and results page
│   ├── style.css        Styling (dark, gradient, "immersive" theme)
│   └── app.js           Frontend logic (talks to the backend API)
└── peerfinder.db        (auto-created after first run — your database)
```

---

## Step 1: Install prerequisites

You need **Node.js** installed on your computer (version 16 or higher).

- Download it from: https://nodejs.org (choose the "LTS" version)
- To check if it's already installed, open a terminal/command prompt and run:
  ```
  node -v
  ```

---

## Step 2: Get the project onto your computer

1. Download and extract the ZIP file provided.
2. Open a terminal and navigate into the folder:
   ```
   cd path/to/CrossRoads
   ```

---

## Step 3: Install dependencies

```
npm install
```

This downloads Express, better-sqlite3, cors, and bcryptjs (used to hash passwords).

> **If you already had a `peerfinder.db` file from the old "Study Peer Finder" version**, delete it before starting the server. The database schema changed (accounts now have email + password + gender), and old rows won't have those columns.

---

## Step 4: Run the app

```
node server.js
```

You should see:

```
CrossRoads running at http://localhost:3000
```

Open your browser to `http://localhost:3000`.

To stop the server, press `Ctrl + C`.

---

## How the app flows now

1. **Sign In / Sign Up** — the first screen. New users create an account with name, email, and password (passwords are hashed with bcrypt before being stored — never saved in plain text). Returning users sign in with the same email/password.
2. **Dashboard** — after signing in, you land on a dashboard with two clickable tiles:
   - **🪪 My Profile** — fill in / edit your course, gender, semester, subjects, city, hostel block, interests, and clubs.
   - **🧭 Find My Peers** — see your ranked matches (this tile redirects you to complete your profile first if you haven't yet, since matching needs at least a course + interests).
3. Refreshing the page keeps you signed in (a session token is kept in the browser's `localStorage`) until you hit **Log out**.

## Profile fields

- **Gender** — Male / Female
- **Course/Branch** — full VIT Vellore catalogue (all CSE specialisations — Core, AI & ML, AI & Data Engineering, Data Science, Cyber Security, Bioinformatics, Business Systems, Blockchain — plus IT, ECE, EEE, EIE, VLSI, Mechanical, Civil, Chemical, Biotech, integrated 5-year programmes, BBA, MBA, MCA, etc.)
- **Semester** — the dropdown options change automatically based on the course's usual duration (e.g. B.Tech shows 8 semesters, a 5-year integrated programme shows 10, MBA/MCA show 4)
- **Subjects Chosen** — only appears once semester 3 or higher is selected
- **City**
- **Hostel Block** — A, B, B–Annex, C, D, D–Annex, E, F, G, H, J, K, L, M, N, P, Q, R, S, T, or "Day Scholar / Not applicable"
- **Interests**
- **Clubs/Chapters**

> VIT periodically revises which specialisations it offers each admission cycle — double check the course list in `public/app.js` (`COURSE_GROUPS`) against the current VIT Vellore prospectus if you need it to be authoritative.

## How matching works

Unchanged from before — every other *completed* profile is compared against yours using four weighted factors (interests 40%, subjects 25%, clubs 15%, location 20%, using Jaccard similarity + same-city/same-hostel bonuses). Tune the weights in the `W_INTERESTS` / `W_SUBJECTS` / `W_CLUBS` / `W_LOCATION` constants near the top of `server.js`.

## Filters on the "Find My Peers" page

Same as before — Same City, Other City (mutually exclusive with Same City), Same Hostel Block, Shared Interests Only, Seniors Only. These combine with AND logic.

## Resetting data for testing

```
curl -X DELETE http://localhost:3000/api/reset
```
This wipes both the `users` and `sessions` tables. Or just delete `peerfinder.db` and restart the server.

---

## Deploying (e.g. on Render)

This project is already set up for a typical Node.js host:

1. Push the project to a GitHub repository (see below).
2. On Render (or Railway, etc.), create a new Web Service connected to that repo.
3. Build command: `npm install`. Start command: `npm start` (or `node server.js`).
4. Render gives you a public URL — that's your "render link." Anyone who opens it now sees the **Sign In / Sign Up** screen, so each person can create their own account and come back to their own profile later instead of everyone sharing one browser's `localStorage` profile.

**Note on the database on Render's free tier:** SQLite (`peerfinder.db`) is a local file. On Render's free plan, the filesystem is *not* persistent across deploys/restarts — your `users` table (and everyone's accounts) can get wiped when the service redeploys or spins down. For a live class project, either upgrade to a Render plan with a persistent disk, or migrate to a hosted database (Render's free Postgres instance is the common next step). This isn't something this update changes — it was already true before — but it matters more now that accounts (not just profiles) live in that file.

---

## Reflecting these changes on GitHub

The instructions below assume the project already lives in a GitHub repo (as suggested in the original version of this README) called, say, `peer-finder`. Here's how to get these changes in:

**Option A — you already have the repo cloned locally:**
```bash
cd path/to/your/local/clone
# copy the new files from this update over your existing ones
# (index.html, app.js, style.css, server.js, package.json, README.md)

git add .
git commit -m "Rebrand to CrossRoads: add auth, gender field, VIT course/hostel lists, dashboard, dark theme"
git push origin main   # or whatever your default branch is called
```
If you connected Render to auto-deploy from that branch, pushing is enough — Render will redeploy automatically. Otherwise, trigger a manual deploy from the Render dashboard.

**Option B — starting fresh / renaming the repo too:**
1. On GitHub, go to the repo → **Settings** → rename it from `peer-finder` to `crossroads` (optional, but matches the new name — GitHub will keep the old URL working as a redirect).
2. `git clone` it locally if you haven't already.
3. Replace the contents with these updated files.
4. `git add . && git commit -m "Rebrand to CrossRoads with auth + dashboard" && git push`.
5. If Render is connected to this repo, it'll pick up the new commit automatically (Render tracks the repo, not its name, so a rename alone doesn't break the connection — but double check the linked repo URL in Render's dashboard afterward, just in case).

**A couple of things worth doing at the same time:**
- Add a `.gitignore` with `node_modules/` and `peerfinder.db` if you don't already have one — you don't want to commit the database file (it'll contain real users' password hashes) or the installed packages.
- Since passwords are now involved, make sure `peerfinder.db` was never committed in the old version either — if it was, treat those old passwords as compromised (nobody had passwords before this update, so this likely doesn't apply, but worth a quick check with `git log --all -- peerfinder.db`).

---

## Possible next upgrades

- Move off SQLite to a hosted Postgres database so accounts survive redeploys on Render's free tier
- Add "forgot password" (email-based reset) — right now there's no recovery path if someone forgets their password
- Switch free-text interests/subjects/clubs to checkboxes from a predefined list
- Add a "connect" button that reveals contact info or opens a chat
- Add pagination once you have hundreds of users
