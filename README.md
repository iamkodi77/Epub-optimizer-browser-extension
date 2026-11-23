# E-ink EPUB Optimizer browser extension

A local JavaScript browser extension inspired by [Xteink & Kindle EPUB Converter](https://github.com/iamkodi77/Xteink-and-kindle-epub-converter). Browser extensions cannot run Java directly, so this version uses JavaScript and runs entirely in the browser; no Python server or upload is required.

## Install

1. Download or clone this repository (including `vendor/jszip.min.js`).
2. Open `chrome://extensions` in Chrome, or `edge://extensions` in Edge.
3. Enable **Developer mode**, select **Load unpacked**, and choose this repository folder.
4. Click the extension's toolbar icon to open the optimizer in a tab.

## Use

Choose an EPUB (up to 100 MB), optionally edit its existing title and author or choose a cover image, choose a device and options, then click **Optimize EPUB** and download the result. The original file is never overwritten. Files are processed locally and no network permissions are requested.

Device profiles match the original app: Xteink X4/X4 Pro (480×800, 4 grays), X3 (528×792, 4 grays), and Kindle 10th gen (600×800, 16 grays). Stock X3 firmware may not display EPUB images; the image profile targets compatible alternative firmware.

### Cover images

After selecting a book, choose **Choose image** under Cover image to preview a JPG, PNG, WebP, GIF or BMP (up to 20 MB). Select **Use original** to undo your choice. The replacement is resized for the chosen device; if image optimization is enabled it is also converted to dithered grayscale. It is applied when you optimize and download the book. Books with a standard EPUB 2 cover metadata entry or EPUB 3 `cover-image` item have their JPEG/PNG cover replaced in place, preserving existing references. If no standard cover is identified, a new cover image and first page are added. Nonstandard existing cover pages may therefore remain in the book. Books with conflicting, missing, or non-JPEG/PNG declared cover resources are rejected rather than risking broken references. The image must be decodable by the browser.

### Presets and advanced options

Choose **Quick**, **Full**, or adjust individual settings under **Advanced options**. Quick uses image optimization and basic text cleanup; Full also enables punctuation normalization, store metadata cleanup, simple external font-face removal and missing-cover generation. These are the browser extension's presets, not an exact reproduction of the original Python presets. Changing an individual checkbox selects Custom.

Grayscale, contrast boost, and device-level dithering can be adjusted independently (dithering requires grayscale). These image settings apply only when **Optimize images** is enabled; cover replacements are still resized if it is off. Text cleanup must be enabled for punctuation normalization to run. The generated cover is a simple title-and-author image and is added only if no standard cover is declared; an uploaded cover takes priority. Select an output filename preset or use a template with `{title}`, `{author}`, `{year}`, `{series}`, `{series_index}`, `{language}`, and `{original}`. Metadata fields for filenames are read before metadata cleanup.

## Development tests

Run `npm ci` and `npm test`. The automated tests use a simulated DOM and image APIs; they do not replace testing with real browser image codecs and e-readers.

## Scope and limitations

This is a browser-native subset, not a complete port of the original 20-step pipeline. It resizes, contrast-boosts and dithers JPEG and PNG images (retaining their formats), cleans basic whitespace and ligatures in well-formed XHTML, edits existing title/author metadata, removes OS artifacts and repackages EPUBs. The font option removes simple `@font-face` rules from external CSS but deliberately retains font files and manifest entries to avoid breaking references; complex CSS and inline rules are not handled. Other image formats are left unchanged. Unsupported or malformed resources are skipped and reported. The extension does not yet support batch processing, light novel rotation/splitting, automatic unused CSS removal, full embedded font file removal, HTML/TOC repair, baseline JPEG conversion for all formats, or the original converter’s complete text and structure pipeline. Encryption/obfuscated fonts are rejected rather than attempting DRM removal. Advanced text repair, unused CSS removal, light novel mode and the other original pipeline features are not implemented. Keep a backup and check output on your reader; optimization can sometimes increase file size.

The extension bundles [JSZip 3.10.1](https://github.com/Stuk/jszip) under its MIT license (see `vendor/JSZIP-LICENSE.md`).
