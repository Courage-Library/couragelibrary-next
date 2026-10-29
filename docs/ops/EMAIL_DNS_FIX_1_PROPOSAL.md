# EMAIL-DNS-FIX-1: e-mail DNS hardening (PROPOSAL)

Status: **PROPOSAL**. Read-only DNS checks on 2026-10-29; nothing has been changed. Every change below is **[OWNER]**, made in Cloudflare DNS and the provider consoles. It is separate from the domain cutover and should be done **before** it, so the two never mix.
No keys, IPs or secrets are written here.

## 1. What is there now (public DNS, 2026-10-29)

| Record | Value (shortened) | Problem |
|---|---|---|
| SPF `TXT @` | `v=spf1 include:zoho.in +all` | **`+all` authorises every server on the internet** to send as `@couragelibrary.in`, which makes SPF useless. Brevo is not listed. |
| MX | `0 mx.couragelibrary.in` · `10 mx.zoho.in` · `20 mx2.zoho.in` · `50 mx3.zoho.in` | `mx.couragelibrary.in` has **no own record**. It resolves only through the **wildcard A record** (`*.couragelibrary.in` → the web host). Senders try it first (priority 0), fail, then fall back to Zoho. The result is delays, and some senders may defer. |
| Wildcard `A *.couragelibrary.in` | → web host | Any made-up subdomain resolves (and serves the site). It also produced the misleading MX above. |
| DKIM | `brevo1` / `brevo2._domainkey` → CNAME to Brevo (keys present) | **No Zoho Mail or ZeptoMail DKIM key** was found at common selectors (`zmail`, `zoho`, `default`, …). They may use another selector name. The owner should check in the consoles. |
| DMARC `_dmarc` | `v=DMARC1; p=none; rua=mailto:…@dmarc.brevo.com` | Monitoring only; aggregate reports go to Brevo. |

Senders in use, from the repo and DNS:
- **Zoho Mail:** mailboxes such as `support@`.
- **ZeptoMail:** auth e-mails from `no-reply@`, via Supabase SMTP (`docs/auth/EMAIL_TEMPLATES.md`).
- **Brevo:** a `brevo-code` TXT and Brevo DKIM are present, so marketing or transactional mail may be sent through it.

## 2. Proposed changes (in this order)

| Step | What | Who | Risk / note |
|---|---|---|---|
| 0 | **Inventory.** Confirm every service that sends as `@couragelibrary.in`: Zoho Mail, ZeptoMail, Brevo, anything else (Google Workspace? the legacy site's forms?). | OWNER | Anything missed here gets soft-failed in step 2. Brevo's DMARC reports show the real senders. |
| 1 | **DKIM for every sender.** In the Zoho Mail admin console, find or enable DKIM and publish its TXT at the selector it shows. In ZeptoMail → Domains → `couragelibrary.in`, verify the DKIM record (and its bounce CNAME) shows "Verified". Brevo is already done. | OWNER | Adding a DKIM record is harmless. |
| 2 | **SPF:** replace `+all` with `~all` and list the real senders, e.g. `v=spf1 include:zoho.in include:spf.brevo.com ~all`, plus **exactly what ZeptoMail's domain page asks for**. ZeptoMail normally authenticates through its bounce domain CNAME rather than a root include; follow its console. Keep the record under 10 DNS lookups. | OWNER | `~all` (soft fail) first, never `-all` straight away. Save the old value for rollback. |
| 3 | **Remove the MX `0 mx.couragelibrary.in` record.** Zoho's three MX records stay. | OWNER | Mail then goes straight to Zoho. |
| 4 | **Wildcard A `*`:** decide whether it is needed. If not, delete it and add explicit records only. This is also cleaner for DOMAIN-CUTOVER (typos stop serving the site). | OWNER | Check first that no subdomain (e.g. `cnts`, which has its own CNAME) depends on it. |
| 5 | **DMARC tightening**, after about 2 weeks of clean aggregate reports (all real senders passing SPF or DKIM aligned): `p=quarantine; pct=25` → `pct=100` → later `p=reject`. Optionally add `adkim=r; aspf=r` explicitly. | OWNER | Each step is a one-line TXT change; reverting is the same. |
| 6 | (Later) SPF `-all`, once DMARC is at `reject` and the reports are clean. | OWNER | Optional. |

## 3. Verification after each step

1. `nslookup -type=TXT couragelibrary.in` shows exactly one `v=spf1` record, ending in `~all`.
2. `nslookup -type=MX couragelibrary.in` shows only the three Zoho records.
3. Send one test e-mail each from Zoho Mail, ZeptoMail (a password-reset to the QA account, never a real user) and Brevo to an external mailbox. In the message headers, `Authentication-Results` shows `spf=pass` or `dkim=pass` **aligned** with `couragelibrary.in`, and `dmarc=pass`.
4. Mail **to** `support@` still arrives.
5. The DMARC aggregate reports in Brevo show no legitimate source failing.

## 4. Rollback

Cloudflare DNS: put back the saved TXT or MX value (records take effect within their TTL, 300 s today). No application change is involved; the app's e-mail templates are untouched.

## 5. Engineering follow-ups (after the owner's changes)

- **[ENG]** Add a read-only `EMAIL-DNS` check to the prod-smoke job. It fails if SPF ends in `+all` or `?all`, if an MX record points outside Zoho, or if DMARC is missing. It is DNS only, with no secrets. I'll propose it after step 3.
- **[ENG]** In DOMAIN-CUTOVER-2, the "before / after" DNS snapshot includes these records, so the cutover provably does not touch them.

## 6. Questions for the owner

- **E1** Which services send as `@couragelibrary.in` (step 0)? Is Brevo still used?
- **E2** Is the wildcard `*` record intentional (for example, for the legacy site)?
- **E3** Is `mx.couragelibrary.in` a leftover from a previous mail host?
