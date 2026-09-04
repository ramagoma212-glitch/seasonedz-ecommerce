// Milestone 181, Part J: public, read-only preorder programme settings
// — used by the Product page to show the REAL, currently-configured
// first-preorder discount percentage, never a hardcoded figure that
// could silently drift from what Preorder Settings actually says.

import { apiGet } from "../apiClient.js";

export function getPublicPreorderSettings() {
  return apiGet("/preorder/settings");
}
