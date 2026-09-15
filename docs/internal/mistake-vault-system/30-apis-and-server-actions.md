# COURAGE LIBRARY — MISTAKE VAULT SYSTEM
## CHAPTER 30: APIS & SERVER ACTIONS SPECIFICATION

---

## 1. Server Actions Catalog (`app/mistakes/actions.ts`)

| Action Name | Signature | Description |
|---|---|---|
| `fetchMistakeVaultAction` | `(filters?: MistakeVaultFilterParams) => Promise<MistakeVaultResult>` | Retrieves paginated and filtered mistake feed. |
| `fetchLongitudinalOverviewAction` | `(window?: LongitudinalWindowType) => Promise<MistakeLongitudinalOverview>` | Fetches windowed trajectory and cross-exam analytics. |
| `createMistakeDrillAction` | `(params: CreateDrillParams) => Promise<DrillSessionResult>` | Dynamically generates a targeted revision drill. |
| `submitMistakeDrillAction` | `(drillId: string, responses: DrillResponse[]) => Promise<DrillSubmitResult>` | Submits drill answers, evaluates streaks, awards coins. |
| `updateMistakeCognitiveTypeAction` | `(vaultId: string, cognitiveTypeId: string) => Promise<ActionResult>` | Persists candidate override for cognitive classification. |
| `updateMistakeNotesAction` | `(vaultId: string, notes: string) => Promise<ActionResult>` | Saves personal revision annotations. |
