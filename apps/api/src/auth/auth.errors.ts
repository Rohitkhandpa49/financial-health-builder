export class DuplicateEmailError extends Error {
  constructor() {
    super("Email uniqueness conflict.");
    this.name = "DuplicateEmailError";
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("Invalid credentials.");
    this.name = "InvalidCredentialsError";
  }
}

export class InvalidAccessTokenError extends Error {
  constructor() {
    super("Invalid access token.");
    this.name = "InvalidAccessTokenError";
  }
}

export class ExpiredAccessTokenError extends Error {
  constructor() {
    super("Expired access token.");
    this.name = "ExpiredAccessTokenError";
  }
}