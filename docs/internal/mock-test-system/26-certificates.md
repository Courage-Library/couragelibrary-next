# 26 — DIGITAL CERTIFICATES & CRYPTOGRAPHIC VERIFICATION

> **DOCUMENTATION CLASSIFICATION:** Digital Credentials & Cryptographic Security Specification  
> **LIFECYCLE STATUS:** Production & Frozen (Phase 5E.2 Certified)  
> **SYSTEM LAYER:** Verifiable Credentials Infrastructure  

---

## 1. What is it?
The **Digital Certificate & Verification System** generates, signs, and publically verifies digital merit certificates issued to top-performing candidates in All-India Live Competitions using server-side HMAC-SHA256 signatures.

## 2. Canonical Payload & Signing Architecture

### 1. Canonical String Representation:
$$\text{Payload} = \text{CL\_CERT\_V1} \mathbin{\Vert} \text{eventId} \mathbin{\Vert} \text{userId} \mathbin{\Vert} \text{snapshotId} \mathbin{\Vert} \text{certType} \mathbin{\Vert} \text{score} \mathbin{\Vert} \text{rank} \mathbin{\Vert} \text{percentile} \mathbin{\Vert} \text{policyVersion} \mathbin{\Vert} \text{issuedAt}$$

### 2. HMAC-SHA256 Signature Generation:
$$\text{Signature} = \text{HMAC-SHA256}(\text{ServerSecretKey}, \text{Payload})$$
- **Verification Code**: The first 16 hexadecimal characters of the signature formatted as `CL-XXXX-XXXX-XXXX`.

---

## 3. Certificate Types & Merit Thresholds

```
+----------------------------------------------------------------------------------------------------+
| CERTIFICATE TYPE              | ELIGIBILITY THRESHOLD CRITERIA                                     |
+-------------------------------+--------------------------------------------------------------------+
| `PODIUM_GOLD`                 | Rank 1 in All-India Live Competition Event                        |
| `PODIUM_SILVER`               | Rank 2 in All-India Live Competition Event                        |
| `PODIUM_BRONZE`               | Rank 3 in All-India Live Competition Event                        |
| `TOP_1_PERCENT`               | Candidate Percentile P >= 99.0%                                    |
| `TOP_10_PERCENT`              | Candidate Percentile P >= 90.0%                                    |
| `PARTICIPATION_MERIT`         | Completed All-India Live Competition with Score >= Cutoff Marks    |
+----------------------------------------------------------------------------------------------------+
```

---

## 4. Public Verification Portal
- Anyone can verify a candidate's certificate by navigating to `/verify-certificate?code=CL-XXXX-XXXX-XXXX`.
- The server recomputes the HMAC-SHA256 signature against the canonical database payload.
- Returns candidate name, event title, rank, percentile, and issuance timestamp with a tamper-evident green checkmark.

---

## 5. What Must Never Happen
- The `ServerSecretKey` used for certificate HMAC generation must **never** be exposed in client code, environment bundles, or public APIs.
- A certificate must **never** be issued for a live competition that has not been officially published.
