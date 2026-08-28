// Privacy Policy page: owner-approved legal content (URGENT OWNER
// UPDATE, 24 August 2026), replacing the previous plain-language
// summary in full. This is the owner's own supplied POPIA-aligned
// text, transcribed exactly. Business/registration details come from
// data/businessInfo.js, the same shared source already used on the
// Terms and Conditions page, so the two documents can never quietly
// drift apart.

import { businessInfo } from "../data/businessInfo.js";

function renderOfficeAddress() {
  return businessInfo.registeredOfficeLines.join("<br />");
}

export function renderPrivacyPolicy() {
  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Privacy Policy</h1>
      <p class="stub-page__text">Last updated: 27 August 2026</p>

      <div class="info-page__body policy-page">
        <p>Seasonedz Group respects your privacy and is committed to protecting your personal information.</p>
        <p>
          This Privacy Policy explains how we collect, use, store, share
          and protect personal information when you visit
          <a href="${businessInfo.websiteUrl}">${businessInfo.websiteDisplay}</a>,
          create an account, place an order, download a digital product,
          subscribe to communications, submit an enquiry or otherwise
          interact with Seasonedz Group.
        </p>
        <p>
          We process personal information in accordance with applicable
          South African law, including the Protection of Personal
          Information Act 4 of 2013, POPIA.
        </p>

        <h2>1. Who We Are</h2>
        <p>
          <strong>Registered business name:</strong> ${businessInfo.registeredName}<br />
          <strong>Registration number:</strong> ${businessInfo.registrationNumber}<br />
          <strong>Enterprise type:</strong> ${businessInfo.enterpriseType}<br />
          <strong>Country of registration:</strong> South Africa
        </p>
        <p>
          <strong>Registered office:</strong><br />
          ${renderOfficeAddress()}
        </p>
        <p>
          <strong>Website:</strong> <a href="${businessInfo.websiteUrl}">${businessInfo.websiteDisplay}</a><br />
          <strong>Email:</strong> <a href="${businessInfo.mailtoUrl}">${businessInfo.email}</a><br />
          <strong>Telephone:</strong> <a href="${businessInfo.telUrl}">${businessInfo.phoneDisplay}</a><br />
          <strong>WhatsApp:</strong> <a href="${businessInfo.whatsappUrl}">${businessInfo.phoneDisplay}</a>
        </p>
        <p>For purposes of POPIA, Seasonedz Group is the responsible party for personal information that we determine how and why to process.</p>

        <h2>2. Personal Information We May Collect</h2>
        <p>Depending on how you interact with Seasonedz Group, we may collect information such as:</p>
        <ul>
          <li>Your full name.</li>
          <li>Email address.</li>
          <li>Telephone or WhatsApp number.</li>
          <li>Billing information.</li>
          <li>Delivery address.</li>
          <li>Order information.</li>
          <li>Products purchased.</li>
          <li>Account information.</li>
          <li>Customer enquiries and correspondence.</li>
          <li>Reviews or feedback you submit.</li>
          <li>Newsletter or marketing preferences.</li>
          <li>Gift messages where applicable.</li>
          <li>Information provided when requesting wholesale, school, church or business services.</li>
          <li>Information you voluntarily provide for a personalised or custom product.</li>
          <li>Technical information relating to your use of our website.</li>
        </ul>
        <p>
          This may include information such as your device type, browser,
          IP address, website activity and information collected through
          cookies or similar technologies where applicable.
        </p>

        <h2>3. Information We Do Not Need</h2>
        <p>Please do not send Seasonedz Group unnecessary sensitive personal information through email, WhatsApp, website forms or social media.</p>
        <p>We will never ask customers to send full bank card details through WhatsApp, email or social media.</p>

        <h2>4. How We Collect Information</h2>
        <p>We may collect information:</p>
        <ul>
          <li>Directly from you when you place an order.</li>
          <li>When you create or use a customer account.</li>
          <li>When you contact us.</li>
          <li>When you subscribe to a newsletter or marketing communication.</li>
          <li>When you submit a review.</li>
          <li>When you request a quotation.</li>
          <li>When you participate in an enquiry, promotion or customer service conversation.</li>
          <li>Automatically through website technologies where applicable.</li>
          <li>From payment, delivery or technology providers where necessary to complete a transaction.</li>
        </ul>

        <h2>5. Why We Use Personal Information</h2>
        <p>Seasonedz Group may process personal information to:</p>
        <ul>
          <li>Process and fulfil orders.</li>
          <li>Confirm payments.</li>
          <li>Arrange delivery.</li>
          <li>Provide digital products.</li>
          <li>Manage customer accounts.</li>
          <li>Communicate about orders.</li>
          <li>Respond to enquiries.</li>
          <li>Provide customer support.</li>
          <li>Handle returns, refunds or complaints.</li>
          <li>Provide quotations.</li>
          <li>Manage wholesale, school, church or business enquiries.</li>
          <li>Prevent fraud and protect our website.</li>
          <li>Maintain business and financial records.</li>
          <li>Improve our website and customer experience.</li>
          <li>Understand how customers use our website.</li>
          <li>Send marketing communications where permitted by law.</li>
          <li>Meet legal, accounting and regulatory obligations.</li>
        </ul>

        <h2>6. Lawful Processing</h2>
        <p>We process personal information only where there is an appropriate legal basis for doing so.</p>
        <p>Depending on the circumstances, this may include:</p>
        <ul>
          <li>Your consent.</li>
          <li>Processing necessary to complete or manage a transaction with you.</li>
          <li>Compliance with a legal obligation.</li>
          <li>Protecting your legitimate interests.</li>
          <li>Protecting Seasonedz Group's legitimate business interests where permitted by law and where those interests do not unfairly interfere with your privacy rights.</li>
        </ul>
        <p>You may withdraw consent where processing is based on consent, subject to applicable law.</p>

        <h2>7. Orders and Payments</h2>
        <p>When you place an order, we collect the information reasonably necessary to process that order.</p>
        <p>Payment transactions may be handled by third party payment service providers.</p>
        <p>Seasonedz Group does not need to store your full payment card information where payment processing is performed securely by the payment provider.</p>
        <p>Payment providers may process information according to their own privacy and security policies.</p>

        <h2>8. Delivery</h2>
        <p>Where you purchase a physical product, we may share necessary delivery information with a courier or delivery service.</p>
        <p>This may include your:</p>
        <ul>
          <li>Name.</li>
          <li>Delivery address.</li>
          <li>Telephone number.</li>
          <li>Relevant order or delivery information.</li>
        </ul>
        <p>We provide only the information reasonably necessary to complete the delivery.</p>

        <h2>9. Digital Products</h2>
        <p>Where you purchase a digital product, we may process your name, email address, order information and technical information required to provide or protect access to the digital product.</p>

        <h2>10. Customer Accounts</h2>
        <p>Where our website offers customer accounts, information may be stored to:</p>
        <ul>
          <li>Allow you to log in.</li>
          <li>View relevant account information.</li>
          <li>Manage orders.</li>
          <li>Maintain account security.</li>
          <li>Show a record of notifications sent to your account (such as order, delivery and account updates) inside a Notifications area of your account, and let you mark these as read.</li>
        </ul>
        <p>You are responsible for keeping your password and login information secure.</p>

        <h2>11. Cart, Wishlist and Website Preferences</h2>
        <p>Our website may use browser storage technologies such as cookies or local storage to remember information such as:</p>
        <ul>
          <li>Shopping cart contents.</li>
          <li>Wishlist selections.</li>
          <li>Website preferences.</li>
          <li>Login or session information where applicable.</li>
        </ul>
        <p>Further information is available in our <a href="/cookies-policy">Cookie Policy</a>.</p>
        <p>If you create an account and are logged in, your wishlist may also be saved on our servers against your account, so it can still be used to let you know if a wishlisted item comes back into stock. Signing in on a device with items already saved in your browser's wishlist merges those items into your account's saved wishlist.</p>
        <p>If you begin entering your details at checkout (such as your email address and the items in your cart) but do not complete your order, we may save that information for a limited time so we can send you a single reminder email and let you resume your order. This is never a fake order and never affects your payment details in any way. You can opt out of this at any time. See Section 12 below.</p>

        <h2>12. Marketing and Optional Communications</h2>
        <p>Seasonedz Group may send marketing communications only where permitted by applicable law.</p>
        <p>Where consent is required for electronic direct marketing, we will request the necessary consent.</p>
        <p>Customers may also receive marketing relating to our own similar products or services where permitted by law and where the required conditions have been met.</p>
        <p>Every electronic marketing communication should provide a reasonable method to stop receiving future marketing.</p>
        <p>You may unsubscribe or object to marketing at any time.</p>
        <p>Contact: <a href="${businessInfo.mailtoUrl}">${businessInfo.email}</a></p>
        <p>Transactional messages concerning an order, payment, delivery, security issue or customer enquiry are not the same as optional marketing communications, and cannot be opted out of while you continue using our services.</p>
        <p>If you have a customer account, the following optional communications can each be turned off individually from a Notification Preferences area of your account:</p>
        <ul>
          <li>A request to review a product you purchased, sent once after a reasonable delay following delivery (or, for digital products, after purchase), with at most one follow-up reminder.</li>
          <li>An alert that a product you asked to be notified about, or that is saved on your wishlist, is back in stock.</li>
          <li>A reminder that you have items waiting in an unfinished checkout, sent at most once per checkout attempt.</li>
        </ul>
        <p>We never offer or imply a reward for leaving a positive review, and never ask specifically for a five-star rating.</p>

        <h2>13. Newsletter</h2>
        <p>If you subscribe to our newsletter, we may use your email address and relevant preferences to send:</p>
        <ul>
          <li>Product news.</li>
          <li>Creative content.</li>
          <li>New releases.</li>
          <li>Offers.</li>
          <li>Seasonedz Group updates.</li>
        </ul>
        <p>You can unsubscribe using the unsubscribe option provided in the communication or by contacting us.</p>

        <h2>14. Affiliate Programme</h2>
        <p>Seasonedz Group operates its own Affiliate Programme, allowing customers and other supporters to apply to refer new customers in exchange for a commission. If you apply to become an affiliate, we process:</p>
        <ul>
          <li>Your name, email address and phone number, taken from your existing Seasonedz Group account where possible.</li>
          <li>Your affiliate application status.</li>
          <li>Your referral code and referral activity.</li>
          <li>Commission and payout records connected to orders you refer.</li>
        </ul>
        <p>If you follow another customer's referral link, we store a referral code and a signed capture timestamp in your browser's local storage, described in full in our separate <a href="/cookies-policy">Cookie Policy</a>, so that a qualifying order you place can be correctly attributed to that affiliate. This referral information is first party only; it is never shared with, or read by, any third party advertising or tracking service.</p>
        <p>When an order is genuinely referred and completed, we associate it with the relevant affiliate's account for the purpose of calculating and recording their commission. An affiliate can see limited information about orders referred through their own link (such as the order reference, date and commission amount) but never a referred customer's password, full delivery address, or unnecessary contact details.</p>
        <p>Affiliate payout records (amounts owed, approved, and paid) are kept for the same reasons, and for the same periods, as our other financial and accounting records. See section 19 below.</p>
        <p>Full programme rules are set out in our <a href="/affiliate-terms">Affiliate Programme Terms</a>.</p>

        <h3>14.1 Affiliate Application &amp; Identity Verification</h3>
        <p>Joining the Affiliate Programme requires completing a fuller application, which asks for additional personal information used only for genuine onboarding and verification purposes:</p>
        <ul>
          <li>Your legal first, middle and surname, date of birth and nationality.</li>
          <li>An identity document number (South African ID or passport number).</li>
          <li>Your contact details (email, mobile and, optionally, WhatsApp number) and residential address.</li>
          <li>If applying as a business, your business name, registration number and website.</li>
          <li>Information about how you plan to promote Seasonedz (e.g. website or social media links) and why you'd like to join.</li>
          <li>A copy of an identity document (South African ID or passport) and one proof-of-residence document (for example a bank statement or municipal account or letter).</li>
        </ul>
        <p>We collect identity and residential documents solely to help our team verify that an application is genuine before granting access to referral links and commission. When a document is uploaded, our systems run automated checks that attempt to confirm the document appears to be the type you selected (for example, that a document uploaded as a bank statement genuinely looks like one) and that names or addresses in the document appear broadly consistent with what you entered. These automated checks assist our review only. They do not verify your identity with Home Affairs, a bank, or any other authority, and they never themselves approve an application. Every application is only ever approved or rejected by an authorised Seasonedz Group team member.</p>
        <p>Identity and proof-of-residence documents are stored in a private file storage area that is never publicly accessible. They can only be viewed by you (for your own application) or by an authorised Seasonedz Group admin reviewing your application, each time via a fresh, short-lived access link generated at the moment it's needed. We never publish a permanent link to any document. We do not extract or store banking details such as account numbers, balances or transaction history from a bank statement; only the minimum information needed to help confirm the document type and that it appears to belong to you.</p>
        <p>If part of your application needs correcting (for example, a document that didn't upload clearly), we'll tell you what's needed so you can fix and resubmit just that part, without losing the rest of your application.</p>
        <p>Identity and document information is retained for as long as reasonably needed to support your application, your ongoing affiliate relationship (if approved), or a genuine dispute or compliance need if not approved, and is not kept indefinitely without purpose. We have not yet finalised a fixed retention period for rejected or withdrawn applications' documents; this Policy will be updated once one is set.</p>

        <h2>15. Cookies and Similar Technologies</h2>
        <p>Seasonedz Group may use cookies and similar browser technologies to support:</p>
        <ul>
          <li>Website functionality.</li>
          <li>Security.</li>
          <li>Shopping cart features.</li>
          <li>Customer preferences.</li>
          <li>Analytics.</li>
          <li>Website improvement.</li>
          <li>Marketing where applicable and permitted.</li>
        </ul>
        <p>You can learn more, including about our first party affiliate referral storage, in our separate <a href="/cookies-policy">Cookie Policy</a>.</p>

        <h2>16. Information We Share</h2>
        <p>Seasonedz Group does not sell customers' personal information.</p>
        <p>We may share information with trusted service providers where reasonably necessary to operate our business.</p>
        <p>These may include:</p>
        <ul>
          <li>Payment providers.</li>
          <li>Couriers and delivery companies.</li>
          <li>Website hosting and infrastructure providers.</li>
          <li>Database and technology providers.</li>
          <li>Email or newsletter providers.</li>
          <li>Analytics providers.</li>
          <li>Professional advisers.</li>
          <li>Accountants.</li>
          <li>Legal advisers.</li>
          <li>Regulatory or government authorities where legally required.</li>
        </ul>
        <p>Service providers should process personal information only for legitimate purposes connected with the services they provide.</p>

        <h2>17. Third Party Marketplaces</h2>
        <p>Seasonedz Group products may also be sold through third party marketplaces.</p>
        <p>When you purchase directly through another marketplace, that marketplace may collect and process your personal information under its own privacy policy.</p>
        <p>Seasonedz Group is not responsible for the independent privacy practices of third party platforms.</p>

        <h2>18. International Processing</h2>
        <p>Some technology or service providers may operate outside South Africa or store information using infrastructure located in another country.</p>
        <p>Where personal information is transferred outside South Africa, Seasonedz Group will take reasonable steps to ensure that the transfer is handled in accordance with applicable South African data protection requirements.</p>

        <h2>19. How Long We Keep Information</h2>
        <p>We keep personal information only for as long as reasonably necessary for the purpose for which it was collected or where retention is required by law.</p>
        <p>Retention periods may depend on:</p>
        <ul>
          <li>The type of information.</li>
          <li>The purpose for which it was collected.</li>
          <li>Accounting or tax requirements.</li>
          <li>Contractual requirements.</li>
          <li>Fraud prevention.</li>
          <li>Legal claims.</li>
          <li>Regulatory obligations.</li>
        </ul>
        <p>When information is no longer required, we may delete, destroy or de identify it as appropriate.</p>

        <h2>20. Information Security</h2>
        <p>Seasonedz Group takes reasonable technical and organisational steps to protect personal information from:</p>
        <ul>
          <li>Loss.</li>
          <li>Unauthorised access.</li>
          <li>Misuse.</li>
          <li>Unauthorised disclosure.</li>
          <li>Alteration.</li>
          <li>Destruction.</li>
        </ul>
        <p>No online system can guarantee absolute security, but we take reasonable measures appropriate to the information we process.</p>

        <h2>21. Personal Information Security Incidents</h2>
        <p>If Seasonedz Group becomes aware of a security compromise involving personal information, we will take reasonable steps to investigate and contain the incident.</p>
        <p>Where legally required, affected persons and the Information Regulator will be notified in accordance with applicable law.</p>

        <h2>22. Children's Personal Information</h2>
        <p>Some Seasonedz Group products are designed for children, but our ecommerce website and checkout are primarily intended for adults purchasing products.</p>
        <p>We do not intentionally collect children's personal information without appropriate authorisation where that authorisation is required.</p>
        <p>Parents or guardians should contact us if they believe a child has provided personal information without appropriate permission.</p>

        <h2>23. Your Privacy Rights</h2>
        <p>Subject to applicable law, you may have the right to:</p>
        <ul>
          <li>Ask whether we hold personal information about you.</li>
          <li>Request access to your personal information.</li>
          <li>Ask us to correct inaccurate information.</li>
          <li>Ask for information to be deleted or destroyed where legally appropriate.</li>
          <li>Object to certain processing.</li>
          <li>Object to direct marketing.</li>
          <li>Withdraw consent where processing is based on consent.</li>
          <li>Lodge a complaint concerning the processing of your personal information.</li>
        </ul>
        <p>We may need to verify your identity before responding to certain requests.</p>

        <h2>24. How to Exercise Your Rights</h2>
        <p>You can contact Seasonedz Group at:</p>
        <p>
          <strong>Email:</strong> <a href="${businessInfo.mailtoUrl}">${businessInfo.email}</a><br />
          <strong>Telephone:</strong> <a href="${businessInfo.telUrl}">${businessInfo.phoneDisplay}</a><br />
          <strong>WhatsApp:</strong> <a href="${businessInfo.whatsappUrl}">${businessInfo.phoneDisplay}</a>
        </p>
        <p>Please explain the nature of your request clearly.</p>

        <h2>25. Complaints to the Information Regulator</h2>
        <p>You have the right to approach the Information Regulator of South Africa if you believe your personal information has been processed unlawfully.</p>
        <p>Information about complaints and current contact methods is available from the Information Regulator's official website.</p>

        <h2>26. Links to Other Websites</h2>
        <p>Our website may link to social media platforms, marketplaces, payment providers or other third party websites.</p>
        <p>Those organisations operate independently and may have their own privacy policies.</p>
        <p>We recommend reviewing those policies when using third party services.</p>

        <h2>27. Changes to This Privacy Policy</h2>
        <p>Seasonedz Group may update this Privacy Policy when:</p>
        <ul>
          <li>Our website changes.</li>
          <li>We introduce new services.</li>
          <li>Our processing activities change.</li>
          <li>Legal requirements change.</li>
        </ul>
        <p>The latest version will be published on <a href="${businessInfo.websiteUrl}">${businessInfo.websiteDisplay}</a> with its updated date.</p>

        <h2>28. Contact Us</h2>
        <p>For privacy related questions or requests:</p>
        <p><strong>${businessInfo.registeredName}</strong></p>
        <p>Registration number: <strong>${businessInfo.registrationNumber}</strong></p>
        <p>${renderOfficeAddress()}</p>
        <p>
          <strong>Website:</strong> <a href="${businessInfo.websiteUrl}">${businessInfo.websiteDisplay}</a><br />
          <strong>Email:</strong> <a href="${businessInfo.mailtoUrl}">${businessInfo.email}</a><br />
          <strong>Telephone:</strong> <a href="${businessInfo.telUrl}">${businessInfo.phoneDisplay}</a><br />
          <strong>WhatsApp:</strong> <a href="${businessInfo.whatsappUrl}">${businessInfo.phoneDisplay}</a>
        </p>

        <p class="about-closing"><strong>Where Creativity Meets Purpose.</strong></p>
      </div>
    </section>
  `;
}
