# Content Security, MDX Sanitization & Anti-Injection Architecture

## 1. Threat Landscape & Threat Model

Courage Library processes rich markdown and MDX authored by external AI systems, staff members, and contributors. Content is rendered to thousands of candidates across web and mobile viewports.

### Primary Content Threats
1. **Cross-Site Scripting (XSS)**: Malicious `<script>`, `<iframe>`, `javascript:` URI schemes, or event handlers embedded in markdown.
2. **Component Hijacking**: Unauthorized MDX component invocations accessing private runtime props or leaking environment variables.
3. **CSS / Style Injection**: Obfuscated stylesheet injection attempting UI redress attacks, phishing overlays, or candidate clickjacking.
4. **Denial of Service via Regex / AST Explosions**: Deeply nested markdown tokens crafted to stall AST parsing threads (ReDoS / AST bomb).

---

## 2. Multi-Stage Sanitization Pipeline

Every piece of authored content passes through a strict 4-stage sanitization and compilation pipeline before candidate delivery:

```
[ Raw Author / AI Markdown ]
             ↓
[ Stage 1: Static Pre-Parse Regex & Scheme Scanner ]
  - Strips forbidden raw HTML tags (<script>, <iframe>, <object>, <embed>, <applet>)
  - Validates URL protocols (allows only http:, https:, mailto:, tel:, relative anchors)
             ↓
[ Stage 2: Unified / Remark AST Parser ]
  - Converts markdown text into structured abstract syntax tree (mdast)
  - Enforces depth limits to prevent AST explosion
             ↓
[ Stage 3: Rehype AST Sanitization Gate ]
  - Whitelists safe HTML tags (h1-h6, p, ul, ol, li, table, thead, tbody, tr, th, td, blockquote, pre, code, strong, em)
  - Whitelists safe interactive components (<Callout>, <StatCard>, <FormulaBox>, <Timeline>, <DiffViewer>)
  - Strips all `on*` event attributes (onclick, onload, onerror)
             ↓
[ Stage 4: Strict Deterministic React Compilation ]
  - Compiles mdast/hast into static React vnode structure
  - Cached as JSONB in `exam_doc_versions.compiled_ast`
```

---

## 3. Allowed Component Registry

Only explicitly registered components from `@/components/mdx` are permitted inside knowledge documents and curriculum units. Any unrecognized custom JSX tag is stripped or rendered as plaintext.

```typescript
// Whitelist of allowed MDX components
export const ALLOWED_MDX_COMPONENTS = {
  Callout: CalloutComponent,
  StatCard: StatCardComponent,
  FormulaBox: FormulaBoxComponent,
  Timeline: TimelineComponent,
  TableOfContents: TableOfContentsComponent,
  ClaimBadge: ClaimBadgeComponent,
  SourceCitation: SourceCitationComponent,
  DiffViewer: DiffViewerComponent,
};
```

---

## 4. URL Scheme & Link Sanitization

All hyperlinks in markdown (including AI source citations) are checked against a strict protocol whitelist:

```typescript
export function sanitizeUrl(url: string): string {
  if (!url) return '';
  const trimmed = url.trim().toLowerCase();
  
  // Disallow javascript, data, vbscript, and file schemes
  if (
    trimmed.startsWith('javascript:') ||
    trimmed.startsWith('data:') ||
    trimmed.startsWith('vbscript:') ||
    trimmed.startsWith('file:')
  ) {
    return '#';
  }

  // Allow safe protocols
  if (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('mailto:') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('#')
  ) {
    return url.trim();
  }

  return '#';
}
```

---

## 5. Automated Security CI Verification

The repository includes automated CI test suites (`test-exam-knowledge-schema-validation.ts` and `test-mdx-security.ts`) that execute over 30+ adversarial test vectors:
- Polyglot XSS vectors (`<svg onload=alert(1)>`, `<img src=x onerror=...>`).
- Obfuscated HTML entities (`&#x3C;script&#x3E;`).
- Malicious markdown link formats (`[Click Here](javascript:prompt(1))`).
- Arbitrary code execution attempts inside MDX frontmatter.

All 30+ adversarial security tests are required to pass with 0 warnings before any release certification.
