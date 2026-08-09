/* shared auth helpers — inject AUTH_API via https://flipcards-auth.cab-pechard.workers.dev */
const AUTH_API_DEFAULT = "https://flipcards-auth.cab-pechard.workers.dev";

function resolveAuthBase(raw) {
  const base = String(raw || "").trim().replace(/\/$/, "");
  if (!base || base === "https://flipcards-auth.cab-pechard.workers.dev" || /EXAMPLE/i.test(base)) {
    return AUTH_API_DEFAULT;
  }
  return base;
}

window.FLIPCARDS_AUTH = {
  baseUrl: resolveAuthBase("https://flipcards-auth.cab-pechard.workers.dev"),
  tokenKey: "flipcards_token",
  getToken() {
    return sessionStorage.getItem(this.tokenKey) || localStorage.getItem(this.tokenKey) || "";
  },
  setToken(token, remember) {
    sessionStorage.setItem(this.tokenKey, token);
    sessionStorage.setItem("flipcards_ok", "1");
    if (remember) localStorage.setItem(this.tokenKey, token);
    else localStorage.removeItem(this.tokenKey);
  },
  clearToken() {
    sessionStorage.removeItem(this.tokenKey);
    sessionStorage.removeItem("flipcards_ok");
    localStorage.removeItem(this.tokenKey);
  },
  async logout() {
    try {
      await this.api("/api/logout", { method: "POST" });
    } catch (_) {}
    this.clearToken();
  },
  async api(path, opts = {}) {
    const headers = Object.assign({ "Content-Type": "application/json" }, opts.headers || {});
    const token = this.getToken();
    if (token && !headers.Authorization) headers.Authorization = "Bearer " + token;
    const base = resolveAuthBase(this.baseUrl);
    const res = await fetch(base + path, {
      method: opts.method || "GET",
      headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    let data = {};
    try {
      data = await res.json();
    } catch (_) {}
    if (!res.ok) {
      const err = new Error(data.error || "Erreur " + res.status);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  },
  async requireSession() {
    const token = this.getToken();
    if (!token) return null;
    try {
      return await this.api("/api/me");
    } catch (_) {
      this.clearToken();
      return null;
    }
  },
};
