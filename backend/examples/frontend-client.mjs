/** Import in the Next.js client. Firebase Auth is supplied by the Frontend. */
export function createBackendClient(baseUrl, auth) {
  const base = baseUrl.replace(/\/$/, "");
  async function request(path, { method = "GET", json, blob } = {}) {
    if (!auth.currentUser) throw new Error("ログインしてください");
    const token = await auth.currentUser.getIdToken();
    const headers = { Authorization: `Bearer ${token}` };
    if (json !== undefined) headers["Content-Type"] = "application/json";
    const response = await fetch(`${base}${path}`, {
      method, headers, body: blob ?? (json !== undefined ? JSON.stringify(json) : undefined),
    });
    if (!response.ok) {
      const error = new Error(`Backend request failed (${response.status})`);
      error.status = response.status;
      error.detail = await response.json().catch(() => null);
      throw error;
    }
    return response;
  }
  const jsonRequest = async (path, options) => (await request(path, options)).json();
  return {
    houses: () => jsonRequest("/api/houses"),
    createHouse: (name, displayName) => jsonRequest("/api/houses", {
      method: "POST", json: { name, display_name: displayName },
    }),
    invite: (houseId) => jsonRequest(`/api/houses/${houseId}/invites`, { method: "POST" }),
    join: (token, displayName) => jsonRequest("/api/join", {
      method: "POST", json: { token, display_name: displayName },
    }),
    dashboard: (houseId) => jsonRequest(`/api/houses/${houseId}/dashboard`),
    goals: (houseId, chores) => jsonRequest(`/api/houses/${houseId}/goals`, { method: "PUT", json: { chores } }),
    upload: (houseId, kind, blob) => jsonRequest(`/api/houses/${houseId}/media?kind=${encodeURIComponent(kind)}`, {
      method: "POST", blob,
    }),
    // Create body.request_id ONCE before calling; reuse the exact body on retry.
    complete: (houseId, body) => jsonRequest(`/api/houses/${houseId}/completions`, { method: "POST", json: body }),
    posts: (houseId, before) => jsonRequest(`/api/houses/${houseId}/posts${before ? `?before=${encodeURIComponent(before)}` : ""}`),
    react: (houseId, postId, emoji) => jsonRequest(`/api/houses/${houseId}/posts/${postId}/reaction`, {
      method: "PUT", json: { emoji },
    }),
    // Set img.src to URL.createObjectURL(blob); revoke it when no longer needed.
    image: async (houseId, mediaId) => (await request(`/api/houses/${houseId}/media/${mediaId}`)).blob(),
  };
}
