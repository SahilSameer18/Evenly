export class LedgerError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "LedgerError";
    this.code = code;
  }
}
