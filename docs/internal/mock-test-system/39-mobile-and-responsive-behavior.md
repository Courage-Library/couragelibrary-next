# 39 — Mobile, Responsive & Viewport Architecture

## 1. Multi-Device Layout Strategy

Over 70% of competitive exam candidates in India access mock tests via mobile devices (Android / iOS smartphones). The Courage Library Assessment Player implements a responsive, mobile-first design system that guarantees **zero accidental touches, pixel-perfect mathematical rendering, and accessible controls** across all device form factors.

```
+-------------------------------------------------------------+
| Desktop (>= 1024px) Layout: 2-Column Split                 |
+------------------------------+------------------------------+
| Header: Timer, Section Tabs, Language, Theme, Submit Button |
+------------------------------+------------------------------+
| Left Column (70%):           | Right Column (30%):          |
| - Question Meta & Marks      | - Candidate Profile Widget   |
| - Question Content (KaTeX)   | - Color Legend (5 States)    |
| - Options (A, B, C, D)       | - 100-Question Grid Palette  |
| - Fixed Action Bar at Bottom | - Filter by Section/Status   |
+------------------------------+------------------------------+

+-------------------------------------------------------------+
| Mobile (< 768px) Layout: Single-Column + Bottom Sheet Palette|
+-------------------------------------------------------------+
| Header: Compact Timer, Section Selector Dropdown, Menu      |
+-------------------------------------------------------------+
| Main Scrollable Area:                                       |
| - Question Number & Tag Badges (+2.0, -0.5)                 |
| - Mathematical Formula / Diagram / Question Text           |
| - Large Touch-Friendly Options (Min 52px Touch Target)      |
+-------------------------------------------------------------+
| Fixed Sticky Bottom Action Bar (No Scroll):                 |
| [ Mark Review ] [ Clear ] [ Palette Icon ] [ Save & Next ]  |
+-------------------------------------------------------------+
| Bottom Sheet Modal (Toggled via Palette Icon):              |
| - Swipeable full-height question grid palette               |
+-------------------------------------------------------------+
```

---

## 2. Touch Target & Accessibility Invariants

To eliminate candidate misclicks during high-pressure timed exams:

1. **Minimum Touch Surface**: Every clickable element (Radio button, Navigation button, Palette item) conforms to a minimum bounding box of $48\text{px} \times 48\text{px}$ (exceeding WCAG 2.1 AAA standards of $44\text{px}$).
2. **Option Cards as Full Touch Boundaries**: Candidates do not need to click a tiny $16\text{px}$ radio circle; clicking anywhere inside the option container card toggles the selection.
3. **No Double-Tap Zoom**: Viewport meta tag disables destructive pinch-zoom on action buttons while preserving accessibility zoom on complex diagrams:
   ```html
   <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes" />
   ```
4. **Haptic Feedback**: On supported Android devices, selecting an option or saving triggers subtle haptic feedback (`navigator.vibrate(15)`).

---

## 3. Dynamic Watermarking on High-DPI Screens

To safeguard proprietary exam content against screen recording, the dynamic forensic watermark dynamically scales across device pixel ratios (DPR 1x, 2x Retina, 3x OLED).

```mermaid
flowchart TD
    A[Mount Exam Player Viewport] --> B[Detect Device Pixel Ratio: window.devicePixelRatio]
    B --> C[Compute Dynamic Diagonal Density: sqrt(W^2 + H^2)]
    C --> D[Render HTML5 Canvas Overlay: Pointer-Events: None]
    D --> E[Draw Rotated Text Pattern: -35 deg]
    E --> F["Text: user_id + timestamp + IP Hash"]
    F --> G[Set Opacity: 0.045 to 0.065]
```

### 3.1 Watermark Canvas Rendering Implementation
```typescript
export function renderForensicWatermark(
  canvas: HTMLCanvasElement, 
  userText: string, 
  dpr: number
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const width = canvas.parentElement?.clientWidth || window.innerWidth;
  const height = canvas.parentElement?.clientHeight || window.innerHeight;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  ctx.clearRect(0, 0, width, height);
  ctx.font = '500 13px Inter, Roboto, sans-serif';
  ctx.fillStyle = 'rgba(100, 116, 139, 0.055)'; // Neutral slate with 5.5% opacity
  ctx.rotate((-35 * Math.PI) / 180);

  const stepX = 220;
  const stepY = 140;

  for (let x = -width; x < width * 2; x += stepX) {
    for (let y = -height; y < height * 2; y += stepY) {
      ctx.fillText(userText, x, y);
    }
  }
}
```

---

## 4. Mobile Bottom Sheet Palette Navigation

On mobile screens, rendering 100 question buttons directly on the screen causes severe content crowding. The mobile player encapsulates the question grid inside a swipeable bottom sheet:

```
┌──────────────────────────────────────────────┐
│  ▲ Swipe Up to View Question Palette (100)   │
├──────────────────────────────────────────────┤
│  Section: Quantitative Aptitude (25 Qs)      │
│  [1] [2] [3] [4] [5] [6] [7] [8] [9] [10]    │
│  [11][12][13][14][15][16][17][18][19][20]    │
│  [21][22][23][24][25]                        │
│                                              │
│  Legend:                                     │
│  ● Answered (12)      ○ Not Visited (8)      │
│  ▲ Marked Review (3)  ■ Ans & Review (2)     │
└──────────────────────────────────────────────┘
```

---

## 5. Virtual Keyboard & Viewport Stability

When candidates type numerical answers in Numerical Value Questions (NVQ):
- **Problem**: Mobile virtual keyboards trigger `window.resize` and push the sticky action bar into the middle of the viewport or hide input boxes.
- **Solution**: The engine uses the `visualViewport` API:
```javascript
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    const bottomBar = document.getElementById('exam-sticky-bottom-bar');
    if (bottomBar) {
      // Pin bottom bar strictly to visible viewport bottom, not layout viewport
      const offset = window.innerHeight - window.visualViewport.height;
      bottomBar.style.transform = `translateY(-${offset}px)`;
    }
  });
}
```

---

## 6. Offline / Reconnect Mobile Alerts

When mobile data drops (e.g., traveling on a train):
1. **Status Banner**: Non-blocking amber banner appears at top: *"Offline mode active — your answers are safely saved locally"*.
2. **Action Continuity**: Candidate can continue answering questions without disruption.
3. **Reconnection Toast**: When 4G/5G restores: *"Reconnected — 4 answers successfully synced to server"*.
4. **Prevent App Exit**: Attaches `beforeunload` hook to prevent accidental browser back-swipe.
