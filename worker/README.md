# RYM Scrobbler backend

A Cloudflare Worker that handles Last.fm authorization and signs scrobble requests for the extension. It stores the app secret in Worker secrets; user Last.fm session keys are encrypted using AES-256-GCM into opaque bearer tokens and held by the extension, not a backend database.

## Deployment preparation

1. Use a Cloudflare account that stays on **Workers Free**. Verify the active account and plan before deploying. The free plan is a no-paid-overage choice, not a $5 hard cap across an account's other Cloudflare products. Requests beyond a free allowance may fail. This project must not enable paid services or subscriptions without the account owner's explicit agreement.
2. Install Node.js and Wrangler 4.36 or later. This directory includes `wrangler.jsonc` with a rate-limit binding. Select a namespace ID unique within the Cloudflare account. Each Worker has a `workers.dev` HTTPS address; a custom domain is unnecessary.
3. Configure Worker secrets named `LASTFM_API_KEY` and `LASTFM_API_SECRET` from the Last.fm application's key and shared secret, and `SESSION_ENCRYPTION_KEY`, an independent base64-encoded 32-byte cryptographically random value. Use Cloudflare's secret editor or `npx wrangler secret put NAME`. Never put these values into source files or extension distribution. Do not print secrets into logs.
4. Deploy with `npx wrangler deploy` after testing. Configure the deployed HTTPS URL in the extension. Cloudflare rate limits are approximate per location, not a strict global quota. Last.fm may impose additional limits.
5. Test real Last.fm authorization and scrobbling only using an authorized account and a real listen. These local tests mock Last.fm and do not establish service availability.

Loss or rotation of `SESSION_ENCRYPTION_KEY` invalidates all connections, requiring users to reconnect. Rotating Last.fm app credentials also requires coordinating deployment and may invalidate sessions. An opaque token is a bearer credential: possession permits scrobbling for that connected account. Keep it out of logs and guard it in the extension. Disconnecting locally removes the token, but users can revoke the app in Last.fm account settings for server-side revocation. The Worker never receives Last.fm passwords.

The endpoints are deliberately usable from Chrome extensions; CORS is not authentication. Rate limiting reduces accidental and basic abusive use, but is not a strict global abuse control. Do not enable request-body or token logging. Before public launch, review hosting, privacy disclosures, Last.fm API terms, revocation, and rate-limiting behavior in the real Cloudflare account.

## Endpoints

All are HTTPS POST with JSON and return JSON. `POST /auth/start` takes `{}` and returns `{ok, token, authorizationUrl}`. Open `authorizationUrl`; once the user approves, `POST /auth/finish` with `{token}` returns `{ok, session, username}`. Save `session` privately. `POST /scrobble` takes `{session, tracks}`, where tracks contain `artist`, `track`, `album`, `duration` and Unix-seconds `timestamp`. Results include `accepted`, `ignored`, and `details`; a failure may include `uncertain: true`, meaning a request may have succeeded and the user should check Last.fm before retrying.

Run the isolated mock tests with `npm test` (Node 20+); no network or credentials are required. The tests substitute Node MD5 for the Last.fm legacy signature; production uses Cloudflare's documented Web Crypto MD5 support.
