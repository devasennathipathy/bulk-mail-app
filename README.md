# Postroom · Bulk Mail Application

A complete MERN project for composing and sending bulk email, with a React frontend, an Express API, Nodemailer, and MongoDB through Mongoose.

## Quick demo

You need Node.js **22.12+** (or a supported newer version) and npm. Run these commands from the project root:

```powershell
npm run setup
npm run demo
```

Open **http://localhost:5173**. The demo starts a real local MongoDB database automatically and always uses **preview mode**. Your first run downloads a MongoDB binary, which can take several minutes. Later runs reuse the cached binary. Campaigns persist in `backend/.data/mongodb` between demo sessions. Keep one demo running at a time.

If port 5173 is already occupied, Vite prints the next available frontend URL in the terminal.

Write a subject and message, add recipient addresses, and click **Save preview**. Open **Email history** to see the record and individual recipient results. No real emails are sent in preview mode. Try importing [examples/recipients.csv](examples/recipients.csv).

Stop both servers and the demo database with **Ctrl+C**.

## Run with your own MongoDB and real email

1. Install dependencies with `npm run setup` if you have not already.
2. Copy the backend environment example:

   ```powershell
   Copy-Item backend/.env.example backend/.env
   ```

3. Start local MongoDB, or put a MongoDB Atlas connection string in `MONGODB_URI`. If Docker is installed, the included configuration starts MongoDB with a persistent volume:

   ```powershell
   docker compose up -d
   ```

4. Set your sender configuration in `backend/.env`:

   ```dotenv
   MONGODB_URI=mongodb://127.0.0.1:27017/postroom
   MAIL_MODE=smtp
   MAIL_FROM=Your Name <you@gmail.com>
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=you@gmail.com
   SMTP_PASS=your-app-password
   ```

   For Gmail, enable two-step verification and use a Google App Password. Other providers can use their own SMTP host, credentials, and sender address. Port 587 uses required STARTTLS; port 465 normally uses `SMTP_SECURE=true`. Your provider must permit the `MAIL_FROM` address. Never place SMTP credentials in frontend files or commit `.env`.

5. Start the app:

   ```powershell
   npm run dev
   ```

   The frontend runs at **http://localhost:5173** and proxies `/api` to Express on **http://127.0.0.1:5000**. The composer displays **Send campaign** in SMTP mode. Keep `MAIL_MODE=preview` if you only want to save previews. Restart the backend after changing `.env`.

The backend starts even when MongoDB is unavailable and retries the connection. The interface shows what needs setup instead of pretending that a send succeeded. Use **Workspace settings → Check connection** after connecting the database.

## Features

- Responsive composer with subject, plain-text body, and multiple recipient addresses.
- Comma, space, semicolon, and newline separators; case-insensitive duplicate removal.
- Recipient validation and a limit of 100 addresses per campaign.
- Import a one-column CSV or text list, optionally with an `email` header.
- Email preview and three editable message templates.
- Up to 20 browser-saved drafts, plus automatic recovery of your current composition.
- MongoDB campaign history with search, status filters, pagination, and recipient details.
- Per-recipient delivery results, including partial failure and interrupted sends.
- SMTP acceptance statistics, with previews excluded from real sent counts.
- Individual messages so recipients cannot see the other addresses.
- Server-side validation, JSON errors, rate limiting, and logs that omit message bodies and SMTP credentials.
- Unique request IDs prevent resending the same submission after a network failure.

## How the full stack works

```text
React form → POST /api/emails → Express validation
                                 ↓
                         Save MongoDB record
                                 ↓
                     Nodemailer (3 workers maximum)
                                 ↓
                   Save each recipient's outcome
                                 ↓
                      Final status → React feedback

React history → GET /api/emails → MongoDB → Searchable table
```

Each MongoDB record stores the subject, body, recipient list, mode, status, delivery results, counts, and timestamps. A campaign is recorded **before** SMTP delivery begins. Preview mode uses Nodemailer's JSON transport and saves `previewed` outcomes without contacting an email provider.

The backend sends at most three messages concurrently. `sent` means the SMTP server accepted the message; it does not guarantee inbox placement. `partial` means only some recipients succeeded. `interrupted` means the server restarted while a campaign was in progress. It does not automatically retry an interrupted campaign, since a recipient may already have received an email. Check provider logs before manually resending.

This project is a **local, single-user academic application**. It binds to `127.0.0.1` by default. Admin authentication is not included. Add authentication and authorization before exposing the send API or email history to other users. Sending is handled inside the API process; use a durable job queue for production-scale campaigns. Observe your provider's sending limits.

## Project structure

```text
frontend/
  src/App.jsx               Composer, history, drafts, setup, and API calls
  src/index.css             Responsive app styling
  vite.config.js            React and development API proxy
backend/
  src/server.js             Environment, MongoDB connection, server lifecycle
  src/app.js                Express API, validation, sending, and errors
  src/mailer.js             Nodemailer preview and SMTP transports
  src/models/Email.js       Mongoose record and delivery schemas
  src/repository.js         MongoDB queries and statistics
  src/validation.js         Input validation and campaign limits
  scripts/                  Demo database and browser test server
  test/app.test.js          API integration tests using real temporary MongoDB
scripts/dev.mjs             Starts frontend and backend together
tests/app.spec.js            Browser flow tests
compose.yaml                Optional MongoDB Docker service
examples/recipients.csv      Example recipient import
```

