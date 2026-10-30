# RYM Scrobbler

A Chrome extension for sending selected tracks from a Rate Your Music release to your Last.fm account. Choose **Scrobble album** on a release page, select tracks, edit details or listening times, and submit them to Last.fm. It does not play music or detect listening automatically.

The extension connects through Last.fm; users do not need their own API key. It uses a Cloudflare Worker to sign Last.fm requests. This independent project is not affiliated with Rate Your Music or Last.fm.

## Use

1. Install the extension from the Chrome Web Store once it has been approved and published.
2. Open the extension and choose **Connect Last.fm**. Authorize the application on Last.fm, then return and choose **Finish connecting**.
3. Open an RYM release, choose **Scrobble album**, select tracks, review the details, and submit.

The review dialog lets you change the shared artist and album, individual song names and start times, and the listen finish time. Track timestamps are calculated using the full album sequence; missing durations use three minutes for timing. Check Last.fm before retrying a submission if its result is uncertain.

## Development

- `extension/` contains the Manifest V3 Chrome extension. Load that folder via **chrome://extensions** → Developer mode → **Load unpacked**. It is configured for this project's public backend.
- `worker/` contains the Cloudflare Worker and its mock tests. See [worker/README.md](worker/README.md) for deployment, secrets, and operational considerations. Run tests with `cd worker && npm test` using Node.js 20 or later.

To use a different backend, change `BACKEND_ORIGIN` in `extension/background.js` and the matching `host_permissions` entry in `extension/manifest.json`. Never put Last.fm shared secrets in the extension or commit them to the repository.

## Privacy and attribution

See the [privacy policy](PRIVACY.md). RYM page selectors were informed by [RYMscrobble by sbcodes](https://greasyfork.org/en/scripts/594928-rymscrobble), which is marked MIT licensed; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
