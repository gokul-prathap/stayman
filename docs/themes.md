# Global light and dark themes

Use the sun/moon control in the staff top navigation. Pages outside the staff layout (administrator, login, password setup, guest check-in and invoice preview) have the same control in the top-right corner.

The first visit follows the browser's system preference. Choosing Light or Dark saves `stayman.theme` in local browser storage. That choice is shared across routes, properties and tabs on the same app origin. It is a personal device preference, not a property-wide setting. Storage failures do not prevent switching for the current page. An early `public/theme-init.js` script applies the saved preference before rendering to avoid a light flash.

Component backgrounds, text, borders, status indicators, tables, forms, dialogs, navigation, chart colours and Tailwind colour utilities use shared role-based tokens. Blue primary buttons and filled booking-status colours retain contrast. Logos, guest ID images, QR-code pixels and the decorative night illustration retain their source colours. Invoice preview follows the selected screen theme; print/save-as-PDF resets to a white page and light colour tokens regardless of screen theme.

## Maintaining styles

- `src/theme/ThemeProvider.jsx` owns the preference and toggle.
- `src/theme/theme.css` defines shared surfaces, native controls, navigation adjustments and print rules.
- `src/theme/palette.css` and `src/theme/utilities.css` are generated colour mappings; do not hand-edit them.
- When introducing new fixed colours or Tailwind colour classes, run `npm run theme:prepare` and review the resulting files. The script preserves original component colours as variable fallbacks and derives separate text, surface, border and shadow tokens. It intentionally skips illustration and print styles.
- Check both themes for readability when adding new visual elements, particularly transparent overlays, chart fills, disabled controls and status badges.

No database migration or Supabase setting is required. Rebuild/redeploy the frontend to publish the feature. `npm run theme:prepare` is a maintenance step, not a command end users need to run.

## Validation

`node --test tests/theme.test.mjs` checks preference selection, unavailable storage, native colour scheme, early bootstrap and generated palette coverage. `node tests/theme-browser.mjs` uses isolated headless Chrome and the production build to check persistence, public-route rendering, a representative component gallery and white print output. It blocks Supabase network calls and uses no account or live data. Set `THEME_QA_BROWSER` if Chrome is installed at a different path. Screenshots are written under the system temporary directory.
