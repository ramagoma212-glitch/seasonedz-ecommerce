// Milestone 189: admin welcome-gift asset management API client. Same
// adminRequest() wrapper (sends the admin session cookie) as every
// other admin API module.
import { adminRequest } from "./adminApiClient.js";

export function getWelcomeGiftAssets() {
  return adminRequest("/admin/welcome-gift/assets", { method: "GET" });
}

export function uploadWelcomeGiftAsset(assetKey, file) {
  const formData = new FormData();
  formData.append("file", file);

  return adminRequest(`/admin/welcome-gift/assets/${encodeURIComponent(assetKey)}`, {
    method: "POST",
    body: formData,
  });
}
