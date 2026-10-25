'use strict';

const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const config = require('../config/env');

/**
 * Image uploads for profile pictures and banners.
 *
 * Two things this deliberately does NOT do:
 *
 *  - It does not silently skip a file it cannot accept. `cb(null, false)` makes
 *    multer drop the file, which the route cannot distinguish from "no file
 *    chosen" — so the upload reports success and nothing changes. It rejects
 *    with a reason instead.
 *  - It does not allow HEIC. iPhones shoot HEIC by default, but Chrome and
 *    Firefox cannot display it, so accepting it would store an image most
 *    visitors cannot see. The error says so plainly and says what to do.
 */

// Formats every current browser can display.
const ALLOWED_IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp']);

// Extensions people actually hit, so the message can be specific.
const KNOWN_BUT_UNSUPPORTED = {
  heic: 'iPhone photos are usually HEIC. In iOS Settings → Camera → Formats, choose "Most Compatible", or share the photo as a JPEG.',
  heif: 'HEIF images are not supported by all browsers. Convert it to JPG first.',
  tiff: 'TIFF images cannot be shown in most browsers. Convert it to JPG or PNG.',
  svg: 'SVG is not accepted for uploads, because it can carry scripts.',
};

const MAX_BYTES = 12 * 1024 * 1024; // phone photos are often 5-8MB
const MAX_MB = Math.round(MAX_BYTES / (1024 * 1024));

function extensionOf(filename) {
  const idx = String(filename || '').lastIndexOf('.');
  return idx === -1 ? '' : String(filename).slice(idx + 1).toLowerCase();
}

function allowedFile(filename) {
  return ALLOWED_IMAGE_EXTENSIONS.has(extensionOf(filename));
}

function unsupportedMessage(filename) {
  const ext = extensionOf(filename) || 'that';
  const extra = KNOWN_BUT_UNSUPPORTED[ext];
  const list = 'JPG, PNG, WebP, GIF, AVIF or BMP';
  return extra
    ? `We cannot use ${ext.toUpperCase()} files. ${extra}`
    : `We cannot use .${ext} files. Please use ${list}.`;
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, path.join(config.publicDir, 'uploads'));
  },
  filename(req, file, cb) {
    const ext = extensionOf(file.originalname) || 'jpg';
    const prefix = file.fieldname === 'bg_image' ? 'bg' : 'profile';
    const userId = req.user ? req.user.id : 'anon';
    cb(null, `${prefix}_${userId}_${crypto.randomBytes(8).toString('hex')}.${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_BYTES, files: 2 },
  fileFilter(req, file, cb) {
    if (allowedFile(file.originalname)) return cb(null, true);
    const err = new Error(unsupportedMessage(file.originalname));
    err.code = 'UNSUPPORTED_FILE_TYPE';
    err.status = 415;
    return cb(err);
  },
});

/**
 * Turns multer's errors into plain JSON the page can show, instead of a 500
 * with a stack trace. Mount after the routes that accept uploads.
 */
function uploadErrorHandler(err, req, res, next) {
  if (!err) return next();

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      error: `That image is larger than ${MAX_MB} MB. Please pick a smaller one.`,
    });
  }
  if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({ error: 'Please upload one picture at a time.' });
  }
  if (err.code === 'UNSUPPORTED_FILE_TYPE' || err.status === 415) {
    return res.status(415).json({ error: err.message });
  }
  return next(err);
}

module.exports = {
  upload,
  uploadErrorHandler,
  allowedFile,
  unsupportedMessage,
  extensionOf,
  ALLOWED_IMAGE_EXTENSIONS,
  MAX_BYTES,
};
