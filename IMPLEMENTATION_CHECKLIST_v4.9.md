# v4.9 Final Production-Hardening Checklist

## Tier 1 - Homepage Audit
- [x] Cover title remains **Homepage SEO, UX & Conversion Audit**.
- [x] Cover score label changed to **Overall Homepage Score**.
- [x] Page 2 changed to **Your Homepage at a Glance**.
- [x] Roadmap pages changed to **Your Homepage Roadmap** / **Continued**.
- [ ] Test one live Quick audit and confirm only the homepage is crawled and every client-facing scope label says Homepage.

## Tier 2 - Comprehensive Audit
- [x] Preserve approved 7-page visual system and readable-type pass.
- [x] Increase text inside the green **Key pages reviewed** cover seal while keeping the seal diameter unchanged.
- [x] Utility/API/media-library endpoints no longer consume one of the five purchased page-review slots.
- [x] Skipped utility endpoints are retained separately as `utilityFindings` technical evidence, while the crawler continues seeking meaningful visitor-facing pages.
- [x] Full-site AI instructions explicitly prohibit turning `utilityFindings` into page-review cards.
- [ ] Run a site that exposes `/files/`, `/api/`, or similar and confirm five meaningful pages are selected when available.
- [ ] Confirm page 3 and 4 card copy stays inside borders with long-but-valid live content.

## Tier 3 - Competitive Edge
- [x] Competitor Profiles expanded from one page to a two-page section.
- [x] Total premium report length updated from 14 to 15 pages.
- [x] Pages after Competitor Profiles renumbered accordingly.
- [x] Page 2 vertical budget tightened so the two bottom strategic cards remain above the footer.
- [x] Premium generation prompt now requests concise, complete copy with field-specific word budgets.
- [x] Visible ellipsis-style clipping removed from the report safety helper; overflow fallback ends at a sentence/word boundary.
- [x] Approved quarter-circle ornamental frame system retained.
- [ ] Test with 3 real competitor URLs and verify page 5 contains profiles A/B, page 6 contains profile C + strategic takeaway.
- [ ] Verify page 2 footer is visible and both bottom cards are fully enclosed.
- [ ] Scan all 15 pages for visible cut-off prose, ellipses caused by layout, clipped borders, or overflow.

## Regression / Delivery QA
- [ ] Quick renderer visual identity unchanged except approved Homepage scope wording.
- [ ] Comprehensive renderer remains 7 pages.
- [ ] Competitive renderer is 15 pages.
- [ ] All three PDFs render in Chromium with no clipped text, black SVG fills, missing border sides, or broken glyphs.
- [ ] Check page counts and footer numbering.
- [ ] Run Etsy webhook signature fixture.
- [ ] Run TypeScript typecheck/build in the local project with dependencies installed.
- [ ] Send these builds to human testers only after the live-PDF checks above pass.
