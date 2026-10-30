# RYM Scrobbler privacy policy

**Contact:** gabekahen@gmail.com

## What RYM Scrobbler does

RYM Scrobbler is an independent browser extension that lets you send details of music you have listened to from a Rate Your Music release page to your Last.fm account. It does not play music or automatically detect what you are listening to. It is not affiliated with Rate Your Music or Last.fm.

## Information used

- **Release information:** On Rate Your Music release pages, the extension reads the displayed artist and album names, track titles, and durations to show scrobble controls and a review screen. You can edit the shared artist and album fields and individual song titles and start times.
- **Your Last.fm connection:** When you choose to connect, Last.fm provides an authorization token and a session key to complete the connection. The extension stores your Last.fm username, an in-progress authorization token when applicable, and an encrypted bearer representing the Last.fm session in Chrome's local extension storage. The extension does not ask for or receive your Last.fm password.
- **Scrobbles:** When you choose to submit a listen, the extension sends the selected track titles, artists, album names, durations, timestamps, and encrypted session bearer to the RYM Scrobbler service. By default, track start times are estimated from the full album sequence and durations as if the listen finished when you opened the review; you may edit the finish time or individual start times. Missing track durations are estimated for timing.
- **Operational information:** The service runs on Cloudflare Workers. Cloudflare receives connection information, including your IP address, to deliver the service; the Worker uses the IP address to apply an approximate request rate limit. Cloudflare may process operational information according to its own policies.

## How information is used and shared

The extension uses the information above to connect your Last.fm account, display track details for your review, and submit the listens you choose. It sends authorization and scrobble requests over HTTPS to the RYM Scrobbler Worker hosted by **Cloudflare**. The Worker communicates with **Last.fm** to authorize the connection and submit scrobbles. The extension operates on **Rate Your Music** release pages; your ordinary use of that site is subject to Rate Your Music's own policies.

The service does not use the submitted data for advertising and does not contain analytics code. Application logs and traces were disabled for the production Worker. Cloudflare and Last.fm may handle information under their own privacy policies:

- Cloudflare: https://www.cloudflare.com/privacypolicy/
- Last.fm: https://www.last.fm/legal/privacy
- Rate Your Music: https://rateyourmusic.com/privacy

## Storage and security

Your connection details are held in Chrome's local extension storage. The service encrypts the Last.fm session key into an opaque bearer before returning it to the extension; the bearer is needed to submit scrobbles on your behalf. The service does not maintain a database of user sessions or track histories. Requests are sent over HTTPS. Cloudflare retains its own control over operational data handled by its platform.

## Disconnecting and deleting local data

Choose **Disconnect** in the extension to remove its locally stored username, authorization token, and session bearer. Removing the extension also removes its local extension storage. To revoke the application's Last.fm authorization, use the connected applications controls in your Last.fm account settings. Disconnecting locally does not itself revoke Last.fm's authorization or delete scrobbles already in your Last.fm history.

## Contact

For questions or requests concerning this extension, contact: gabekahen@gmail.com.
