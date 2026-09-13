# ONE-WATER LINE AI ACCEPTANCE BASELINE

- Base SHA: 7df2610070518122b1737c62a310ab5492c0e476
- Test branch: test/one-water-line-ai-acceptance-20260913
- Environment: disposable local D1 only
- Production touched: NO
- LINE sends: 0
- Workers AI/provider calls: 0; Ambient used schema-valid local mock bundles
- Transcript events per variant: 108
- Variants: 3
- Full runs: 1
- Ground-truth SHA256: 48334bd4b604b9b3620464c43916f2d32c9a3224d559ac2194ccae57340338b4
- Field coverage: 25/25
- Taxonomy coverage: 25/25
- Subtype coverage: 46/46
- Overall score: 100% observed harness checks
- Critical safety score: PASS
- Negative writes: 0
- Cross-farm leakage: 0
- Duplicate official writes: 0
- AI direct official writes: 0
- Final stock/lifecycle: 0 / READY_NEXT_INTAKE

## Evidence

All official records were created through the local Worker LINE runtime or authenticated local canonical Web API lineage endpoints. The fixture SQL only provisions synthetic local master data and Web session state before each clean run.
