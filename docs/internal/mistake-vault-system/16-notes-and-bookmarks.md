# COURAGE LIBRARY — MISTAKE VAULT SYSTEM
## CHAPTER 16: CANDIDATE NOTES & BOOKMARK SERVICE INTEGRATION

---

## 1. Personal Annotation & Bookmarking Architecture

Candidates can annotate mistake vault records with personal insights and organize questions into custom revision bookmark folders.

```mermaid
flowchart TD
    CANDIDATE[Candidate]
    CANDIDATE -->|Annotate| NOTES[user_custom_notes in user_mistake_vault]
    CANDIDATE -->|Bookmark| BMARK[Bookmark Service (services/bookmark.service.ts)]
    BMARK --> FOLDERS[Custom Bookmark Folders]
    BMARK --> TAGS[Revision Tags]
```

---

## 2. Functional Capabilities

- **Custom Notes**: Candidates can document specific personal traps (e.g., *"Forgot that sine of obtuse angles is positive"*). Stored in `user_mistake_vault.user_custom_notes`.
- **Bookmark Synchronization**: Integrated via `BookmarkService` with full folder hierarchy support, allowing candidates to curate specialized "Pre-Exam Formula Sheets" or "High-Yield Traps".
