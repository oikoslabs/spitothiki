# Third-party libraries (self-hosted)

These files are unmodified copies of the published packages, served from our own hosting instead of a CDN
(the only change: in the Firebase SDK the absolute `https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js`
imports were rewritten to `./firebase-app.js`). SHA-256 fingerprints are in `SHA256SUMS` and checked by `npm test`.
They keep their own licences; they are **not** covered by this project's AGPL-3.0 licence.

| Folder | Package and version | Licence | Source |
|---|---|---|---|
| `zxing-browser-0.1.5/` | @zxing/browser 0.1.5 (UMD build) | MIT | https://github.com/zxing-js/browser |
| `pdfjs-6.4.299/` | pdfjs-dist 6.4.299 (`pdf.min.mjs`, `pdf.worker.min.mjs`) | Apache-2.0 | https://github.com/mozilla/pdf.js |
| `tesseract-7.0.0/` | tesseract.js 7.0.0 (`tesseract.esm.min.js`, `worker.min.js`) | Apache-2.0 | https://github.com/naptha/tesseract.js |
| `tesseract-7.0.0/core/` | tesseract.js-core 7.0.0 (LSTM builds) | Apache-2.0 | https://github.com/naptha/tesseract.js-core |
| `tesseract-7.0.0/lang/` | @tesseract.js-data ell, eng 4.0.0_best_int (tessdata) | Apache-2.0 | https://github.com/tesseract-ocr/tessdata_best |
| `firebase-13.0.0/` | Firebase JS SDK 13.0.0 (app, auth, firestore) | Apache-2.0 | https://github.com/firebase/firebase-js-sdk |
