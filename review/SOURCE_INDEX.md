# Source and evidence index

Start with the concise files before reading implementation details.

## Review authority

- `02_PRODUCT_TRUTH.md` — current facts and non-claims.
- `03_KNOWN_OPEN_ITEMS.md` — known defects, questions, and release work.
- `90_CURRENT_CLOSEOUT_PLAN.md` — working roadmap to challenge, not authority.
- `reports/current-final-regression-report.json` — latest combined gate result.
- `reports/phase5d-c-comparison-report.json` — accepted final-presentation gate.
- `reports/annex-e1-comparison-report.json` — accepted exploded-study gate.
- `reports/current-junction-report.json` — latest visible plate-junction repair.
- `reports/center-third-mesh-report.json` — repaired 64T/10T pair.
- `reports/third-fourth-mesh-report.json` — repaired 60T/8T pair and remaining
  read-only pair screens.
- `reports/review-capture-report.json` — compact camera, pose, image hash,
  source hash, browser, and visual-inspection record for the supplied frames.

## Key product source

- `source/src/spec.ts` — tooth counts, module, rate, depths, and layout.
- `source/src/movement.ts` — train ownership, placement, and kinematics.
- `source/src/geometry.ts` — wheels, barrel, balance, pallet, and tooth profiles.
- `source/src/structure.ts` / `structureSpec.ts` — mainplate and bridges.
- `source/src/displayDrive*.ts` — certified hour/minute motion works.
- `source/src/readout*.ts` — chapter, markers, hands, and readout materials.
- `source/src/enclosure*.ts` / `exterior*.ts` — case and sapphire architecture.
- `source/src/strap*.ts` — wearable attachment.
- `source/src/finish*.ts` — movement finishing and studio response.
- `source/src/identity.ts` — render-only crown/rear identity.
- `source/src/explodedStudy.ts` and `main.ts` — E1 and runtime/capture APIs.

## Interactive preview

`preview/` contains the exact static build generated for this review packet.

- Do not open `preview/index.html` using `file://`.
- Run `preview/serve-local.sh` on macOS/Linux or
  `preview/serve-local.bat` on Windows.
- Open `http://127.0.0.1:8080/`.
