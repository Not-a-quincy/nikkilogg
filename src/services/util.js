'use strict';

/** Wrap an async route handler so rejected promises reach the error handler. */
function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
