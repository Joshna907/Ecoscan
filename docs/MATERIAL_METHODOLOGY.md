# Label-first material screening — dataset v2

Reviewed 2 November 2026. This is an educational screening model, not a product LCA or verified avoided emissions claim.

## Evidence and confirmation

The garment recognizer only suggests categories. An optional close-up care-label photo is transcribed separately. Illegible or ambiguous labels produce no suggestions. Users must review and confirm unique materials totaling 100%, including fractional percentages. Manual entry is available without OCR. No composition is preselected. Label photos are sent to OpenAI when enabled, with `store: false`, and are not persisted by EcoScan; this does not imply zero provider retention.

Confirm only a blend representing the whole weighed item. Shell, lining, padding and shoe-upper labels do not normally describe total item mass. If component masses are unknown, leave the material profile unconfirmed. Quantity means identical items sharing the entered blend and per-item mass; enter different garments separately. Footwear weight means one pair.

## Factors and provenance

Dataset `ecoscan-material-factors-v2` uses **Factors Allowing Users to Influence the Environmental Performance of Their T-Shirt**, Sustainability 2021, 13(5), 2498, [DOI and article](https://doi.org/10.3390/su13052498), Figure 4A and its accompanying fibre-production discussion. Values below are approximate, since the published text is rounded. They represent the study's background fibre models, not supplier-specific or current global averages.

| Fibre | Reported kg CO2e / 264 g | Central kg CO2e / kg |
| --- | ---: | ---: |
| Cotton | 1.2 | 4.55 |
| Polyester | 1.1 | 4.17 |
| Nylon | 2.7 | 10.23 |
| Wool | 9.7 | 36.74 |
| Flax / linen | 0.4 | 1.52 |
| Viscose | 0.9 | 3.41 |
| Polyacryl / acrylic | 1.1 | 4.17 |

Code divides the reported impact by 0.264 without intermediate rounding. Low/high factors are **EcoScan sensitivity assumptions at 0.5 and 1.5 times central**, not study confidence limits, observed extrema or guarantees. Elastane, leather and other materials have no verified factor in this release. Any blend containing one retains the category benchmark without a partial material total. Recycled/organic claims are not automatically assigned discounts.

Do not combine data solely because all values use kg CO2e. The [2026 Textile Exchange cotton study](https://textileexchange.org/knowledge-center/reports/cotton-life-cycle-assessment/) ends at the gin gate, while its [polyester study](https://textileexchange.org/knowledge-center/reports/polyester-life-cycle-assessment/) ends at fibre formation. Their production systems and methods require explicit harmonization before adding them to a common factor dataset. They are research context, not the numerical source for v2.

## Weight assumptions

Prefer a measured dry per-item weight. Accepted entries are 20–5,000 g. Entry is user reported, not independently verified. Otherwise use these deliberately broad screening bounds:

| Category | Low / central / high, grams |
| --- | --- |
| T-shirt | 130 / 200 / 300 |
| Jeans | 450 / 800 / 900 |
| Jacket | 350 / 700 / 1,900 |
| Shoes (pair) | 500 / 800 / 1,200 |

[ADEME's 2018 clothing reference models](https://prod-basecarbonesolo.ademe-dri.fr/documentation/UPLOAD_DOC_FR/coton_-synthetique_-autre_2.htm) provide reference masses of 200 g for T-shirts, 800 g for jeans, 500 g for an anorak and 1,900 g for a coat. EcoScan uses these as anchors, with engineering screening bounds around them, not survey percentiles. The jacket central and footwear bounds are explicit prototype assumptions. Heavy boots, children's garments, padded outerwear and unusual sizes should be weighed. No default range is asserted to cover every product.

## Calculation and boundaries

For each low/central/high scenario: `mass in kg × sum(material share × fibre factor) × quantity`. Display rounds only final impacts to two decimals. Adding endpoint scenarios is conservative bookkeeping, not statistical uncertainty propagation.

This retained-fibre mass proxy covers cradle-to-fibre-gate production. It excludes manufacturing losses, spinning into yarn, fabric formation, dyeing, sewing, trims, packaging, distribution, washing, repair and disposal. Whole-garment weight includes trims, so treating it as fibre mass is another approximation. Neither blend nor weight proves a garment's supply chain or lifetime.

The category benchmark remains the assignment's illustrative 5/10/15/8 kg CO2e values, with **assumed** 60–160% sensitivity bounds. It is separate from, and never added to, the fibre estimate. Partial material coverage is counted explicitly. A material-stage result may exceed the category benchmark because the latter is illustrative; this is not a reconciled product inventory.

The optional avoided-production comparison remains half the category benchmark. Rewards use that benchmark and recognition evidence only; material and mass entries never increase points. No purchase displacement or real saving is verified.

Results expose source, dataset version, coverage and uncertainty. Updating numerical values requires a new dataset version and regression checks. Older incompatible saved snapshots are treated as unavailable while balances and reward receipts remain intact; users can create a fresh estimate.

## Component coverage and additional datasets

Shell, lining, padding, upper and sole masses can be entered separately, each with a confirmed blend. A whole-item measured mass is required; component masses must not exceed it. Missing components and components whose blend includes an unsupported material are excluded. Results report supported material grams per item; a subtotal is not a full garment or footwear footprint. No default shell/lining/sole mass split is invented.

Additional reviewed/licensed snapshots can be loaded using MATERIAL_FACTORS_FILE, an absolute server-side JSON path. The snapshot replaces the dataset as a whole so incompatible studies are not silently mixed. Required fields: version, unit `kg CO2e/kg fibre`, boundary `fibre production, cradle-to-gate`, and a factors object keyed by supported material names. Each factor requires ordered low/central/high and source title, HTTPS URL, table/reference, method, geography, year and license. Invalid imports fail startup. Estimates retain the snapshot version and its provenance.

Research reviewed Mistra Future Fashion's Environmental assessment of Swedish fashion consumption (section 2.4.4 and Appendix A2.1.5), Hyosung's spandex LCA disclosures, and the official Ecobalyse material/process mapping at revision 9ec865248d25472b68d9994fd61c0a27754ea47e. These establish elastane processes or relative reductions, but the inspected public data did not provide a directly usable, harmonized absolute climate factor. Ecobalyse's material API requires a valid token, and its public ECS value is an environmental score, not kg CO2e. Do not convert that score into a carbon factor or substitute a polyurethane foam factor for spun elastane. The default elastane factor therefore remains unavailable until an appropriate licensed/reviewed dataset is supplied. The import mechanism supports it without further scoring changes.
# Review and coverage update (2 November 2026)

See [factor review findings](FACTOR_REVIEW_2026-11-02.md). No new elastane or finished-material factor was approved. Model `materials-v2` computes supported fractions without renormalising incomplete blends. Results explicitly identify missing fibres, their central-weight masses, and unallocated component mass. Known-contribution ranges do not bound the complete garment.

Factor imports additionally require `review: { reviewer, reviewedAt, assessmentMethod, unitsChecked: true, boundaryChecked: true, softwareUsePermitted: true }`. Every factor's `source.method` must equal `review.assessmentMethod`. The review record is operator-controlled and requires an actual source/licence check. Finished leather and unspecified `other` are excluded from the fibre-production import boundary.
