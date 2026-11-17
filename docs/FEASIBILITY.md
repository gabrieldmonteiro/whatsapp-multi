# Phase 1 — Integration Feasibility

## Options evaluated

| Option | Personal accounts | QR login | Permitted | Verdict |
|---|---|---|---|---|
| WhatsApp Business Platform (Cloud API) | No (business numbers, API tokens) | No | Yes | Doesn't fit the product |
| Unofficial protocol libs (Baileys, whatsapp-web.js, etc.) | Yes | Yes | **No**: reverse engineering / automation, ban risk | Rejected |
| Official WhatsApp Web (`web.whatsapp.com`) in isolated Electron sessions | Yes | Yes (WhatsApp's own QR, linked devices) | Same use as a browser tab; no automation | **Recommended** |

## Recommended integration
- Each account gets one `WebContentsView` with its own persistent partition (`persist:account-<uuid>`). Cookies and storage stay inside Chromium's own profile storage and are never read, copied or exported by the app.
- The user scans WhatsApp's own QR via *Linked devices* on their phone. The app doesn't intercept, render or automate anything.
- No script injection, DOM scraping, message automation or protocol access. Only the shell UI belongs to the app.
- "Persistent auth" = partition on disk; "active session" = live view. Inactive views are suspended or destroyed and recreated on demand.

## Risks
1. **User-agent gating.** WhatsApp Web blocks browsers it doesn't recognise. Electron's default UA may trigger "unsupported browser". Mitigation: send the UA of the bundled Chromium version with the `Electron/x` token removed. This is a compatibility setting, not an auth bypass, but WhatsApp could change detection at any time.
2. **Terms of Service.** WhatsApp's consumer ToS forbid unauthorised automated access and unofficial clients that alter the service. Wrapping the unmodified web client without automation is how multi-messenger apps (Ferdium, Rambox) work, but WhatsApp doesn't explicitly endorse it. Docs must say the app is unofficial and unaffiliated.
3. **Linked-device limits.** WhatsApp limits each phone number to a few linked devices, and links expire after long phone inactivity.
4. **Resource use.** Each live view is a Chromium renderer. Mitigation: one active view, lazy creation, optional background-notification mode per account.
5. **Notifications for inactive accounts** need the view alive. This is a trade-off between memory and notifications, and the user chooses per account.

## Conclusion
Viable, provided the app only hosts the official web client in isolated sessions. Proceed to Phase 2 on that basis.
