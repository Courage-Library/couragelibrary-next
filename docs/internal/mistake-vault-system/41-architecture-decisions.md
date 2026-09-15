# COURAGE LIBRARY — MISTAKE VAULT SYSTEM
## CHAPTER 41: ARCHITECTURE DECISION RECORDS (ADRS)

---

## ADR-001: PostgreSQL Atomic RPCs for Ingestion
- **Decision**: Ingest occurrences and update vault profiles via a single `SECURITY DEFINER` stored procedure (`fn_record_mistake_occurrence`).
- **Rationale**: Eliminates network round-trips and guarantees atomic consistency under race conditions via `SELECT ... FOR UPDATE`.

## ADR-002: 2-Consecutive Verification Rule
- **Decision**: Require 2 consecutive correct remediations to achieve `MASTERED` status.
- **Rationale**: Mitigates 4-option multiple choice guessing probability ($25\% \rightarrow 6.25\%$).

## ADR-003: Exponential Decay Stability Heuristic
- **Decision**: Model memory stability using $R(t) = \exp(-t / S_{\text{eff}})$ with status-based constants.
- **Rationale**: Provides deterministic spaced revision recommendations with zero external API dependencies.

## ADR-004: Soft Errata Revocation Pattern
- **Decision**: Use `REVOKED_ERRATA` status instead of physical row deletion.
- **Rationale**: Maintains a complete, immutable forensic audit trail while correcting candidate metrics.
