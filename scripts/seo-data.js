'use strict';
/* ============================================================
   Lexora AI — content registry for the SEO landing pages.
   One entry per page (slug = filename without .html = clean URL).
   Rendered by scripts/seo-page.js. Fields:
     name, free (true = browser tool), cta, ctaText,
     benefits[ '<b>title</b>text' ], steps[], faqs[ [q, a] ], related[ slugs ]
   ============================================================ */
var LX_SEO = {

/* ================= core tool pages ================= */
'merge-pdf': { name:'Merge PDF', free:true, cta:'tools.html#merge', ctaText:'Merge PDFs now — free',
  benefits:['<b>Any number of files</b>Combine two PDFs or twenty — reorder them with a tap before merging.','<b>Nothing uploaded</b>Files are merged on your device, so contracts and statements stay private.','<b>Original quality</b>Pages are copied, not re-rendered — text stays sharp and selectable.','<b>No signup</b>Open the tool and merge. No account, no watermark, no daily file limit.'],
  steps:['<b>Pick your PDFs</b> — drop them or tap Select (any count).','<b>Arrange the order</b> with the ◀ ▶ arrows on each file.','<b>Tap Merge PDF</b> — the combined file downloads instantly.'],
  faqs:[['Is merging PDFs free on Lexora AI?','Yes — completely free, with no watermarks, signup or daily limits. It runs in your browser.'],['Are my PDFs uploaded to a server?','No. Merging happens 100% on your device; the files never leave your browser.'],['Will the merged PDF keep its quality?','Yes — pages are copied directly into the new file, so text stays selectable and images untouched.']],
  related:['split-pdf','compress-pdf','pdf-to-word','watermark-pdf'] },

'split-pdf': { name:'Split PDF', free:true, cta:'tools.html#split', ctaText:'Split a PDF now — free',
  benefits:['<b>Visual page picker</b>Tap page thumbnails or type ranges like 1-3,7.','<b>Two ways out</b>Extract chosen pages into one PDF, or save every page as its own file (ZIP).','<b>Private</b>Splitting runs in your browser — nothing is uploaded.','<b>Fast</b>No queue, no server round-trip — even big files split in seconds.'],
  steps:['<b>Open your PDF</b> — page previews appear.','<b>Tap the pages</b> you want (or type a range).','<b>Split</b> — download the extracted pages or a ZIP of singles.'],
  faqs:[['Can I extract just one page from a PDF?','Yes — tap that page in the preview and split. You get a clean single-page PDF.'],['Can I split every page into separate files?','Yes — tick "save each page as a separate PDF" and you get a ZIP with one file per page.'],['Is it private?','Completely. The PDF is processed on your device and never uploaded.']],
  related:['merge-pdf','crop-pdf','compress-pdf','pdf-to-jpg'] },

'compress-pdf': { name:'Compress PDF', free:true, cta:'tools.html#compress', ctaText:'Compress a PDF now — free',
  benefits:['<b>Never a bigger file</b>If nothing can be shrunk you keep the original — guaranteed.','<b>Text stays sharp</b>Images inside the PDF are optimized in place; text remains crisp, selectable and searchable.','<b>Three levels</b>Balanced, strong, or light — you choose the size/quality trade-off.','<b>★ HD option</b>A server-grade Ghostscript engine for maximum shrink when you need email-size files.'],
  steps:['<b>Drop your PDF</b> in the compressor.','<b>Pick a level</b> — Balanced is right for most files.','<b>Compress</b> — see exactly how many MB you saved.'],
  faqs:[['Will compressing reduce my PDF quality?','Pictures are re-optimized at your chosen level, but text is never rasterized — it stays perfectly sharp. The Light level is visually lossless for most documents.'],['Why is my compressed file the same size?','Some PDFs are already optimized. Lexora never returns a larger file — you simply keep the original.'],['Is there a stronger compression?','Yes — the ★ Premium toggle uses a server-grade engine with Maximum and Web presets, 50 free pages a day.']],
  related:['merge-pdf','repair-pdf','pdf-to-jpg','ocr-pdf'] },

'pdf-to-word': { name:'PDF to Word', free:true, cta:'tools.html#pdf2word', ctaText:'Convert PDF to Word — free',
  benefits:['<b>Editable .docx</b>Headings, bold text and pictures preserved — not a screenshot in a document.','<b>Scans handled</b>Scanned PDFs are OCR’d automatically into clean, editable text.','<b>Private by default</b>The free converter runs entirely in your browser.','<b>★ HD conversion</b>A server layout engine for complex documents — tables, columns and precise formatting.'],
  steps:['<b>Drop the PDF</b> — digital or scanned.','<b>Convert</b> — choose free (on-device) or ★ HD (server, with consent).','<b>Open in Word</b> — a real .docx you can edit anywhere.'],
  faqs:[['Does it keep my formatting?','The free converter keeps headings, bold text and images. For complex layouts (tables, multi-column), the ★ HD server engine reconstructs the layout much more precisely.'],['Can it convert scanned PDFs?','Yes — scans are recognised (OCR) on your device and exported as editable text.'],['Is PDF to Word free?','Yes. The on-device converter is free and unlimited; the optional HD engine gives 50 free pages a day, then ~₹0.10 a page.']],
  related:['word-to-pdf','ocr-pdf','pdf-to-excel','edit-word'] },

'word-to-pdf': { name:'Word to PDF', free:true, cta:'tools.html#word2pdf', ctaText:'Convert Word to PDF — free',
  benefits:['<b>Clean, readable PDFs</b>Text, headings and lists laid out properly.','<b>On your device</b>The free converter never uploads your document.','<b>★ HD via LibreOffice</b>Pixel-faithful conversion on the server for complex .docx files.','<b>Works everywhere</b>No Microsoft Office needed — just a browser.'],
  steps:['<b>Drop your .docx</b> file.','<b>Convert</b> — free on-device, or ★ HD for perfect fidelity.','<b>Share the PDF</b> — it looks the same on every device.'],
  faqs:[['Do I need Word installed?','No — everything runs in the browser (or on our server for HD jobs).'],['Will my fonts and layout survive?','Simple documents convert perfectly on-device. For heavy formatting, the ★ HD engine renders with a full office suite server-side.'],['Is it private?','The free path never uploads your file. HD jobs upload once with your consent and are deleted after conversion.']],
  related:['pdf-to-word','excel-to-pdf','powerpoint-to-pdf','edit-word'] },

'pdf-to-excel': { name:'PDF to Excel', free:false, cta:'tools.html#pdf2excel', ctaText:'Extract tables to Excel',
  benefits:['<b>Real spreadsheets</b>Each detected table becomes its own sheet in a proper .xlsx.','<b>Built for ruled tables</b>Bank statements, invoices and reports with visible lines extract best.','<b>Two-pass detection</b>A lattice pass for ruled tables, then a stream pass for whitespace tables.','<b>Fair pricing</b>50 pages free every day, then about ₹0.10 a page — shown before you upload.'],
  steps:['<b>Drop the PDF</b> with tables.','<b>Approve the job</b> — the consent screen shows pages and price first.','<b>Open the .xlsx</b> — one sheet per table, ready for formulas.'],
  faqs:[['What kinds of PDFs work best?','PDFs with ruled/visible table lines — bank statements, invoices, GST reports. Scanned tables should be OCR’d first.'],['Is PDF to Excel free?','Every day the first 50 pages are free. Past that it costs about ₹0.10 a page from your wallet, always shown before anything uploads.'],['Is my statement safe?','The file is uploaded once over HTTPS with your explicit consent, converted, returned, and deleted from the server.']],
  related:['excel-to-pdf','ocr-bank-statements','pdf-to-word','ocr-invoices'] },

'excel-to-pdf': { name:'Excel to PDF', free:false, cta:'tools.html#excel2pdf', ctaText:'Convert Excel to PDF',
  benefits:['<b>Print-perfect sheets</b>Rendered by a full office engine, so column widths and formatting hold.','<b>.xls and .xlsx</b>Old and new Excel formats both work.','<b>Consent first</b>You see the page count and the price (usually free) before anything uploads.','<b>Deleted after</b>Files are removed from the server right after conversion.'],
  steps:['<b>Drop your spreadsheet</b> (.xls or .xlsx).','<b>Approve</b> the one-time upload.','<b>Download the PDF</b> — clean and shareable.'],
  faqs:[['Why does this tool use a server?','Faithfully rendering spreadsheets needs a full office engine — more than a browser can do. That’s why it’s a ★ premium tool with a daily free allowance.'],['How much does it cost?','The first 50 pages a day are free; past that about ₹0.10 a page, always shown upfront.'],['Is my data stored?','No — converted files are deleted from the server immediately after the job.']],
  related:['pdf-to-excel','word-to-pdf','powerpoint-to-pdf','compress-pdf'] },

'pdf-to-powerpoint': { name:'PDF to PowerPoint', free:true, cta:'tools.html#pdf2ppt', ctaText:'Turn a PDF into slides — free',
  benefits:['<b>One page = one slide</b>Every PDF page becomes a crisp, full-bleed slide.','<b>Runs in your browser</b>Free and private — the PDF is never uploaded.','<b>Correct slide size</b>The deck matches your page dimensions exactly.','<b>Instant</b>No queue — a 30-page deck builds in seconds.'],
  steps:['<b>Drop the PDF</b>.','<b>Convert</b> — each page renders into a slide.','<b>Open the .pptx</b> in PowerPoint, Keynote or Google Slides.'],
  faqs:[['Can I edit the text on the slides?','Slides are high-quality page images, so text isn’t individually editable — that honest trade-off is what makes free, private conversion possible.'],['Does it work with scanned PDFs?','Yes — every page renders exactly as it looks, scans included.'],['Is it free?','Yes, completely — it runs on your device with no limits.']],
  related:['powerpoint-to-pdf','pdf-to-jpg','pdf-to-word','compress-pdf'] },

'powerpoint-to-pdf': { name:'PowerPoint to PDF', free:false, cta:'tools.html#ppt2pdf', ctaText:'Convert PowerPoint to PDF',
  benefits:['<b>Faithful rendering</b>A full office engine converts your deck, keeping fonts and layout.','<b>.ppt and .pptx</b>Old and new formats supported.','<b>Upfront price</b>Consent screen first — most jobs fit in the daily free 50 pages.','<b>Nothing stored</b>Decks are deleted from the server after conversion.'],
  steps:['<b>Drop your deck</b> (.ppt/.pptx).','<b>Approve</b> the upload — price shown first.','<b>Share the PDF</b> anywhere.'],
  faqs:[['Why can’t this run in the browser?','Rendering slides faithfully needs the full presentation engine — so this is a ★ premium tool with 50 free pages daily.'],['Will animations be kept?','PDFs are static — each slide becomes a perfectly rendered page.'],['What does it cost?','Usually nothing: 50 pages free per day, then ~₹0.10 a page.']],
  related:['pdf-to-powerpoint','word-to-pdf','excel-to-pdf','compress-pdf'] },

'ocr-pdf': { name:'OCR PDF', free:true, cta:'tools.html#ocr', ctaText:'Make a PDF searchable — free',
  benefits:['<b>Selectable, searchable text</b>Invisible text is placed exactly over the scan — Ctrl+F just works.','<b>On-device recognition</b>The free OCR runs in your browser; scans never leave your device.','<b>Keeps the original look</b>Your pages stay pixel-identical — only the hidden text layer is added.','<b>★ HD OCR</b>A server engine (Tesseract via ocrmypdf) for tough scans and big batches.'],
  steps:['<b>Drop the scanned PDF</b>.','<b>Run OCR</b> — each page is recognised (a moment per page).','<b>Search, select, copy</b> — the scan behaves like a digital PDF.'],
  faqs:[['What is OCR?','Optical Character Recognition — software reads the picture of text in a scan and adds a real text layer, so you can search, select and copy it.'],['Is Lexora’s OCR private?','Yes — the free OCR runs entirely in your browser. The optional ★ HD OCR uploads once with consent and deletes the file after.'],['Which languages are supported?','English on-device today; the HD engine handles more. Layout, numbers and tables are preserved either way.']],
  related:['ocr-scanned-pdf','pdf-to-word','ocr-receipts','compress-pdf'] },

'sign-pdf': { name:'Sign PDF', free:true, cta:'tools.html#sign', ctaText:'Sign a PDF now — free',
  benefits:['<b>Draw, type or import</b>Sketch your signature, type it in a script font, or import a photo of it.','<b>Place it precisely</b>Drag the signature anywhere on any page and resize from the corner.','<b>Legally practical</b>Perfect for everyday agreements, forms and approvals.','<b>Private</b>Your contract and your signature never leave your device.'],
  steps:['<b>Open the PDF</b> and create your signature (draw/type/import).','<b>Drag it onto the page</b> — any page, any spot, any size.','<b>Save</b> — the signature is stamped permanently into the PDF.'],
  faqs:[['Is signing a PDF here secure?','Yes — everything happens in your browser. Neither the document nor your signature is uploaded anywhere.'],['Can I sign on multiple pages?','Yes — add as many signatures as you like across any pages before saving.'],['Can I use a photo of my real signature?','Yes — import an image (a PNG with transparent background looks best) and place it like any signature.']],
  related:['edit-pdf','forms-pdf','protect-pdf','watermark-pdf'] },

'edit-pdf': { name:'Edit PDF', free:true, cta:'tools.html#edit', ctaText:'Edit a PDF now — free',
  benefits:['<b>Add text anywhere</b>Drop a text box, type, pick colour and size.','<b>White-out mistakes</b>Cover anything with clean white rectangles.','<b>Direct manipulation</b>Drag to move, pull the corner to resize — on the real page.','<b>Private</b>Editing runs 100% in your browser.'],
  steps:['<b>Open your PDF</b> in the editor.','<b>Add text boxes or white-out</b> and position them.','<b>Save</b> — a clean edited copy downloads.'],
  faqs:[['Can I edit the existing text of a PDF?','You can cover it with white-out and type replacement text on top. True in-place text editing with reflow is coming as a premium feature.'],['Is this editor free?','Yes — free and unlimited, running on your device.'],['Can I remove sensitive info with white-out?','White-out hides it visually, but for true removal use the Redact tool — it permanently deletes the covered content.']],
  related:['sign-pdf','redact-pdf','crop-pdf','watermark-pdf'] },

'redact-pdf': { name:'Redact PDF', free:true, cta:'tools.html#redact', ctaText:'Redact a PDF now — free',
  benefits:['<b>Truly removed</b>Covered pages are rebuilt so the hidden text is gone from the file — not just painted over.','<b>Unlimited black boxes</b>Cover names, numbers, amounts — on any pages.','<b>Untouched pages stay perfect</b>Only covered pages are flattened; the rest keep selectable text.','<b>Private</b>The whole redaction runs on your device.'],
  steps:['<b>Open the PDF</b> and add black boxes over anything sensitive.','<b>Cover every occurrence</b> across pages.','<b>Save</b> — covered pages are rebuilt with the content permanently removed.'],
  faqs:[['Is the redacted text really gone?','Yes. Pages with boxes are re-rendered as images with the boxes baked in, so the underlying text no longer exists in the file — copy/paste cannot reveal it.'],['Why did my redacted page lose text selection?','That’s the security working: redacted pages become picture pages. Pages without boxes keep their selectable text.'],['Is this safer than a black highlighter in an editor?','Much safer — highlighter annotations can be deleted to reveal the text; Lexora’s redaction removes it.']],
  related:['edit-pdf','protect-pdf','sign-pdf','compare-pdf'] },

'crop-pdf': { name:'Crop PDF', free:true, cta:'tools.html#crop', ctaText:'Crop a PDF now — free',
  benefits:['<b>Visual crop box</b>Drag a rectangle over the live page — keep exactly what you want.','<b>One page or all</b>Apply the same crop to every page, or just the current one.','<b>Reversible-quality</b>Cropping sets the PDF’s crop box, so content isn’t destroyed.','<b>Private</b>Runs entirely in your browser.'],
  steps:['<b>Open the PDF</b> — the crop rectangle appears on the page.','<b>Move / resize / redraw</b> it over the area to keep.','<b>Crop</b> — choose all pages or just this one, and save.'],
  faqs:[['Does cropping delete the content outside the box?','No — it sets the page’s visible area (crop box). Viewers show only your selection, and the file stays light.'],['Can I crop every page the same way?','Yes — "All pages (same area)" applies your rectangle across the document, perfect for trimming scanner margins.'],['Is it free?','Yes — free, unlimited and on-device.']],
  related:['split-pdf','edit-pdf','compress-pdf','pdf-to-jpg'] },

'forms-pdf': { name:'Fill PDF Forms', free:true, cta:'tools.html#forms', ctaText:'Fill a PDF form now — free',
  benefits:['<b>Every field, one screen</b>Text boxes, checkboxes, dropdowns and lists — laid out simply.','<b>Pre-filled values shown</b>Existing answers load in, so you only change what’s needed.','<b>Optional lock</b>Flatten the form so answers can’t be changed afterwards.','<b>Private</b>Government or bank forms never leave your device.'],
  steps:['<b>Open the fillable PDF</b> — its fields are detected automatically.','<b>Type your answers</b> (leave the rest untouched).','<b>Save</b> — optionally locked so answers are final.'],
  faqs:[['My PDF has no fields — can I still fill it?','That PDF isn’t an interactive form. Use the Edit PDF tool to type text anywhere on the page instead.'],['What does "lock the form" do?','It flattens the fields into the page so the answers can’t be edited or tampered with later.'],['Is it safe for sensitive forms?','Yes — the form is processed entirely in your browser and never uploaded.']],
  related:['edit-pdf','sign-pdf','protect-pdf','pdf-to-word'] },

'compare-pdf': { name:'Compare PDF', free:true, cta:'tools.html#compare', ctaText:'Compare two PDFs — free',
  benefits:['<b>Side-by-side view</b>Version A and B rendered next to each other, page by page.','<b>Changes in orange</b>Every changed pixel is highlighted on version B automatically.','<b>Percent changed</b>Each page pair shows how much actually differs.','<b>Report included</b>Save a side-by-side comparison report as a PDF.'],
  steps:['<b>Add version A</b>, then add version B.','<b>Browse page by page</b> — differences glow orange.','<b>Save the report</b> for review or records.'],
  faqs:[['What kinds of changes does it catch?','Any visual change: edited text, moved paragraphs, changed numbers, added stamps — if pixels changed, it’s highlighted.'],['Can it compare contracts before signing?','Exactly the use case — see instantly what changed between the version you reviewed and the one you were sent.'],['Are my files uploaded?','No — both versions are rendered and compared entirely in your browser.']],
  related:['redact-pdf','merge-pdf','edit-pdf','repair-pdf'] },

'translate-pdf': { name:'Translate PDF', free:false, cta:'tools.html#translate', ctaText:'Translate a PDF',
  benefits:['<b>30+ languages</b>Hindi, Tamil, Telugu, Bengali and other Indian languages are first-class, powered by a state-of-the-art neural model.','<b>Auto-detects the source</b>Just choose the target language.','<b>Our own AI engine</b>Self-hosted translation — your text never goes to a third-party API.','<b>Clean output</b>You get a readable translated PDF.'],
  steps:['<b>Drop the PDF</b> and pick the target language.','<b>Approve the job</b> — price shown first (usually free within the daily 50 pages).','<b>Read the translation</b> — a clean PDF in your language.'],
  faqs:[['Which languages can it translate?','Over 30 in the picker — including 10 Indian languages — and the engine itself (Meta’s NLLB-200) understands 200.'],['Does it keep the original layout?','The current version produces a clean text-layout PDF of the translation; exact layout preservation is on the roadmap.'],['Is my document sent to Google or another API?','No — translation runs on our own self-hosted engine and the file is deleted after the job.']],
  related:['ocr-pdf','pdf-to-word','ai-document-summarizer','chat-with-pdf'] },

'repair-pdf': { name:'Repair PDF', free:true, cta:'tools.html#repair', ctaText:'Repair a PDF now — free',
  benefits:['<b>Rebuilds broken structure</b>The file is parsed leniently and rewritten with a clean skeleton.','<b>Fixes common corruption</b>Files that won’t open after a failed download or transfer often come back.','<b>Nothing to lose</b>Your original is untouched; you get a repaired copy.','<b>Private</b>Repair runs on your device.'],
  steps:['<b>Drop the broken PDF</b>.','<b>Repair</b> — the structure is rebuilt page by page.','<b>Open the repaired copy</b>.'],
  faqs:[['Can every broken PDF be fixed?','No tool can promise that — badly truncated files may be unrecoverable. But structural corruption (the most common kind) usually repairs well.'],['Will I lose content?','Whatever can be parsed is kept. The repair never modifies your original file.'],['Why did my PDF break in the first place?','Usually an interrupted download, a buggy generator app, or email/storage mangling the file.']],
  related:['compress-pdf','unlock-pdf','merge-pdf','ocr-pdf'] },

'unlock-pdf': { name:'Unlock PDF', free:true, cta:'tools.html#unlock', ctaText:'Unlock a PDF now — free',
  benefits:['<b>Removes print/copy locks</b>Owner restrictions drop instantly — text stays selectable.','<b>Password removal</b>Know the open password (bank statements)? Unlock a copy that never asks again.','<b>Password never leaves</b>Everything is decrypted locally in your browser.','<b>Free</b>No limits, no signup.'],
  steps:['<b>Drop the locked PDF</b>.','<b>Type the password</b> only if the file needs one to open — otherwise leave blank.','<b>Unlock</b> — save the unrestricted copy.'],
  faqs:[['Is it legal to unlock a PDF?','Unlocking your own documents (like your bank statements) for personal use is exactly what this is for. Don’t unlock files you have no rights to.'],['Why did my unlocked bank statement lose text selection?','Password-protected files are rebuilt from their pages for reliability, which makes text non-selectable. Print/copy-locked files keep selectable text.'],['Is my password sent anywhere?','Never — decryption happens entirely on your device.']],
  related:['protect-pdf','repair-pdf','compress-pdf','pdf-to-word'] },

'protect-pdf': { name:'Protect PDF', free:true, cta:'tools.html#protect', ctaText:'Password-protect a PDF — free',
  benefits:['<b>Real encryption</b>AES encryption — anyone opening the file must enter your password.','<b>Permission controls</b>Allow or block printing and copying.','<b>On-device</b>The password and the file never leave your browser.','<b>Free</b>Protect as many files as you like.'],
  steps:['<b>Drop the PDF</b>.','<b>Choose a password</b> (and printing/copying permissions).','<b>Protect</b> — the encrypted copy downloads.'],
  faqs:[['How strong is the protection?','The file is encrypted with the standard PDF AES scheme — without the password the content is unreadable.'],['What if I forget the password?','It cannot be recovered — that’s the point of encryption. Keep it somewhere safe.'],['Is the password uploaded?','No — encryption happens entirely on your device.']],
  related:['unlock-pdf','redact-pdf','sign-pdf','watermark-pdf'] },

'watermark-pdf': { name:'Watermark PDF', free:true, cta:'tools.html#watermark', ctaText:'Add a watermark — free',
  benefits:['<b>Any text</b>CONFIDENTIAL, DRAFT, your company name — stamped across every page.','<b>Your style</b>Size, transparency and diagonal angle are up to you.','<b>Every page at once</b>One click covers the whole document.','<b>Private</b>Runs in your browser.'],
  steps:['<b>Drop the PDF</b>.','<b>Type the watermark</b> and pick size, transparency, angle.','<b>Apply</b> — every page is stamped.'],
  faqs:[['Can the watermark be removed later?','It’s drawn into the page content, so casual removal isn’t possible; for legal-grade protection combine it with the Protect tool.'],['Can I watermark with my company name?','Yes — any text up to 40 characters (English letters and numbers).'],['Is it free?','Yes — unlimited files, no signup.']],
  related:['pagenum? no','protect-pdf','sign-pdf','merge-pdf'] },

'pdf-to-jpg': { name:'PDF to JPG', free:true, cta:'tools.html#pdf2jpg', ctaText:'Convert PDF to images — free',
  benefits:['<b>High-quality images</b>Every page rendered at 2× resolution for crisp results.','<b>One page or all</b>Single page → a JPG; many pages → a tidy ZIP.','<b>Great for sharing</b>Post a page to chat or social media without sending the whole PDF.','<b>Private</b>Rendering happens on your device.'],
  steps:['<b>Drop the PDF</b>.','<b>Convert</b> — every page renders to a JPG.','<b>Download</b> the image or the ZIP.'],
  faqs:[['What resolution are the images?','Pages render at twice their natural size — sharp enough for screens and most printing.'],['Can I convert just one page?','Convert the file and use the page image you need, or Split the PDF first for exactly one page.'],['Is it free?','Yes — free, unlimited, on-device.']],
  related:['jpg-to-pdf','pdf-to-powerpoint','split-pdf','compress-pdf'] },

'jpg-to-pdf': { name:'JPG to PDF', free:true, cta:'tools.html#jpg2pdf', ctaText:'Turn images into a PDF — free',
  benefits:['<b>Any images, one PDF</b>JPG, PNG and more — combined in the order you choose.','<b>Margins your way</b>None, small or big.','<b>Photos of documents</b>Pairs perfectly with the camera Scan tool.','<b>Private</b>Images never leave your device.'],
  steps:['<b>Pick your images</b> (as many as you like).','<b>Order them</b> and choose a margin.','<b>Convert</b> — one clean PDF.'],
  faqs:[['Can I mix JPG and PNG?','Yes — any browser-supported image formats can go into the same PDF.'],['Will my photos be compressed?','Images are lightly optimized for a sensible file size while staying sharp.'],['Can I scan paper straight to PDF?','Yes — use the Scan tool for camera capture with automatic edge detection, then export to PDF.']],
  related:['scan-to-pdf','pdf-to-jpg','merge-pdf','compress-pdf'] },

'edit-word': { name:'Edit Word', free:true, cta:'tools.html#editword', ctaText:'Edit a Word file — free',
  benefits:['<b>No Office needed</b>Open and edit .docx right in the browser.','<b>Familiar editing</b>Click into the page and type — headings, bold and lists are kept.','<b>Saves real .docx</b>The result opens in Word, Google Docs and LibreOffice.','<b>Private</b>The document never leaves your device.'],
  steps:['<b>Drop the .docx</b> — it opens as an editable page.','<b>Make your changes</b> like in any editor.','<b>Save</b> — a fresh .docx downloads.'],
  faqs:[['Do I need Microsoft Word?','No — editing happens in the browser, and the saved file opens in any word processor.'],['What formatting is kept?','Headings, bold text and list bullets. Pictures and complex layouts aren’t kept yet — this is an honest lightweight editor.'],['Is it free?','Yes — free and on-device.']],
  related:['pdf-to-word','word-to-pdf','edit-pdf','ai-document-summarizer'] },

'html-to-pdf': { name:'HTML to PDF', free:false, cta:'tools.html#html2pdf', ctaText:'Convert a webpage to PDF',
  benefits:['<b>A real browser render</b>The page is opened in an actual browser engine — not a crude converter.','<b>Just paste a URL</b>No file needed; we fetch and print the live page.','<b>Exactly as it looks</b>CSS, fonts and layout are preserved.','<b>Deleted after</b>Nothing about the job is kept.'],
  steps:['<b>Paste the webpage address</b>.','<b>Approve the job</b> — one page of your daily free 50.','<b>Download the PDF</b> — the page, printed perfectly.'],
  faqs:[['Why does this need a server?','Printing a live webpage requires a real browser engine (Chromium) — that runs on our server, with your consent.'],['Can it convert pages behind a login?','No — only pages the server can reach publicly.'],['What does it cost?','A URL counts as one page — effectively free within the daily 50-page allowance.']],
  related:['word-to-pdf','pdf-to-word','compress-pdf','merge-pdf'] },

'scan-to-pdf': { name:'Scan to PDF', free:true, cta:'scan.html', ctaText:'Scan with your camera — free',
  benefits:['<b>Camera = scanner</b>Point at the paper; edges are found automatically.','<b>Auto-straightened</b>Perspective warp makes the page flat and rectangular.','<b>Clean-up filters</b>Sharpen, brighten, black&amp;white — like a real scanner app.','<b>Private</b>Frames are processed on your device, never uploaded.'],
  steps:['<b>Open the scanner</b> and point your camera at the document.','<b>Capture</b> — edges detected, page straightened automatically.','<b>Export to PDF</b> (add more pages first if you like).'],
  faqs:[['Do I need to install an app?','No — it runs in your browser, on your phone or laptop camera.'],['Can I scan multiple pages into one PDF?','Yes — keep capturing pages, then export them together.'],['Can I make the scan searchable?','Yes — run the OCR PDF tool on your scan to add a searchable text layer.']],
  related:['ocr-pdf','jpg-to-pdf','ocr-scanned-pdf','compress-pdf'] },

/* ================= AI feature pages ================= */
'chat-with-pdf': { name:'Chat with PDF', free:true, cta:'login.html', ctaText:'Start free — chat with your PDF',
  benefits:['<b>Ask anything</b>"What does clause 4 mean?" "Summarize page 12." "Where does it mention refunds?"','<b>Understands on your device</b>Lexora reads the document locally and sends the AI only your question plus the few passages that matter.','<b>Reads aloud too</b>The same companion reads the document to you with karaoke highlighting.','<b>Voice included</b>Talk to it — "go to page three" just works.'],
  steps:['<b>Log in free</b> and open any PDF, Word file or scan.','<b>Ask in plain language</b> — typed or spoken.','<b>Get answers with page references</b>, read aloud if you like.'],
  faqs:[['Is chatting with a PDF free?','Yes — the Spark engine is free with a daily limit. Swift (₹49) and Sage (₹99) give sharper answers and bigger allowances.'],['Is my document uploaded to the AI?','No — the document stays on your device. Only your question and the most relevant passages are sent, nothing else.'],['How is this different from ChatGPT?','Lexora is built around your document: it highlights, navigates, reads aloud and answers from the actual pages — without you copy-pasting anything.']],
  related:['ai-pdf-assistant','ai-document-summarizer','explain-pdf-with-ai','read-pdf-aloud'] },

'summarize-pdf': { name:'Summarize PDF', free:true, cta:'login.html', ctaText:'Summarize a document — free',
  benefits:['<b>Whole-document summaries</b>The engine samples from the start, middle and end — not just page one.','<b>Per-page recaps</b>"Summarize page 7" gives you exactly that.','<b>Private retrieval</b>Summarization uses only excerpts chosen on your device.','<b>Listen instead</b>Have the summary read aloud while you do something else.'],
  steps:['<b>Open the document</b> after a free login.','<b>Ask "summarize this document"</b> (or a page, or a section).','<b>Read or listen</b> to the summary.'],
  faqs:[['Can it summarize long PDFs?','Yes — Lexora’s retrieval samples across the entire document so long reports and books get balanced summaries.'],['Are summaries accurate?','They’re grounded in the actual text passages retrieved from your document, and you can ask follow-ups to drill in.'],['Is it free?','Yes on the Spark engine, with a daily limit; paid engines give longer, sharper summaries.']],
  related:['chat-with-pdf','ai-document-summarizer','read-pdf-aloud','translate-pdf'] },

'read-pdf-aloud': { name:'Read PDF Aloud', free:true, cta:'login.html', ctaText:'Listen to a document — free',
  benefits:['<b>Karaoke highlighting</b>Follow along word by word as it reads.','<b>Natural voices</b>Use your device’s best voices, at your speed.','<b>Hands-free control</b>"Pause", "faster", "go to page five", "explain this" — by voice.','<b>Any document</b>PDFs, Word files, images (with OCR) and scans.'],
  steps:['<b>Open a document</b> (guest mode works too).','<b>Press play</b> — reading starts with live highlighting.','<b>Steer by voice</b> or with the playbar.'],
  faqs:[['Can it read scanned documents?','Yes — scans are OCR’d on your device first, then read aloud like any text.'],['Does it work on my phone?','Yes — it’s a browser app; nothing to install.'],['Is it free?','Reading aloud is completely free. The AI companion’s explanations use the free Spark engine with a daily limit.']],
  related:['chat-with-pdf','summarize-pdf','ocr-pdf','translate-pdf'] },

/* ================= programmatic intent pages ================= */
'ocr-scanned-pdf': { name:'OCR a Scanned PDF', free:true, cta:'tools.html#ocr', ctaText:'OCR your scan — free',
  benefits:['<b>Scan → searchable</b>Your scanned pages gain a real text layer — Ctrl+F, select, copy.','<b>Pixel-identical pages</b>The scan’s appearance is untouched; only invisible text is added.','<b>Private</b>Recognition runs in your browser — sensitive scans never leave.','<b>Then convert</b>OCR first, then PDF→Word for an editable document.'],
  steps:['<b>Drop the scanned PDF</b>.','<b>Run OCR</b> — every page is recognised on-device.','<b>Search and copy</b> like a born-digital PDF.'],
  faqs:[['My scanner produced an image-only PDF — will this fix it?','Exactly — OCR adds the missing text layer so search and copy work.'],['Does the scan quality matter?','Yes — 300 DPI, flat, well-lit scans recognise best. The camera Scan tool’s auto-straightening helps a lot.'],['Can I edit the text afterwards?','Run PDF to Word after OCR to get an editable document.']],
  related:['ocr-pdf','convert-scanned-pdf-to-word','scan-to-pdf','ocr-handwritten-notes'] },

'ocr-receipts': { name:'OCR Receipts', free:true, cta:'tools.html#img2text', ctaText:'Extract receipt text — free',
  benefits:['<b>Photo → text</b>Snap a receipt and pull out every line for expenses or records.','<b>Totals and dates</b>Amounts, GST lines and dates come out as copyable text.','<b>Batch friendly</b>Process several receipt photos in one go.','<b>Private</b>Financial slips never leave your device.'],
  steps:['<b>Photograph the receipt</b> (or use the Scan tool for auto-straightening).','<b>Run Image to Text</b> — the receipt is recognised on-device.','<b>Copy into your expense sheet</b>.'],
  faqs:[['Can it read faded thermal receipts?','Often yes — try the Scan tool’s black&amp;white filter first to boost contrast before OCR.'],['Does it output a spreadsheet?','It outputs clean text to paste anywhere; for ruled tables in PDF statements, PDF to Excel builds actual sheets.'],['Are my receipts uploaded?','No — recognition runs entirely in your browser.']],
  related:['ocr-invoices','ocr-bank-statements','scan-to-pdf','pdf-to-excel'] },

'ocr-invoices': { name:'OCR Invoices', free:true, cta:'tools.html#ocr', ctaText:'Make invoices searchable — free',
  benefits:['<b>Find any invoice fast</b>OCR your scanned invoices once — then search by vendor, number or amount.','<b>Copy line items</b>Pull amounts and GST numbers straight out of the scan.','<b>Tables → Excel</b>Pair with PDF to Excel to get invoice tables as spreadsheets.','<b>Private</b>Vendor data stays on your device.'],
  steps:['<b>Drop the scanned invoice PDF</b>.','<b>Run OCR</b> — text layer added on-device.','<b>Search, copy, or convert</b> to Word/Excel.'],
  faqs:[['Can I extract invoice tables into Excel?','Yes — after OCR, run PDF to Excel; ruled invoice tables extract especially well.'],['Will it recognise GST numbers and amounts?','Yes — numbers and codes recognise reliably on clean scans.'],['Is bulk processing possible?','Merge your invoice scans into one PDF first, then OCR the lot in one pass.']],
  related:['ocr-receipts','pdf-to-excel','ocr-bank-statements','merge-pdf'] },

'ocr-handwritten-notes': { name:'OCR Handwritten Notes', free:true, cta:'tools.html#img2text', ctaText:'Try it on your notes — free',
  benefits:['<b>Neat handwriting works</b>Clear, well-spaced handwriting recognises surprisingly well.','<b>Photos or scans</b>Snap your notebook page or scan it flat.','<b>Digitize once, search forever</b>Turn paper notes into searchable text files.','<b>Private</b>Your notes are recognised on your device.'],
  steps:['<b>Photograph the page</b> in good light (the Scan tool straightens it).','<b>Run Image to Text</b>.','<b>Fix the odd word</b> and save as text.'],
  faqs:[['How accurate is handwriting OCR?','Honest answer: it depends on the handwriting. Print-style, well-spaced writing works well; cursive is hit-and-miss. It’s free, so try a page.'],['Any tips for better results?','Good light, dark ink, flat page, and the Scan tool’s sharpen filter. Write-print rather than cursive when you can.'],['Is my notebook uploaded?','No — recognition happens in your browser.']],
  related:['ocr-scanned-pdf','scan-to-pdf','ocr-receipts','summarize-pdf'] },

'ocr-bank-statements': { name:'OCR Bank Statements', free:true, cta:'tools.html#ocr', ctaText:'Make a statement searchable — free',
  benefits:['<b>Search years of statements</b>OCR scanned statements once and find any transaction instantly.','<b>Unlock first if needed</b>Password-protected statements? The Unlock tool removes the password locally.','<b>Tables → Excel</b>Digital statements with ruled tables convert straight to .xlsx.','<b>Maximum privacy</b>Everything runs on your device — statements never touch a server.'],
  steps:['<b>Unlock the statement</b> if it needs a password (done locally).','<b>Run OCR</b> for scans, or go straight to PDF to Excel for digital statements.','<b>Search or analyse</b> your transactions.'],
  faqs:[['My statement asks for a password — what do I do?','Use the Unlock PDF tool with your password (it never leaves your device), then OCR or convert the unlocked copy.'],['Can I get my statement into Excel?','Yes — PDF to Excel extracts ruled transaction tables into a spreadsheet, 50 pages free daily.'],['Is this safe for bank data?','The OCR and unlock steps are 100% on-device. Only the optional Excel conversion uses our server — with consent, and files are deleted after.']],
  related:['unlock-pdf','pdf-to-excel','ocr-invoices','ocr-scanned-pdf'] },

'ocr-passport': { name:'OCR Passport', free:true, cta:'tools.html#img2text', ctaText:'Extract passport text — free',
  benefits:['<b>Type-free form filling</b>Extract names, numbers and dates from a passport photo to paste into forms.','<b>The privacy this needs</b>Identity documents are recognised 100% on your device — never uploaded.','<b>MRZ friendly</b>The machine-readable zone’s clean font recognises very reliably.','<b>Free</b>No signup, no limits.'],
  steps:['<b>Photograph the passport page</b> flat, in good light.','<b>Run Image to Text</b> on your device.','<b>Copy the fields</b> into whatever form needs them.'],
  faqs:[['Is it safe to OCR a passport online?','With Lexora, the image never goes online — recognition runs in your browser. That’s the only kind of tool you should use for identity documents.'],['What recognises best?','The two MRZ lines at the bottom — their font is designed for machines. Printed fields also do well on sharp photos.'],['Do you store anything?','Nothing — there is no upload, no server, no log.']],
  related:['ocr-aadhaar-card','ocr-pan-card','ocr-driving-licence','scan-to-pdf'] },

'ocr-aadhaar-card': { name:'OCR Aadhaar Card', free:true, cta:'tools.html#img2text', ctaText:'Extract Aadhaar text — free',
  benefits:['<b>Copy, don’t retype</b>Name, Aadhaar number and address come out as text you can paste.','<b>On-device only</b>Aadhaar data is sensitive — recognition never leaves your browser.','<b>Both sides</b>OCR the front and the address side in one batch.','<b>Free</b>No account needed.'],
  steps:['<b>Photograph the card</b> (or scan it with the Scan tool).','<b>Run Image to Text</b> locally.','<b>Paste the details</b> where you need them.'],
  faqs:[['Is OCR-ing an Aadhaar card safe here?','Yes — unlike upload-based tools, Lexora recognises the image entirely on your device. Nothing is transmitted or stored.'],['Can it read the Hindi text?','On-device OCR is English-first today; the English fields (name, number, DOB) extract reliably.'],['Should I redact the number before sharing scans?','Yes — use the Redact tool to permanently remove the number from copies you share.']],
  related:['ocr-pan-card','ocr-passport','redact-pdf','scan-to-pdf'] },

'ocr-pan-card': { name:'OCR PAN Card', free:true, cta:'tools.html#img2text', ctaText:'Extract PAN text — free',
  benefits:['<b>PAN, name, DOB → text</b>Extract the printed fields from a photo in seconds.','<b>Private by architecture</b>Recognition runs in your browser — the card image is never uploaded.','<b>KYC paperwork, faster</b>Stop retyping the same details into every form.','<b>Free</b>Unlimited use.'],
  steps:['<b>Photograph the PAN card</b> sharply, straight-on.','<b>Run Image to Text</b>.','<b>Copy the fields</b> into your form.'],
  faqs:[['Is this safe for a PAN card?','Yes — the image is processed on your device only. Never use upload-based OCR for identity cards.'],['The card is laminated and glary — tips?','Angle away from light to kill reflections, or use the Scan tool’s filters to clean it up first.'],['Can I redact the PAN before sharing a copy?','Yes — the Redact tool removes it permanently from the copy.']],
  related:['ocr-aadhaar-card','ocr-passport','redact-pdf','ocr-driving-licence'] },

'ocr-driving-licence': { name:'OCR Driving Licence', free:true, cta:'tools.html#img2text', ctaText:'Extract licence text — free',
  benefits:['<b>Licence number & validity</b>Extract DL number, name and dates from a photo.','<b>On your device</b>Like all Lexora OCR, the image never leaves your browser.','<b>Insurance & rentals</b>Fill applications without retyping.','<b>Free</b>No signup.'],
  steps:['<b>Photograph the licence</b> front side, flat and sharp.','<b>Run Image to Text</b>.','<b>Paste the details</b> wherever needed.'],
  faqs:[['Is it safe to OCR a driving licence?','Here, yes — recognition is 100% on-device with no upload. That’s the standard you should demand for ID documents.'],['State-specific card layouts?','OCR reads whatever printed text is on the card, regardless of layout — you copy the fields you need.'],['Can I turn the photo into a clean PDF too?','Yes — the Scan tool straightens it and JPG to PDF makes a tidy document.']],
  related:['ocr-passport','ocr-aadhaar-card','scan-to-pdf','jpg-to-pdf'] },

'convert-scanned-pdf-to-word': { name:'Convert Scanned PDF to Word', free:true, cta:'tools.html#pdf2word', ctaText:'Convert your scan — free',
  benefits:['<b>Scan → editable text</b>OCR built into the converter: scanned PDFs come out as editable .docx.','<b>No retyping</b>A 20-page scanned contract becomes a Word file in minutes.','<b>Private</b>The free path recognises and converts entirely on your device.','<b>★ HD for tough scans</b>The server engine handles poor scans and complex layouts better.'],
  steps:['<b>Drop the scanned PDF</b> into PDF to Word.','<b>Convert</b> — OCR kicks in automatically for scans.','<b>Edit the .docx</b> in Word or Google Docs.'],
  faqs:[['How is this different from normal PDF to Word?','Scanned PDFs are pictures of text — they need OCR first. Lexora detects this automatically and recognises the text before building the Word file.'],['Will the layout be preserved?','You get clean, editable paragraphs. For layout-faithful reconstruction of complex scans, use the ★ HD engine.'],['What scan quality do I need?','300 DPI and straight pages work best — the Scan tool’s auto-straightening helps if you’re capturing by camera.']],
  related:['ocr-scanned-pdf','pdf-to-word','scan-to-pdf','edit-word'] },

'compress-pdf-without-losing-quality': { name:'Compress PDF Without Losing Quality', free:true, cta:'tools.html#compress', ctaText:'Compress losslessly — free',
  benefits:['<b>Light mode = visually lossless</b>Images are gently re-optimized; text is never touched.','<b>Text is always perfect</b>Lexora never rasterizes pages — text stays vector-sharp at any zoom.','<b>Never bigger, ever</b>If the file can’t shrink, you keep the original — a hard guarantee.','<b>Compare levels freely</b>It’s free — try Light and Balanced and keep the one you like.'],
  steps:['<b>Drop the PDF</b>.','<b>Choose "Light — best quality"</b>.','<b>Compress</b> — the report shows exactly what you saved.'],
  faqs:[['Can a PDF really be compressed without quality loss?','Largely yes: most PDF weight is unoptimized images. Re-encoding them smartly saves a lot while looking identical; text and vector content are untouched by design.'],['Which level should I pick?','Light for prints and portfolios, Balanced for everyday sharing, Strong for email limits. The ★ HD engine adds Maximum and Web presets.'],['Why do other tools blur my text?','They rasterize pages. Lexora never does — text stays real text.']],
  related:['compress-pdf','repair-pdf','merge-pdf','pdf-to-jpg'] },

'ai-pdf-assistant': { name:'AI PDF Assistant', free:true, cta:'login.html', ctaText:'Meet your assistant — free',
  benefits:['<b>An assistant, not a chatbot</b>It reads aloud, navigates ("go to page 12"), explains selections, finds topics and summarizes — inside the document.','<b>Understands what you’re asking</b>Find, compare, define, timeline — the engine routes each intent differently for better answers.','<b>Private engine</b>Document understanding happens on your device; only the question and relevant passages reach the AI.','<b>Grows with you</b>Free Spark engine to start; Swift and Sage when you want more power.'],
  steps:['<b>Log in free</b> and open any document.','<b>Talk to it</b> — typed or by voice.','<b>Let it work</b>: explain, summarize, find, compare, navigate, read aloud.'],
  faqs:[['What can the assistant actually do?','Read the document aloud with highlighting, jump to pages or topics by voice, explain any selection, summarize pages or the whole file, find mentions, compare sections, and answer free-form questions grounded in the text.'],['Which AI models power it?','Lexora’s engines are called Spark (free), Swift and Sage — each tuned for a price/quality point. You never need to think about the models underneath.'],['Is my document shared with the AI provider?','No — the document stays on your device. Only your question plus a few relevant excerpts are sent per answer.']],
  related:['chat-with-pdf','ai-document-summarizer','explain-pdf-with-ai','read-pdf-aloud'] },

'ai-document-summarizer': { name:'AI Document Summarizer', free:true, cta:'login.html', ctaText:'Summarize anything — free',
  benefits:['<b>Reports, papers, contracts</b>Get the gist of long documents in seconds.','<b>Balanced coverage</b>The engine samples the whole document — start, middle and end — so nothing major is missed.','<b>Drill down</b>Follow up with "expand on section 3" or "summarize page 9".','<b>Private</b>Only selected excerpts leave your device, never the file.'],
  steps:['<b>Open the document</b> after a free login.','<b>Ask for a summary</b> — whole document, a section or a page.','<b>Follow up</b> to go deeper where it matters.'],
  faqs:[['How long a document can it summarize?','Hundreds of pages — retrieval samples representative passages across the entire file rather than truncating at page one.'],['Can it summarize scanned documents?','Yes — OCR the scan first (built into the reader), then summarize.'],['Is it accurate?','Summaries are grounded in actual passages from your document, and you can always ask where something came from.']],
  related:['summarize-pdf','chat-with-pdf','ai-pdf-assistant','translate-pdf'] },

'explain-pdf-with-ai': { name:'Explain PDF with AI', free:true, cta:'login.html', ctaText:'Get things explained — free',
  benefits:['<b>Select → explain</b>Highlight any sentence and the companion explains it in plain language.','<b>Jargon-buster</b>Legal clauses, medical terms, academic prose — decoded simply.','<b>In your context</b>Explanations use the surrounding document, not generic definitions.','<b>Read + explained</b>Have the answer read aloud while you follow the page.'],
  steps:['<b>Open the document</b> (free login).','<b>Select the confusing part</b> and tap Explain.','<b>Ask follow-ups</b> until it clicks.'],
  faqs:[['What kinds of documents can it explain?','Anything text-based: contracts, research papers, bank T&Cs, textbooks, government forms, medical reports.'],['Does it explain in simple language?','Yes — that’s the default. You can also ask for more depth, examples or analogies.'],['Does the whole PDF get sent to the AI?','No — just your selection and a little surrounding context. The document itself stays on your device.']],
  related:['chat-with-pdf','ai-pdf-assistant','summarize-pdf','read-pdf-aloud'] }
};

/* fix: watermark related had a placeholder entry */
LX_SEO['watermark-pdf'].related = ['protect-pdf','sign-pdf','merge-pdf','edit-pdf'];
