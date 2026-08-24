// Returns, Refunds and Exchanges Policy page: owner-approved legal
// content (URGENT OWNER UPDATE, 24 August 2026), replacing the
// previous plain-language summary in full. This is the owner's own
// supplied text, transcribed exactly, including the specific CPA and
// ECTA time periods (6 months, 10 business days, 7 days, 5 business
// days) and the deliberate distinctions between books, used colouring
// books, creative supplies, personalised products and digital
// products. Business/registration details come from
// data/businessInfo.js, the same shared source used on the Terms and
// Conditions and Privacy Policy pages.

import { businessInfo } from "../data/businessInfo.js";

function renderOfficeAddress() {
  return businessInfo.registeredOfficeLines.join("<br />");
}

export function renderReturnsPolicy() {
  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Returns, Refunds and Exchanges Policy</h1>
      <p class="stub-page__text">Last updated: 24 August 2026</p>

      <div class="info-page__body policy-page">
        <p>Seasonedz Group wants customers to receive products that are correctly supplied, good quality and consistent with what was ordered.</p>
        <p>
          This Returns, Refunds and Exchanges Policy explains how returns
          are handled for physical products, books, creative supplies,
          personalised products and digital products purchased directly
          from <a href="${businessInfo.websiteUrl}">${businessInfo.websiteDisplay}</a>.
        </p>
        <p>Nothing in this policy limits any consumer right that cannot legally be excluded under South African law.</p>

        <h2>1. Contact Us About a Return</h2>
        <p>If you have a problem with an order, contact us at:</p>
        <p>
          <strong>Email:</strong> <a href="${businessInfo.mailtoUrl}">${businessInfo.email}</a><br />
          <strong>WhatsApp:</strong> <a href="${businessInfo.whatsappUrl}">${businessInfo.phoneDisplay}</a><br />
          <strong>Telephone:</strong> <a href="${businessInfo.telUrl}">${businessInfo.phoneDisplay}</a>
        </p>
        <p>Please provide:</p>
        <ul>
          <li>Your name.</li>
          <li>Order number.</li>
          <li>Product concerned.</li>
          <li>Reason for the return request.</li>
          <li>Photographs where the product is damaged, defective or incorrectly supplied.</li>
        </ul>
        <p>We recommend contacting us as soon as reasonably possible after discovering a problem.</p>

        <h2>2. Incorrect Products</h2>
        <p>If Seasonedz Group delivers a product that is different from what you ordered, please contact us.</p>
        <p>Where the product was incorrectly supplied by Seasonedz Group, we will arrange an appropriate remedy in accordance with applicable law.</p>
        <p>This may include:</p>
        <ul>
          <li>Replacement.</li>
          <li>Exchange.</li>
          <li>Refund.</li>
          <li>Collection or return arrangements where appropriate.</li>
        </ul>

        <h2>3. Damaged Products</h2>
        <p>If an order arrives damaged, contact us as soon as reasonably possible.</p>
        <p>Please keep:</p>
        <ul>
          <li>The damaged product.</li>
          <li>Original packaging where possible.</li>
          <li>Courier packaging.</li>
        </ul>
        <p>Please provide clear photographs showing the damage.</p>
        <p>This helps us investigate the issue with our delivery or production partners.</p>
        <p>Providing photographs does not remove any legal rights you may have.</p>

        <h2>4. Defective Products</h2>
        <p>Seasonedz Group respects the statutory warranty of quality provided by the South African Consumer Protection Act.</p>
        <p>
          Where the Consumer Protection Act applies and a product fails to
          meet the required quality standards within six months after
          delivery, the customer may return the product without penalty
          and at the supplier's risk and expense.
        </p>
        <p>Where the legal requirements are met, the customer may choose:</p>
        <ul>
          <li>Repair.</li>
          <li>Replacement.</li>
          <li>Refund.</li>
        </ul>
        <p>Where repair is not appropriate for the type of product, an applicable replacement or refund remedy may be provided.</p>
        <p>This statutory protection does not generally apply where a problem was caused by:</p>
        <ul>
          <li>Misuse.</li>
          <li>Deliberate damage.</li>
          <li>Normal wear.</li>
          <li>Improper storage.</li>
          <li>Unauthorised modification.</li>
          <li>Damage caused after the product left Seasonedz Group's control.</li>
        </ul>

        <h2>5. Products Not Suitable for an Agreed Purpose</h2>
        <p>
          If, before purchasing, you specifically informed Seasonedz Group
          that you required a product for a particular purpose and relied
          on our advice, rights under the Consumer Protection Act may
          apply if the product is unsuitable for that agreed purpose.
        </p>
        <p>Where the legal requirements are met, qualifying goods may be returned within 10 business days after delivery.</p>

        <h2>6. Opportunity to Examine Goods</h2>
        <p>Online customers may not have the opportunity to physically inspect products before delivery.</p>
        <p>
          Where South African consumer law gives you a right to reject
          goods because they do not match the type or quality reasonably
          contemplated by the transaction, Seasonedz Group will respect
          that right.
        </p>

        <h2>7. Change of Mind Returns</h2>
        <p>A customer does not have an automatic change of mind right for every product.</p>
        <p>Different legal rules apply depending on the product and how the transaction was concluded.</p>
        <p>
          For eligible products where the cooling off provisions of the
          Electronic Communications and Transactions Act apply, a customer
          may cancel without reason within seven days after receiving the
          goods, subject to the requirements of that Act.
        </p>
        <p>Where this statutory cooling off right applies, the customer is responsible for the direct cost of returning the goods.</p>

        <h2>8. Books and Colouring Books</h2>
        <p>
          South African electronic transaction cooling off provisions
          specifically exclude the sale of books, newspapers, periodicals
          and magazines from the general seven day ECTA cooling off right.
        </p>
        <p>This means that purchasing a book online does not automatically create a seven day change of mind return right under that provision.</p>
        <p>Seasonedz Group may consider a return of an unwanted physical book on a goodwill basis where:</p>
        <ul>
          <li>The book has not been used.</li>
          <li>The book has not been coloured in.</li>
          <li>The book is not damaged.</li>
          <li>The product is still in a condition suitable for resale.</li>
          <li>The return has been approved by Seasonedz Group before it is sent back.</li>
        </ul>
        <p>Approval of a goodwill return does not affect statutory rights concerning defective or incorrectly supplied books.</p>

        <h2>9. Used Colouring Books</h2>
        <p>A colouring book that has been:</p>
        <ul>
          <li>Coloured in.</li>
          <li>Written in.</li>
          <li>Torn through use.</li>
          <li>Marked.</li>
          <li>Altered.</li>
          <li>Damaged after delivery.</li>
        </ul>
        <p>normally cannot be returned simply because the customer changed their mind.</p>
        <p>This does not affect rights relating to a defect or problem that existed when the product was supplied.</p>

        <h2>10. Creative Supplies</h2>
        <p>Creative supplies such as markers and crayons may qualify for return where:</p>
        <ul>
          <li>They are defective.</li>
          <li>They were incorrectly supplied.</li>
          <li>They do not meet applicable legal quality requirements.</li>
        </ul>
        <p>Eligible non book products may also qualify for the statutory ECTA cooling off period where that provision applies.</p>
        <p>A product that has been substantially used cannot normally be returned purely because the customer changed their mind, except where a legal right to return remains applicable.</p>

        <h2>11. Personalised and Custom Products</h2>
        <p>Products created according to a customer's specifications or clearly personalised for that customer may be excluded from certain statutory change of mind cooling off rights.</p>
        <p>This may include products containing:</p>
        <ul>
          <li>A customer's photograph.</li>
          <li>Personalised text.</li>
          <li>Customer supplied artwork.</li>
          <li>Custom specifications.</li>
          <li>Individually produced designs.</li>
        </ul>
        <p>Once production of an approved custom item has begun, cancellation may be restricted where permitted by law.</p>
        <p>This does not remove rights where the product is defective, incorrectly produced or does not match the approved specification.</p>

        <h2>12. Gift Wrapping</h2>
        <p>Gift wrapping is an additional service attached to a physical product.</p>
        <p>Where a product is returned for a simple change of mind and there was no problem with the gift wrapping service, the gift wrapping charge may not necessarily be refundable where permitted by law.</p>
        <p>Where Seasonedz Group incorrectly performed the service, applicable consumer rights remain protected.</p>

        <h2>13. Digital Products</h2>
        <p>Digital colouring books and other downloadable products are treated differently from ordinary physical products.</p>
        <p>Where a digital product has already been downloaded, accessed or electronically supplied with the customer's agreement, change of mind cancellation rights may be limited where permitted by law.</p>
        <p>We will assist where:</p>
        <ul>
          <li>A valid download does not work.</li>
          <li>The file supplied is incorrect.</li>
          <li>The file is corrupted.</li>
          <li>The customer cannot access the purchased product because of a problem attributable to Seasonedz Group.</li>
        </ul>
        <p>Depending on the circumstances, we may:</p>
        <ul>
          <li>Restore access.</li>
          <li>Provide a replacement file.</li>
          <li>Correct the problem.</li>
          <li>Provide a refund where legally required.</li>
        </ul>
        <p>Customers should contact us before purchasing if they are unsure whether a digital product is suitable for their device or intended use.</p>

        <h2>14. Direct Marketing Purchases</h2>
        <p>Where a transaction results from direct marketing and section 16 of the Consumer Protection Act applies, a consumer may have a five business day cooling off period.</p>
        <p>This right applies only in the circumstances provided by law.</p>
        <p>Where the Electronic Communications and Transactions Act cooling off provisions apply instead, the applicable ECTA rules will govern that transaction.</p>

        <h2>15. Return Condition</h2>
        <p>Where the return is not based on a product defect or supplier error, Seasonedz Group may reasonably require the product to be returned:</p>
        <ul>
          <li>Complete.</li>
          <li>With relevant accessories.</li>
          <li>In suitable packaging.</li>
          <li>In a condition appropriate for the type of return.</li>
        </ul>
        <p>The amount refundable may be affected where the law allows a reasonable charge for use, consumption, depletion or necessary restoration of goods.</p>

        <h2>16. Return Delivery Costs</h2>
        <p>Who pays the cost of returning a product depends on the reason for the return.</p>
        <p>Where the product is defective, incorrect or otherwise returnable at Seasonedz Group's risk and expense under applicable law, Seasonedz Group will bear the required return costs.</p>
        <p>Where a customer exercises an applicable ECTA change of mind cooling off right, the customer may be responsible for the direct cost of returning the product.</p>
        <p>For a voluntary goodwill return, return delivery costs will normally be the customer's responsibility unless Seasonedz Group agrees otherwise.</p>

        <h2>17. Refunds</h2>
        <p>Where a refund is approved or legally required, it will normally be made using an appropriate payment method.</p>
        <p>Refund processing periods may depend on:</p>
        <ul>
          <li>The reason for the refund.</li>
          <li>Applicable legal requirements.</li>
          <li>The payment provider.</li>
          <li>Bank processing periods.</li>
        </ul>
        <p>Where section 44 of the Electronic Communications and Transactions Act applies, refunds due under that cooling off provision will be handled within the period required by that Act.</p>

        <h2>18. Exchanges</h2>
        <p>Where an exchange is agreed, availability depends on current stock.</p>
        <p>If the replacement product is unavailable, Seasonedz Group may provide an alternative remedy permitted by law, including an appropriate refund.</p>

        <h2>19. Promotional and Bundle Products</h2>
        <p>If a product was purchased as part of a bundle, promotion or discounted combination, the refund calculation may take the original promotional pricing into account.</p>
        <p>Where a whole bundle is returned, all relevant items may need to be returned.</p>
        <p>Nothing in this section limits statutory rights relating to defective or incorrectly supplied products.</p>

        <h2>20. Marketplace Purchases</h2>
        <p>This policy applies to orders placed directly through <a href="${businessInfo.websiteUrl}">${businessInfo.websiteDisplay}</a>.</p>
        <p>Where a Seasonedz Group product was purchased through a third party marketplace, the return request may need to be processed through that marketplace according to its procedures and applicable consumer law.</p>
        <p>Please check the order confirmation from the platform where the purchase was made.</p>

        <h2>21. Refund Abuse and Fraud</h2>
        <p>Seasonedz Group may investigate return or refund requests where there are reasonable grounds to suspect:</p>
        <ul>
          <li>Fraud.</li>
          <li>Product substitution.</li>
          <li>Deliberate damage.</li>
          <li>False claims.</li>
          <li>Repeated abuse of the return process.</li>
        </ul>
        <p>This does not affect legitimate consumer rights.</p>

        <h2>22. Complaints</h2>
        <p>If you believe a return or refund request has not been handled correctly, please contact Seasonedz Group so that we can review the matter.</p>
        <p>
          <strong>Email:</strong> <a href="${businessInfo.mailtoUrl}">${businessInfo.email}</a><br />
          <strong>WhatsApp:</strong> <a href="${businessInfo.whatsappUrl}">${businessInfo.phoneDisplay}</a><br />
          <strong>Telephone:</strong> <a href="${businessInfo.telUrl}">${businessInfo.phoneDisplay}</a>
        </p>
        <p>Nothing in this policy prevents a consumer from exercising rights available through an appropriate regulator, ombud, tribunal or court.</p>

        <h2>23. Seasonedz Group Details</h2>
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
