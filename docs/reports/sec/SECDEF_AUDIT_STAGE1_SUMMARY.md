# SECDEF-AUDIT Stage 1: public summary

In October 2026 every `SECURITY DEFINER` function in the database's `public` schema was inventoried and reviewed against decision #54 (least privilege for database functions). Every function pins its `search_path`, and none is executable by anonymous / PUBLIC callers outside the reviewed allow-list. One caller-check gap was fixed in migration 089 (SECDEF-S2-1). The remaining hardening (narrowing grants and converting internal helpers) is scheduled as follow-up work.

The reviewed inventory used by the permanent ratchet gate is `scripts/secdef/allowlist.json`, checked by `scripts/test_secdef_ratchet.cjs`. Any new definer function, new client grant or loosened `search_path` fails that gate. The detailed audit notes are kept outside the public repository (PUBLIC-HARDEN-1, decision #57).
