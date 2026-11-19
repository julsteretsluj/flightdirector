'use strict';

class UserError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UserError';
  }
}

function isUserError(error) {
  return error?.name === 'UserError';
}

module.exports = { UserError, isUserError };
