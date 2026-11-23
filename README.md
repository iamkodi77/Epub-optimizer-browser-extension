# E-ink EPUB Optimizer browser extension

A local JavaScript browser extension inspired by [Xteink & Kindle EPUB Converter](https://github.com/iamkodi77/Xteink-and-kindle-epub-converter). Browser extensions cannot run Java directly, so this version uses JavaScript and runs entirely in the browser; no Python server or upload is required.

## Install

1. Download or clone this repository (including `vendor/jszip.min.js`).
2. Open `chrome://extensions` in Chrome, or `edge://extensions` in Edge.
3. Enable **Developer mode**, select **Load unpacked**, and choose this repository folder.
4. Click the extension's toolbar icon to open the optimizer in a tab.

## Use

Choose an EPUB (up to 100 MB), optionally edit its existing title and author, choose a device and options, then click **Optimize EPUB** and download the result. The original file is never overwritten. Files are processed locally and no network permissions are requested.

Device profiles match the original app: Xteink X4/X4 Pro (480×800, 4 grays), X3 (528×792, 4 grays), and Kindle 10th gen (600×800, 16 grays). Stock X3 firmware may not display EPUB images; the image profile targets compatible alternative firmware.

## Scope and limitations

This is a browser-native subset, not a complete port of the original 20-step pipeline. It resizes, contrast-boosts and dithers JPEG and PNG images (retaining their formats), cleans basic whitespace and ligatures in well-formed XHTML, edits existing title/author metadata, removes OS artifacts and repackages EPUBs. The font option removes simple `@font-face` rules from external CSS but deliberately retains font files and manifest entries to avoid breaking references; complex CSS and inline rules are not handled. Other image formats are left unchanged. Unsupported or malformed resources are skipped and reported. Encryption/obfuscated fonts are rejected rather than attempting DRM removal. Covers, advanced text repair, unused CSS removal, light novel mode and the other original pipeline features are not implemented. Keep a backup and check output on your reader; optimization can sometimes increase file size.

The extension bundles [JSZip 3.10.1](https://github.com/Stuk/jszip) under its MIT license (see `vendor/JSZIP-LICENSE.md`).
