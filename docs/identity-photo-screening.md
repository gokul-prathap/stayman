# Identity photo screening

Each selected photo opens a four-corner crop editor. It looks for a bright document
region on a contrasting background and estimates its corners, or starts with an
adjustable inset frame when corners are unclear. Guests can drag each corner,
use arrow keys to adjust it, run Find corners again, or choose Whole ID for an
already tightly cropped image. The four points drive a perspective transform that
crops and straightens the photo before compression. The detector is a lightweight
contrast heuristic, not a universal document scanner; low contrast and clutter
can still require manual corner placement.

The guest crop editor offers 90-degree left/right rotation before detection and
cropping. Rotations are always generated from the original photo; the intermediate
rotation is lossless PNG, and the final crop is compressed to JPEG for upload.
Staff ID viewers have separate left/right controls which rotate the view without
rewriting the private stored photo.

Compression targets 450 KiB per photo and enforces the existing 1 MiB upload cap.
It tries JPEG quality settings 0.76, 0.66 and 0.56 at a maximum edge of 1500 pixels,
then 1250 and 1000 if needed. It stops at the first result meeting the target and
does not upscale small images. This prioritizes legibility over the smallest
possible file. Actual bytes vary with image detail; 450 KiB is a target, not a
guaranteed maximum. The preview displays the final uploaded image's size.

After cropping and compression, Tesseract.js reads English text locally in a Web
Worker. The photo is accepted only if readable text contains document indicators
and relevant fields. Passport and visa slots have separate checks; domestic ID
fronts recognize common Aadhaar, driving licence, voter ID, passport and national
identity document cues. Address-only backs have a narrower fallback for Indian PIN codes.
Non-English documents, unfamiliar formats, OCR errors and network failures offer
an explicit **Use this photo · Reception review required** action. It previews the
cropped image and lets the guest submit rather than treating OCR failure as a
definitive invalid-ID decision. Changing the crop clears that decision and requires
checking the new crop again.

The OCR engine and language assets download on first use from Tesseract's default
CDNs; image bytes and extracted text are processed on the device, not sent to an
OCR provider. Extracted text is not persisted or logged by the application.
Only cropped photos that pass the check or are explicitly selected for reception
review enter the form. The submission service checks both before writing either
upload. It stores per-side `document_screening` indicators (`document-like` or
`manual-review`) in the existing guest details JSON; no database migration is
needed. OCR results and guest requests for review are cached by Blob identity for
the life of the form. Staff see a review notice alongside the ID photos, and the
dashboard routes flagged booked guests through Review ID rather than direct check-in.
These are client-reported quality indicators, never proof of server verification.

This is a browser-side upload quality and document-likeness filter. It does not
authenticate documents, detect forgeries, compare names or faces, or verify a
government record. A modified client can bypass browser checks; existing database
policies still enforce invitation ownership and file upload restrictions. Trusted
server-side screening would require a separately deployed endpoint that evaluates
private uploads and gates completion; this change does not implement that service.
Staff must verify the original ID before admitting the guest.

Run `node --test tests/identity-screening.test.mjs tests/identity-image.test.mjs`.
The screening tests use synthetic OCR text and synthetic pixel regions. The optional
`node tests/identity-ocr-smoke.mjs` integration check generates synthetic images
with Python/Pillow and runs the actual OCR engine. It checks that a document-like
sample passes and a receipt fails; it downloads the English model on first run.
Real-world OCR accuracy, camera rotation, glare, browser asset downloads and mobile
performance still need validation with representative sample documents before deployment.
# Accepted ID types and optional driving-licence back

Apply `supabase/migrations/202610210022_identity_document_policy.sql` after migration 021. This updates the existing protected completion function while preserving invitation ownership, expiry, booking-date and guest-detail checks.

Web check-in now offers Aadhaar, driving licence, voter ID and passport. A driving licence requires the front photo; its back photo is optional. Other domestic IDs retain both-side uploads. Foreign guests still require passport and visa. Changing the selected ID type clears the current photos so documents from different types are not mixed.

PAN is not accepted as an ID choice. Declared PAN types are rejected by server validation. Recognisable PAN text is blocked by on-device screening and cannot use the manual-review fallback. OCR remains a screening aid, so reception must inspect original documents when a photo is unreadable or uncertain.

Only required or explicitly supplied sides are uploaded, and completion records the canonical `document_type` and `document_sides`. Staff views show the submitted sides rather than an empty back-image slot for a front-only licence. Existing submissions are not deleted or rewritten.
