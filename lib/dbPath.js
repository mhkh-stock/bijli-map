// Bijli Map — writable data-directory resolution.
// Same pattern as FoodScope (~/workspace/foodscope/server.js): on a normal
// PC the app directory is writable, so the database lives in
// <app>/data/bijli.sqlite exactly as before. Only when the app directory
// cannot be written (e.g. SnapDeploy's /app, which denies creating files
// under it) does the database fall back to a writable temp directory.
// DB_FILE env always wins when set (tests and deploys with persistent
// storage use it). No API, schema or seed changes.
'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const FALLBACK_DIR_NAME = 'bijli-map';

function writableBase(appDir) {
  try { fs.accessSync(appDir, fs.constants.W_OK); return appDir; }
  catch { return path.join(os.tmpdir(), FALLBACK_DIR_NAME); }
}

function resolveDbFile(appDir, envDbFile) {
  if (envDbFile) return envDbFile;
  return path.join(writableBase(appDir), 'data', 'bijli.sqlite');
}

module.exports = { writableBase, resolveDbFile, FALLBACK_DIR_NAME };
