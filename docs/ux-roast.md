# UX Roast: Proof App Walkthrough

Date: 2026-05-21
Scope: `proof/refine.html`, `proof/index.html`, `proof/pitch.html`
Run URL: `http://127.0.0.1:4173/proof/refine.html?session=example`
Artifacts: [`docs/ux-roast-artifacts/`](ux-roast-artifacts/)

## Executive Diagnosis

This thing has taste and brains, which makes its sins more annoying. It looks like a serious operator console, but behaves like a beautiful spreadsheet that wandered into a product demo wearing a crown and refusing to explain itself.

The strongest surface is the refinement console: it has a clear story, real session artifacts, and useful defect evidence. The weakest surface is mobile, where the app simply gives up and becomes a horizontal-scroll punishment chamber. Functionally, the app is demoable for an expert, but not trustworthy enough for a real buyer because several views promise proof while hiding the actual proof behind files, placeholders, iframes, or dense internal labels.

No browser console errors were captured during the automated walkthrough. The problems are UX, information architecture, accessibility, responsiveness, and product credibility.

## Critical Findings

1. **Mobile layout is broken, not merely cramped.**

   Evidence: [`05-refine-mobile.png`](ux-roast-artifacts/05-refine-mobile.png), [`refine-mobile-personas.png`](ux-roast-artifacts/refine-mobile-personas.png), [`06-data-mobile.png`](ux-roast-artifacts/06-data-mobile.png)

   On a 390px viewport, the refinement console renders as a giant desktop canvas. The sidebar consumes the viewport, the actual content starts offscreen, and the user has to horizontally pan like they are excavating a cursed spreadsheet. The data console has the same issue: KPI cards, run tabs, and hero content overflow sideways. A real user on mobile will not think “dense power tool”; they will think “this was never tested on my device.”

2. **Filtering sessions can create a lying page state.**

   Flow tested: open Riverside HVAC, click the `legal` filter.

   Result: the sidebar filters down to Prairie & Hayes LLP, but the main content can still show Riverside Heating & Cooling until the user clicks the filtered card. That is spiritually illegal. If the left rail says the set is legal-only, the main pane should not still be celebrating HVAC. Either auto-select the first visible session or show an explicit “select a session” state after filters change.

3. **The personas tab promises before/after proof, then shows an after-side IOU.**

   Evidence: [`refine-personas.png`](ux-roast-artifacts/refine-personas.png)

   The left column shows the raw agent transcript with highlighted failures. Excellent. The right column says “after · fixes applied” and then basically whispers “go read `after-calls.json`.” Darling, no. This is the emotional center of the product. The whole point is “watch it get better.” The UI must show the after transcript inline, with the same phrase-level evidence, before/after delta, and maybe audio playback if available.

4. **The app confuses success with readiness.**

   Evidence: [`03-data-console.png`](ux-roast-artifacts/03-data-console.png), [`06-data-mobile.png`](ux-roast-artifacts/06-data-mobile.png)

   The latest data run says `100%` pass, then the big proof panel says readiness is `red 43/100`. This might be analytically correct, but the page does not stage the distinction cleanly. A normal user sees “100%” and “red” and assumes the app is either contradicting itself or being dramatic for sport. Split “test pass rate” from “deployment readiness” more explicitly, and explain which number is allowed to drive a decision.

5. **Navigation controls are visually present but accessibility-poor.**

   Refinement tabs are `div`s. Session cards are `div`s. Filter pills are `span`s. Pitch pips are unlabeled `div`s. The app is mouse-first and screen-reader-hostile. The pitch arrows at least use buttons; much of the rest should become real `button` elements with keyboard states, focus rings, and ARIA labels where needed.

## Visual Roast

The dark console aesthetic is coherent, but it is also a little too committed to being a basement command center. Everything is slate, green, red, blue, and tiny mono labels. It looks credible, but after ten minutes it feels like every component is muttering from behind tinted glass.

The Wranngle design system gives the brand a warmer action color and more distinctive identity. This proof app mostly abandons that in favor of generic developer-console severity. The result is polished but not very ownable. A screenshot of this could belong to twenty different eval dashboards.

The refinement console has the best visual rhythm: sidebar, KPI strip, tabs, evidence rows. The data console is the messiest: it starts with KPIs, then jumps into a giant “What this run actually proves” editorial panel, then matrix, bars, trials, sidebars, audio, readiness gaps. It has a lot of correct ingredients arranged like the user is expected to already know the recipe.

## Functional Roast

- The refinement console loads quickly and tab clicks work.
- Session switching works once the user explicitly clicks a session.
- Regression and prompt tabs fetch their extra files successfully.
- Compliance artifact renders in an iframe, but the “print this iframe to PDF” instruction feels like a prototype wearing a fake mustache. Give me a real export/download action.
- The data console run tabs work, but the trials table is buried. The page says “click any row,” but the rows are far below the first meaningful viewport.
- “copy trial JSON” appears to trigger a download-style blob flow, not an actual clipboard copy. Rename it or actually copy.
- The pitch deck arrow navigation works. The pips work, but they are unlabeled tiny bars with no user-visible slide names.

## Spiritual Roast

The product’s soul is split in three:

- The refinement console wants to be a product experience where a business owner watches an agent improve.
- The data console wants to be an internal evaluator dashboard for serious operators.
- The pitch deck wants to sell a strategic platform story to ElevenLabs leadership.

All three are individually understandable, but together they feel like three tabs from three different arguments. The app needs a stronger north star: is this a buyer-facing trust experience, an engineer-facing eval console, or a fundraising/product pitch? Right now it is all three, which means every screen makes the user do translation work.

The biggest missed opportunity is emotional proof. The copy keeps saying the user “watches it happen,” but the UI often says “trust me, the JSON exists.” The crown jewel should be the before/after call: transcript, audio, defect highlight, fix applied, re-test passed. Put that front and center and make everything else subordinate.

## Recommended Fix Order

1. Fix responsive layout for `proof/refine.html` and `proof/index.html`.
2. Auto-select or clear the main pane when session filters change.
3. Render real after-call transcripts in the personas tab.
4. Replace clickable `div`/`span` controls with semantic buttons and keyboard support.
5. Clarify pass rate vs readiness score with labels and decision framing.
6. Productize compliance export with a real PDF/download control.
7. Rework data-console information architecture so the first viewport answers: “Can I ship this agent?”
8. Bring the visual language closer to the Wranngle brand instead of generic terminal noir.

## Saved Evidence

- Raw browser interaction log: [`observations.json`](ux-roast-artifacts/observations.json)
- Refinement desktop: [`01-refine-initial.png`](ux-roast-artifacts/01-refine-initial.png)
- Refinement personas: [`refine-personas.png`](ux-roast-artifacts/refine-personas.png)
- Refinement mobile: [`05-refine-mobile.png`](ux-roast-artifacts/05-refine-mobile.png)
- Data console desktop: [`03-data-console.png`](ux-roast-artifacts/03-data-console.png)
- Data console mobile: [`06-data-mobile.png`](ux-roast-artifacts/06-data-mobile.png)
- Pitch deck: [`04-pitch-initial.png`](ux-roast-artifacts/04-pitch-initial.png), [`pitch-slide-5.png`](ux-roast-artifacts/pitch-slide-5.png), [`pitch-slide-7.png`](ux-roast-artifacts/pitch-slide-7.png)
