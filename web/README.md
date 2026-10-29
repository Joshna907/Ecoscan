# EcoScan frontend: UI and UX

This is a deliberately plain React interface. Styling lives in src/index.css and src/App.css so the appearance can change without rewriting API calls or the scan workflow.

## Pages and navigation

| Page | Purpose | Main next step |
| --- | --- | --- |
| Home | Introduce scanning, show the guided journey, and explain the example estimates in three short cards | Scan clothes |
| Scan clothes | Choose a photo or camera, wait for recognition, edit items, choose the comparison, confirm | Results |
| Results | Show server-calculated item estimates, totals, potential avoided-production scenario, and awarded points | Rewards or another scan |
| Rewards | Show current server balance, eligible/locked offers, and an explicit redemption confirmation | Redeem or scan again |

The brand links home, while the top navigation contains Results and Rewards. `SpotlightNav.tsx` adds a cursor-following glow and an active-link highlight inside a translucent glass header, adapted from the Vengeance UI Spotlight Navbar pattern without adding Tailwind or Framer Motion. The primary Scan clothes action is in the home hero. The How EcoScan works section uses three short cards; its expandable note keeps scoring assumptions and photo details available on the home page at `/#/#how-it-works`. Old `/#/how-it-works` links redirect there. Hash-based routes (for example /#/scan) keep page links working on a basic static host without special history fallback rules. An unknown route shows a way home.

## Main journey

Home → Scan clothes → Select/capture photo → Scanning → Review items and quantities → Choose whether reuse replaces a planned purchase → Confirm → Results → Rewards → Confirm redemption.

Recognition never silently awards points. The review screen labels mock recognition explicitly. A result with zero points remains a useful estimate. Reward prices and balances come from the backend; this UI does not recalculate or store its own authoritative balance.

The user can navigate between pages while a queued scan runs. The pending analysis ID is retained in sessionStorage so a queued scan can resume after reload. Images and editable review drafts are not persisted in browser storage, so refreshing can lose local review edits. The Results page fetches the latest confirmed estimate from the backend after a refresh. The Account page supports signup and login; an account restores the server-owned demo balance and latest estimate. A full scan history is not implemented.

If confirmation has an uncertain outcome, the UI holds the submitted items unchanged and offers a retry of the same request. The backend's idempotency returns the original result. Redeeming an offer requires a second confirmation, disables repeat clicks, and refreshes the balance afterward.

## Run locally

From the repository root, start the API using the main README. For a quick UI demo, use the API's memory store and mock recognizer. In another terminal:

    npm run dev:web

Open http://localhost:5173. Vite proxies /api to http://127.0.0.1:5000, which keeps the browser session cookie on one origin. PostgreSQL mode also requires the recognition worker.

Camera capture requires browser permission and a secure context (localhost is allowed). If access is denied or unavailable, file upload remains available. Camera tracks stop after capture, closing the camera, or leaving the page.

## Verify

    npm run build:web
    npm run test:web
    npm run lint -w web

The DOM tests use controlled API responses. They cover review and redemption, invalid files, zero-point results, uncertain-confirmation retry, polling across navigation, reload recovery, expiry, camera denial, and stream cleanup. They do not validate physical camera hardware or real OpenAI recognition.

## Code responsibilities

- src/App.tsx: shared page layout, top navigation, routes, and workflow ownership.
- src/pages: page content and forms.
- src/hooks/useScan.ts: scan stages, polling, review drafts, and safe confirmation retry.
- src/hooks/useRewards.ts: current server balance and offer refresh.
- src/lib/api.ts: HTTP requests, session bootstrap, timeouts, response-schema validation, and API errors.
- src/components/CameraCapture.tsx: permission request, video preview, capture, and stream cleanup.
- shared/src: the backend's request/response schemas, reused by the frontend.

## Deployment

npm run build:web creates web/dist. Serve these static files and proxy /api to the backend under the same HTTPS origin. The Vite development proxy is not included in the build. The existing production Compose file remains a backend deployment. Do not place an OpenAI key in Vite environment variables or frontend source.



## EcoScan story and floral theme

The first feature card uses an original wordless 20-second, 60fps film to explain recognition, review, an illustrative footprint estimate, and conditional demo rewards. The cream/sage palette is balanced by baby-pink flowers, petal shapes, a blush motto strip, and pink highlights in the explainer and rewards area.

The hero uses `public/media/ecoscan-wordless.mp4` and `ecoscan-wordless-poster.jpg`. Source artwork, generation prompt, timeline and rebuild instructions live in `media-source/README.md`. The old wardrobe clip is no longer referenced by the UI.

`WardrobeHero.tsx` owns video playback, reduced-motion support, hidden/offscreen pausing, and a screen-reader transcript. `ImpactExplorer.tsx` provides the interactive explanation. No backend behavior changed. Build, lint and the frontend tests cover the existing journeys and motion behavior.


## Guided journey section
`JourneyTour.tsx` shows four scroll-driven stages beside a sticky illustration. The tour is optional and never uploads photos or awards points. Its final link opens `/scan`. Artwork transitions respect reduced motion. The content and scanner link are covered by `journey-tour.test.tsx`.

## How EcoScan works on the homepage
Three short cards explain recognition and review, the example footprint estimate, and the optional reuse comparison. An expandable row below them preserves the example catalogue, points formula, limitations, and photo handling details for readers who want the full explanation.

## Frequently asked questions
`FaqSection.tsx` places six concise, expandable answers below the three cards. Native disclosure elements keep the questions keyboard accessible, and the copy explains recognition limits, demo points, fictional offers, photo handling, and session lifetime.

## Blossom video footer
`SiteFooter.tsx` places the EcoScan identity, four useful links, and one short accuracy note over a blossom video. It deliberately avoids repeating the page's estimate catalogue or product explanation. The public `footer.mp4` is a silent 1280px web encode of the supplied 4K clip (about 1.3 MB instead of 193 MB). `footer-poster.jpg` provides a still fallback. Playback runs only while the footer is visible and the page is active, and stops for reduced-motion settings. The original clip is preserved locally as `media-source/footer-original.mp4` and ignored by Git so it does not inflate the published site.


## ASCII botanical hero and feature cards
The introduction is permanently centered; the timed slideshow, falling-petal overlay and moving motto have been removed. `AsciiFlower.tsx` samples a locally generated botanical illustration and draws actual monospace glyphs on canvas. Its large forms sweep and sway behind the hero text. It stops offscreen and on hidden tabs. Reduced-motion settings pause it automatically. A botanical image is the fallback if canvas is unavailable.

Three linked cards show the wordless scan/reuse film, an illustrative T-shirt footprint, and fictional rewards. Video starts only when its card is visible and pauses offscreen or when the visitor requests reduced motion. The guided tour remains below.

Design reference: https://collectui.com/designs/landing-page-ui-design-inspiration/21ec28ad-b5a2-4a1a-8e83-d9c390431ad1 . This adapts its airy monochrome illustrative approach into an original ASCII flower, rather than copying the mountain artwork or branding.

The built-in image-generation tool created `public/media/ascii-flower-source.png`.
Prompt: A single exquisitely detailed botanical cosmos flower, monochrome engraved graphite illustration on truly transparent background. Large open blossom facing viewer slightly tilted, eight broad softly cupped petals with fine radial etched veins, round dense seed head. One elegant slightly curved slender stem descending and two finely serrated feathery leaves. Entire plant visible with generous margin. Dark charcoal strokes with grayscale shaded petal volumes, high contrast, no white rectangular background. Centered composition, portrait 1024x1024. No text no letters no numbers no border. This is source artwork to be rendered as ASCII characters in a nature-focused clothing sustainability website. Sophisticated antique botanical engraving, not a cartoon, not a photo.