## API reference

| Method | Endpoint                                      | Purpose                                                    |
| ------ | --------------------------------------------- | ---------------------------------------------------------- |
| GET    | `/api/health`                                 | Database state, mail mode, sender, and configuration state |
| POST   | `/api/emails`                                 | Validate, persist, and send or preview a campaign          |
| GET    | `/api/emails?page=1&limit=10&search=&status=` | Paginated history                                          |
| GET    | `/api/emails/:id`                             | Full message and per-recipient outcomes                    |
| GET    | `/api/stats`                                  | Campaigns, real sent/failed counts, and preview counts     |

Example request (generate a **new UUID for each new campaign**; reuse the same UUID only when retrying that exact request):

```json
{
  "subject": "A little hello",
  "body": "Hi there,\nThanks for being part of our community!",
  "recipients": ["alex@example.com", "sam@example.com"],
  "requestId": "52fe0358-e79a-4dc6-b414-62da42605585"
}
```

A completed new request returns `201` with `{ message, record }`. Repeated requests return the existing record with `200`. Use `record.status` to distinguish `sent`, `previewed`, `partial`, `failed`, `sending`, and `interrupted`. A reused UUID with different contents returns `409`. Validation errors return `400`, and unavailable database or SMTP configuration returns `503`.

## Build and verification

```powershell
npm test
npm run build
npm run test:e2e
```

API tests use a real, isolated temporary MongoDB database and never send real emails. Browser tests use installed Google Chrome in headless mode; install Chrome first or adjust `channel` in `playwright.config.js`. They cover validation, CSV import, drafts, preview, MongoDB history, mobile navigation, and offline behavior. Both test suites download MongoDB on their first run and leave your demo database untouched. Run `npm run build` before the browser tests.

To serve the built frontend and API together:

```powershell
npm run build
npm start
```

Open **http://127.0.0.1:5000**. This uses the MongoDB and mail settings from `backend/.env`. For separate frontend hosting, set `VITE_API_URL` (including `/api`) before building, and set `CLIENT_ORIGIN` in the backend to that frontend origin.

## Deploy on Vercel with MongoDB Atlas

The root `vercel.json` deploys two services under one URL: Vite serves the frontend, and Express handles `/api/*`. The frontend uses its existing `/api` URL, so `VITE_API_URL` is not needed for this setup. This follows [Vercel's services configuration](https://vercel.com/docs/services).

1. In Atlas, use your existing free cluster and create a dedicated database user with `readWrite` access to the `postroom` database. Save its password privately.
2. Open **Connect → Drivers**, copy the connection string, and fill in the database username and password. URL-encode special characters in those two values. Use `postroom` as the database name after `.mongodb.net/`.
3. Configure Atlas network access to permit the deployed backend's outbound addresses. Adding your laptop's IP permits only connections from your laptop. See [Atlas network access](https://www.mongodb.com/docs/atlas/security/ip-access-list/).
4. Import the GitHub repository in Vercel. Keep **Root Directory** at `./` and **Application Preset** at **Services** so both services deploy together.
5. Add these project environment variables:

   | Name          | Value                                                                                                   |
   | ------------- | ------------------------------------------------------------------------------------------------------- |
   | `MONGODB_URI` | Your completed private Atlas connection string ending in `/postroom` (with any query options preserved) |
   | `MAIL_MODE`   | `preview`                                                                                               |
   | `MAIL_FROM`   | `Postroom <hello@example.com>`                                                                          |

6. Deploy, then open `/api/health` on the deployed URL. It should show `database: "connected"` and mail mode `preview`. Save a preview in the composer and check Email history.

The Vercel entrypoint is `backend/index.js`. It waits for a shared MongoDB connection and database indexes before handling API requests, reuses a small connection pool, and retries after failed connections on subsequent requests. It does not start the local server or a local MongoDB process. Cold starts do not mark other instances' in-progress campaigns as interrupted. Long-running campaign delivery needs a durable queue; Vercel function time limits still apply.

Keep the initial deployment in preview mode. Admin authentication is still needed before exposing real SMTP sending and private recipient history publicly. Add SMTP environment variables only when that protection is in place. Never put database or SMTP credentials in a `VITE_` variable or commit them to GitHub.

## A simple mentor demo

1. Explain the React form and its validation.
2. Import the example CSV, choose a template, and inspect the inbox preview.
3. Save and reopen a draft to demonstrate browser storage.
4. Save a campaign in preview mode and show the MongoDB history and recipient results.
5. Show `Email.js`, the POST route, and the Nodemailer transport to explain the backend.
6. Configure SMTP and send to your own address to demonstrate real delivery.
