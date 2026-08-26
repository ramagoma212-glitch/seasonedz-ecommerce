// Terms and Conditions page: owner-approved legal content (URGENT
// OWNER UPDATE, 24 August 2026), replacing the previous plain-language
// placeholder terms in full. This is the owner's own supplied legal
// text, transcribed exactly. Every section, list and legal reference
// (CPA, ECTA, POPIA) preserved verbatim; only the markdown -> semantic
// HTML conversion and placement into the site's existing
// .info-page__body/.policy-page structure is this file's own work.
// Business/registration details come from data/businessInfo.js (the
// same shared source already used across the site) so Terms, Privacy
// and every other page referencing them can never quietly drift apart.

import { businessInfo } from "../data/businessInfo.js";

function renderOfficeAddress() {
  return businessInfo.registeredOfficeLines.join("<br />");
}

export function renderTerms() {
  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Terms and Conditions</h1>
      <p class="stub-page__text">Last updated: 24 August 2026</p>

      <div class="info-page__body policy-page">
        <p>Welcome to Seasonedz Group.</p>
        <p>
          These Terms and Conditions apply when you visit, browse, create
          an account, purchase products, download digital products, submit
          an enquiry or otherwise use the Seasonedz Group website at
          <a href="${businessInfo.websiteUrl}">${businessInfo.websiteDisplay}</a>.
        </p>
        <p>By using this website or placing an order, you agree to these Terms and Conditions.</p>
        <p>
          Nothing in these Terms and Conditions is intended to limit any
          rights you may have under South African law, including the
          Consumer Protection Act 68 of 2008 and the Electronic
          Communications and Transactions Act 25 of 2002.
        </p>

        <h2>1. About Seasonedz Group</h2>
        <p>Seasonedz Group is a South African creative publishing and growing print business.</p>
        <p>
          We currently offer educational colouring books, Bible colouring
          books, mindfulness colouring books, creative supplies, digital
          products, gifts, bundles and related creative products.
        </p>
        <p>Our official website is:</p>
        <p><a href="${businessInfo.websiteUrl}">${businessInfo.websiteDisplay}</a></p>

        <h3>Supplier Information</h3>
        <p>
          <strong>Registered business name:</strong> ${businessInfo.registeredName}<br />
          <strong>Registration number:</strong> ${businessInfo.registrationNumber}<br />
          <strong>Enterprise type:</strong> ${businessInfo.enterpriseType}<br />
          <strong>Registration date:</strong> ${businessInfo.registrationDate}<br />
          <strong>Country of registration:</strong> South Africa<br />
          <strong>Director:</strong> ${businessInfo.director}
        </p>
        <p>
          <strong>Registered office:</strong><br />
          ${renderOfficeAddress()}
        </p>
        <p>
          <strong>Email:</strong> <a href="${businessInfo.mailtoUrl}">${businessInfo.email}</a><br />
          <strong>Telephone:</strong> <a href="${businessInfo.telUrl}">${businessInfo.phoneDisplay}</a><br />
          <strong>WhatsApp:</strong> <a href="${businessInfo.whatsappUrl}">${businessInfo.phoneDisplay}</a><br />
          <strong>Website:</strong> <a href="${businessInfo.websiteUrl}">${businessInfo.websiteDisplay}</a>
        </p>

        <h2>2. Using Our Website</h2>
        <p>You may use our website for lawful personal or business purposes.</p>
        <p>You may not:</p>
        <ul>
          <li>Use the website for unlawful or fraudulent activity.</li>
          <li>Attempt to interfere with the security or operation of the website.</li>
          <li>Attempt to gain unauthorised access to another customer's account or our systems.</li>
          <li>Copy, reproduce, distribute or commercially exploit website content without permission.</li>
          <li>Submit false information when placing an order, creating an account or contacting us.</li>
          <li>Use automated systems to misuse, overload or improperly collect information from our website.</li>
        </ul>
        <p>We may restrict or suspend access where we reasonably believe the website is being misused.</p>

        <h2>3. Products</h2>
        <p>We aim to describe and display our products as accurately as reasonably possible.</p>
        <p>
          Product photographs, illustrations, colours and packaging
          displayed on a screen may appear slightly different depending on
          the device, screen settings, lighting, printing process or
          product batch.
        </p>
        <p>
          Minor differences that do not materially change the nature or
          intended use of a product will not necessarily mean that the
          product is defective.
        </p>
        <p>Your rights under applicable South African consumer law remain protected.</p>
        <p>Product availability may change without notice.</p>

        <h2>4. Prices</h2>
        <p>
          All prices displayed on the website are shown in
          <strong>South African Rand, ZAR</strong>, unless stated otherwise.
        </p>
        <p>
          The price displayed on the relevant product page or at checkout
          when the order is placed will apply, subject to the correction of
          genuine errors as permitted by law.
        </p>
        <p>
          Delivery charges, gift wrapping charges and any other applicable
          fees will be shown before the customer completes an order.
        </p>
        <p>Seasonedz Group may change product prices from time to time.</p>
        <p>A price change will not normally affect an order that has already been accepted.</p>

        <h2>5. Orders</h2>
        <p>Adding a product to your cart does not reserve that product.</p>
        <p>Before placing an order, customers are responsible for checking:</p>
        <ul>
          <li>Products selected.</li>
          <li>Quantities.</li>
          <li>Delivery information.</li>
          <li>Contact information.</li>
          <li>Gift wrapping selections.</li>
          <li>Gift messages.</li>
          <li>Digital product selections.</li>
          <li>Total amount payable.</li>
        </ul>
        <p>Customers will be given an opportunity to review their order before submitting it.</p>
        <p>
          After an order is submitted, Seasonedz Group may send an
          electronic acknowledgement or order confirmation.
        </p>
        <p>
          An order remains subject to successful payment, product
          availability, fraud prevention checks and acceptance by
          Seasonedz Group.
        </p>
        <p>
          We may decline or cancel an order where there is a legitimate
          reason, including suspected fraud, incorrect pricing, payment
          failure or unavailable stock.
        </p>
        <p>
          Where Seasonedz Group cancels an order after receiving payment,
          any amount due to the customer will be refunded in accordance
          with applicable law.
        </p>

        <h2>6. Payments</h2>
        <p>Available payment methods will be displayed during checkout.</p>
        <p>Payments may be processed through secure third party payment service providers.</p>
        <p>
          Seasonedz Group will never require customers to send their full
          bank card details through email, WhatsApp or social media.
        </p>
        <p>Customers are responsible for ensuring that they are authorised to use the payment method selected.</p>
        <p>An order will only be processed once any required payment has been successfully received or confirmed.</p>

        <h2>7. Physical Product Delivery</h2>
        <p>
          Seasonedz Group delivers physical products to supported
          addresses in South Africa, subject to the delivery options
          displayed during checkout.
        </p>
        <p>
          The applicable delivery fee and any free delivery threshold will
          be displayed on the website or during checkout.
        </p>
        <p>
          Where gift wrapping is purchased, the gift wrapping charge does
          not form part of the product subtotal used to determine whether
          an order qualifies for free delivery unless expressly stated
          otherwise.
        </p>
        <p>
          Delivery times are estimates unless Seasonedz Group expressly
          agrees to a specific delivery date.
        </p>
        <p>
          Delays may occasionally occur because of circumstances outside
          our reasonable control, including courier delays, severe
          weather, public disruptions, incorrect delivery information or
          other unexpected events.
        </p>
        <p>
          Seasonedz Group will nevertheless fulfil orders within the
          periods required by applicable South African law.
        </p>
        <p>Customers must provide a complete and accurate delivery address and contact number.</p>
        <p>
          Seasonedz Group is not responsible for additional delivery costs
          or delays caused by incorrect or incomplete information supplied
          by the customer, except where applicable law provides otherwise.
        </p>

        <h2>8. Receiving Your Order</h2>
        <p>Customers should inspect their order as soon as reasonably possible after delivery.</p>
        <p>Please contact Seasonedz Group if you receive:</p>
        <ul>
          <li>The wrong product.</li>
          <li>A damaged product.</li>
          <li>An incomplete order.</li>
          <li>A product that is materially different from the product ordered.</li>
        </ul>
        <p>Contact:</p>
        <p>
          <strong>Email:</strong> <a href="${businessInfo.mailtoUrl}">${businessInfo.email}</a><br />
          <strong>WhatsApp:</strong> <a href="${businessInfo.whatsappUrl}">${businessInfo.phoneDisplay}</a>
        </p>
        <p>Where possible, include your order number and clear photographs showing the issue.</p>
        <p>
          Providing photographs helps us investigate the matter but does
          not remove any rights available to a customer under applicable
          consumer law.
        </p>

        <h2>9. Returns, Refunds and Exchanges</h2>
        <p>
          Our return, refund and exchange arrangements must always be read
          together with the customer's rights under applicable South
          African consumer law.
        </p>
        <p>Nothing in these Terms removes any legal right that cannot lawfully be excluded.</p>
        <p>
          Where a return is permitted, the product should be returned with
          all parts, accessories and packaging reasonably required to
          process the return.
        </p>
        <p>Different conditions may apply depending on whether a product is:</p>
        <ul>
          <li>Unwanted.</li>
          <li>Defective.</li>
          <li>Incorrectly supplied.</li>
          <li>Personalised.</li>
          <li>Digitally supplied.</li>
        </ul>

        <h3>Change of Mind</h3>
        <p>
          Customers do not automatically have the same change of mind
          rights for every type of product or transaction.
        </p>
        <p>Where a statutory cooling off right applies, Seasonedz Group will honour that right.</p>
        <p>
          Some transactions may be excluded from particular cooling off
          provisions under South African law, including certain books,
          personalised products and other legally excluded categories.
        </p>

        <h3>Direct Marketing</h3>
        <p>
          Where an agreement results from direct marketing and a statutory
          cooling off period applies, customers may exercise their rights
          under the Consumer Protection Act.
        </p>

        <h3>Electronic Transactions</h3>
        <p>
          Where the cooling off provisions of the Electronic Communications
          and Transactions Act apply, customers may exercise the rights
          provided by that Act.
        </p>
        <p>Certain categories of electronic transactions may be excluded from those cooling off provisions.</p>

        <h2>10. Defective, Unsafe or Poor Quality Products</h2>
        <p>Seasonedz Group does not limit the statutory warranty provided by the Consumer Protection Act.</p>
        <p>
          Where goods fail to meet the quality standards required by law
          during the applicable statutory period, customers may be
          entitled to return the goods and request a repair, replacement
          or refund as provided by law.
        </p>
        <p>
          This includes the statutory rights applicable during the first
          six months after delivery where section 56 of the Consumer
          Protection Act applies.
        </p>
        <p>
          Normal wear, misuse, deliberate damage, improper storage or
          alteration by the customer may affect whether a product
          qualifies as defective.
        </p>

        <h2>11. Digital Products</h2>
        <p>
          Seasonedz Group may sell downloadable or electronically
          delivered products, including digital colouring books and other
          digital content.
        </p>
        <p>
          Unless a product page expressly states otherwise, digital
          products are licensed for the purchaser's <strong>personal use only</strong>.
        </p>
        <p>
          Purchasing a digital product does not transfer copyright or
          ownership of the underlying artwork, illustrations, text,
          layouts or other intellectual property.
        </p>
        <p>Without written permission from Seasonedz Group, customers may not:</p>
        <ul>
          <li>Resell the digital file.</li>
          <li>Share the file publicly.</li>
          <li>Upload it to another website or platform.</li>
          <li>Distribute copies to other people.</li>
          <li>Claim the work as their own.</li>
          <li>Modify the product for commercial resale.</li>
          <li>Include the file or its contents in another product for sale.</li>
          <li>Use the product commercially unless a commercial licence is expressly included.</li>
        </ul>
        <p>
          A purchaser may download and print a digital colouring product
          for their own personal or household use unless a different
          licence is stated on the product page.
        </p>
        <p>
          Schools, churches, businesses or organisations requiring broader
          reproduction rights should contact Seasonedz Group for permission
          or an appropriate licence.
        </p>

        <h3>Digital Refunds</h3>
        <p>
          Because digital products may become available immediately after
          purchase, cancellation and refund rights may differ from those
          applying to physical products.
        </p>
        <p>
          Where a digital product has already been accessed or downloaded,
          refunds for a simple change of mind may be restricted where
          permitted by law.
        </p>
        <p>
          This does not affect legal rights where a digital product is
          defective, materially different from its description,
          inaccessible because of a problem attributable to Seasonedz
          Group or where a refund is otherwise required by law.
        </p>

        <h2>12. Gift Wrapping and Gift Messages</h2>
        <p>Gift wrapping may be available for selected physical products.</p>
        <p>The applicable fee will be displayed before checkout.</p>
        <p>Digital products are not eligible for physical gift wrapping.</p>
        <p>Customers are responsible for checking their gift message before submitting an order.</p>
        <p>
          Seasonedz Group may refuse a gift message containing unlawful,
          threatening, discriminatory, abusive or otherwise inappropriate
          content.
        </p>
        <p>
          Where work on a personalised or customised product has already
          begun, cancellation rights may be limited where permitted by
          law.
        </p>
        <p>Statutory rights relating to defective or incorrectly supplied products remain unaffected.</p>

        <h2>13. Promotions and Discount Codes</h2>
        <p>Promotional offers and discount codes may be subject to additional terms displayed with the promotion.</p>
        <p>Unless otherwise stated:</p>
        <ul>
          <li>Promotions cannot be exchanged for cash.</li>
          <li>Discounts apply only during the stated promotional period.</li>
          <li>Promotions may apply only to selected products.</li>
          <li>Only one promotional code may be accepted per order where specified.</li>
          <li>Promotional codes may not be used fraudulently.</li>
        </ul>
        <p>
          Seasonedz Group may withdraw or correct a promotion where there
          has been an obvious error, misuse or technical problem, subject
          to applicable law.
        </p>
        <p>
          If you place a qualifying order using a valid Seasonedz Affiliate
          Programme referral link, a discount is applied automatically at
          checkout at the rate current at the time of your order. Referral
          discounts are subject to our attribution window, are not
          combinable with fraudulent or abusive referral activity, and the
          applicable rate may change for future orders without affecting
          discounts already applied to past ones. Full details are set out
          in our <a href="/affiliate-terms">Affiliate Programme Terms</a>.
        </p>

        <h2>14. Stock Availability</h2>
        <p>Products displayed on the website may become unavailable.</p>
        <p>
          If Seasonedz Group cannot supply an item after receiving
          payment, we will notify the customer and provide the appropriate
          refund or other remedy in accordance with applicable law.
        </p>
        <p>We will not substitute another product without the customer's agreement.</p>

        <h2>15. Wholesale and Bulk Orders</h2>
        <p>
          Wholesale, reseller, school, church, corporate and bulk orders
          may be subject to a separate quotation or written agreement.
        </p>
        <p>Retail prices displayed on the website do not automatically apply to wholesale or bulk orders.</p>
        <p>A quotation may specify:</p>
        <ul>
          <li>Product quantities.</li>
          <li>Pricing.</li>
          <li>Deposits.</li>
          <li>Production periods.</li>
          <li>Delivery arrangements.</li>
          <li>Artwork requirements.</li>
          <li>Cancellation conditions.</li>
          <li>Payment terms.</li>
        </ul>
        <p>
          Where separate written terms are agreed for a wholesale or
          custom order, those terms will apply to the relevant order
          together with any mandatory rights provided by law.
        </p>

        <h2>16. Future Printing and Print on Demand Services</h2>
        <p>Seasonedz Group is building towards offering broader printing and print on demand services.</p>
        <p>
          Information describing our future plans does not mean that every
          printing service mentioned on our website is currently
          available.
        </p>
        <p>
          Where custom printing or print on demand services are offered,
          additional quotation, artwork, copyright, production, payment and
          approval terms may apply.
        </p>
        <p>These terms will be provided before the relevant custom order is finalised.</p>

        <h2>17. Customer Supplied Artwork and Content</h2>
        <p>
          Where Seasonedz Group accepts customer supplied artwork,
          photographs, text, designs or other material for a custom
          product, the customer must have the necessary rights or
          permission to use that material.
        </p>
        <p>Customers must not submit content that:</p>
        <ul>
          <li>Infringes another person's copyright or trademark.</li>
          <li>Is unlawful.</li>
          <li>Is fraudulent or misleading.</li>
          <li>Violates another person's privacy.</li>
          <li>Contains material that Seasonedz Group cannot lawfully reproduce.</li>
        </ul>
        <p>The customer remains responsible for obtaining the required permissions for material they supply.</p>
        <p>
          Seasonedz Group may refuse a printing or production request
          where we reasonably believe that supplied content infringes
          another person's rights or violates applicable law.
        </p>

        <h2>18. Intellectual Property</h2>
        <p>
          Unless otherwise stated, the Seasonedz Group name, branding,
          website content, product artwork, book content, illustrations,
          photographs, graphics, layouts, designs and other original
          material are owned by Seasonedz Group or used with appropriate
          permission.
        </p>
        <p>Nothing on this website gives visitors ownership of Seasonedz Group intellectual property.</p>
        <p>Customers may use purchased products in accordance with their intended purpose and applicable licence.</p>
        <p>
          Protected Seasonedz Group content may not be reproduced,
          republished, distributed, sold or commercially exploited without
          prior written permission.
        </p>

        <h2>19. Reviews and Customer Content</h2>
        <p>
          Where customers submit reviews, photographs, comments or other
          content, they confirm that they have the right to submit that
          material.
        </p>
        <p>
          Seasonedz Group may moderate content that is unlawful, abusive,
          fraudulent, irrelevant, misleading or infringes another person's
          rights.
        </p>
        <p>Seasonedz Group will not knowingly create or publish fake customer reviews.</p>
        <p>
          Where we wish to use a customer's photograph or other personal
          content for marketing outside the context in which it was
          originally submitted, we will obtain any permission required by
          applicable law.
        </p>

        <h2>20. Third Party Platforms and Links</h2>
        <p>Our website may contain links to third party services or marketplaces.</p>
        <p>Seasonedz Group products may also be available through third party marketplaces.</p>
        <p>
          Purchases completed directly through another marketplace may
          also be subject to that marketplace's own terms, payment
          processes, delivery arrangements and returns procedures.
        </p>
        <p>
          Seasonedz Group is not responsible for the independent operation
          of third party websites or services, except to the extent
          required by applicable law.
        </p>

        <h2>21. Privacy and Personal Information</h2>
        <p>
          Seasonedz Group processes personal information in accordance
          with applicable South African privacy law, including the
          Protection of Personal Information Act 4 of 2013.
        </p>
        <p>Personal information may be collected where reasonably necessary to:</p>
        <ul>
          <li>Process orders.</li>
          <li>Arrange delivery.</li>
          <li>Communicate with customers.</li>
          <li>Provide customer support.</li>
          <li>Maintain customer accounts.</li>
          <li>Prevent fraud.</li>
          <li>Meet legal obligations.</li>
          <li>Send marketing communications where legally permitted.</li>
        </ul>
        <p>
          More information about how we collect, use, store and protect
          personal information should be read in our
          <a href="/privacy-policy">Privacy Policy</a>.
        </p>

        <h2>22. Marketing Communications</h2>
        <p>
          Customers may choose to subscribe to marketing communications
          from Seasonedz Group where this option is available.
        </p>
        <p>
          Where required by law, Seasonedz Group will obtain the necessary
          consent before sending direct marketing.
        </p>
        <p>Customers may unsubscribe using the method provided in the communication or by contacting Seasonedz Group.</p>
        <p>
          Transactional communications concerning an order, payment,
          delivery, security issue or customer enquiry are not treated in
          the same way as optional marketing communications.
        </p>

        <h2>23. Website Availability</h2>
        <p>Seasonedz Group aims to keep the website available and accurate, but we cannot guarantee uninterrupted availability.</p>
        <p>
          Maintenance, technical problems, internet failures or
          circumstances outside our reasonable control may temporarily
          affect the website.
        </p>
        <p>Where possible, material errors will be corrected as soon as reasonably practical.</p>

        <h2>24. Limitation of Liability</h2>
        <p>Nothing in these Terms excludes or limits liability where doing so would be unlawful.</p>
        <p>
          To the maximum extent permitted by law, Seasonedz Group will not
          be responsible for indirect or consequential loss arising solely
          from circumstances outside our reasonable control.
        </p>
        <p>
          Nothing in this section limits rights available to customers
          under the Consumer Protection Act, Electronic Communications and
          Transactions Act or other applicable South African legislation.
        </p>

        <h2>25. Accounts and Passwords</h2>
        <p>Where customers can create an account, customers are responsible for keeping their login details secure.</p>
        <p>Please contact Seasonedz Group promptly if you believe your account has been accessed without permission.</p>
        <p>We may take reasonable steps to secure, suspend or restrict an account where fraud or unauthorised access is suspected.</p>

        <h2>26. Electronic Communications</h2>
        <p>
          By using our website, placing an order or contacting Seasonedz
          Group electronically, you acknowledge that communications may
          take place electronically.
        </p>
        <p>
          Order confirmations, notices, receipts and other communications
          may be sent by email or another contact method provided by the
          customer.
        </p>
        <p>Electronic communications will be treated in accordance with applicable South African law.</p>

        <h2>27. Complaints</h2>
        <p>
          We encourage customers to contact Seasonedz Group first if
          something has gone wrong so that we have an opportunity to
          resolve the matter fairly.
        </p>
        <p>Where applicable, please include your order number and a clear explanation of the issue.</p>
        <p>
          <strong>Email:</strong> <a href="${businessInfo.mailtoUrl}">${businessInfo.email}</a><br />
          <strong>WhatsApp:</strong> <a href="${businessInfo.whatsappUrl}">${businessInfo.phoneDisplay}</a><br />
          <strong>Telephone:</strong> <a href="${businessInfo.telUrl}">${businessInfo.phoneDisplay}</a>
        </p>
        <p>
          Nothing in these Terms prevents a consumer from approaching a
          regulator, ombud, court or other dispute resolution body where
          they are legally entitled to do so.
        </p>

        <h2>28. Governing Law</h2>
        <p>These Terms and Conditions are governed by the laws of the Republic of South Africa.</p>
        <p>
          Any dispute will be dealt with under South African law and
          through a court, regulator, ombud or other forum with lawful
          jurisdiction.
        </p>

        <h2>29. Changes to These Terms</h2>
        <p>
          Seasonedz Group may update these Terms and Conditions where our
          products, website, business practices or legal obligations
          change.
        </p>
        <p>The latest version will be published on this website together with its last updated date.</p>
        <p>Changes will not remove rights that a customer has already acquired under applicable law.</p>

        <h2>30. Contact Seasonedz Group</h2>
        <p><strong>${businessInfo.registeredName}</strong></p>
        <p>Registration number: <strong>${businessInfo.registrationNumber}</strong></p>
        <p>${renderOfficeAddress()}</p>
        <p>
          <strong>Website:</strong> <a href="${businessInfo.websiteUrl}">${businessInfo.websiteDisplay}</a><br />
          <strong>Email:</strong> <a href="${businessInfo.mailtoUrl}">${businessInfo.email}</a><br />
          <strong>WhatsApp:</strong> <a href="${businessInfo.whatsappUrl}">${businessInfo.phoneDisplay}</a><br />
          <strong>Telephone:</strong> <a href="${businessInfo.telUrl}">${businessInfo.phoneDisplay}</a>
        </p>

        <p class="about-closing"><strong>Where Creativity Meets Purpose.</strong></p>
      </div>
    </section>
  `;
}
