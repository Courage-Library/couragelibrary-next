# Web fonts (BUILD-FONT-1)

Self-hosted subsets loaded by `next/font/local` in `app/layout.tsx`. The build never downloads fonts.
The files are the Google Fonts subsets BRAND-2 already shipped (same bytes), renamed for reading.

| File | Family | Weight | Subset |
| --- | --- | --- | --- |
| inter-latin.woff2 / inter-latin-ext.woff2 | Inter (variable) | 100–900 | Latin / Latin Extended |
| poppins-600-*.woff2 / poppins-700-*.woff2 | Poppins | 600 / 700 | Latin, Latin Extended, Devanagari |
| noto-sans-devanagari-devanagari.woff2 | Noto Sans Devanagari (variable) | 400–600 used | Devanagari |

Copyrights (from the font files):

- Inter — Copyright 2016 The Inter Project Authors (https://github.com/rsms/inter)
- Poppins — Copyright 2020 The Poppins Project Authors (https://github.com/itfoundry/Poppins)
- Noto Sans Devanagari — Copyright 2022 The Noto Project Authors (https://github.com/notofonts/devanagari)

All three are licensed under the SIL Open Font License, Version 1.1 (see `OFL.txt` in this folder,
also at https://openfontlicense.org). The fonts are not sold on their own and keep their names.
