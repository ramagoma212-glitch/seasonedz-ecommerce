// Backend Enquiry API calls, used by the Contact/Schools/Wholesale/
// Distributor forms (see components/enquiryForm.js and the submit
// handler in js/app.js).

import { apiPost } from "../apiClient.js";

export function submitEnquiry(payload) {
  return apiPost("/enquiries", payload);
}
