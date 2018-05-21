export default class {
  constructor(initialHomeNonce, initialForeignNonce) {
    this.homeNonce = Number(initialHomeNonce);
    this.foreignNonce = Number(initialForeignNonce);
    this.homeNonces = [];
    this.foreignNonces = [];
  }

  getAndIncrementHome() {
    if (this.homeNonces.length > 0) return this.homeNonces.sort().shift();
    const n = this.homeNonce;
    this.homeNonce += 1;
    return n;
  }

  failedHome(nonce) {
    this.homeNonces.push(nonce);
  }

  getAndIncrementForeign() {
    if (this.foreignNonces.length > 0) return this.foreignNonces.sort().shift();
    const n = this.foreignNonce;
    this.foreignNonce += 1;
    return n;
  }

  failedForeign(nonce) {
    this.foreignNonces.push(nonce);
  }
}