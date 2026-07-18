// Schools page: speaks to preschools, primary schools, teachers,
// aftercare centres and learning centres about bulk/classroom orders.

import { renderEnquiryForm } from "../components/enquiryForm.js";
import { renderContactSupportNote } from "../components/contactSupportNote.js";

export function renderSchools() {
  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">Seasonedz Group for Schools</h1>
      <p class="stub-page__text">
        Educational colouring books and creative supplies for preschools,
        primary schools, teachers, aftercare centres and learning centres.
      </p>

      <div class="info-page__body">
        <h2>Built for the Classroom</h2>
        <p>
          Our colouring books are designed with learning in mind, from
          alphabet and fun fact books for young learners to Bible colouring
          books for Sunday school, church groups and faith based
          activities. They're an easy way to bring a calm, creative
          activity into a busy day.
        </p>

        <h2>Bulk Orders for Schools</h2>
        <p>
          If you need colouring books, markers or crayons for a whole class,
          grade or kids programme, we're happy to discuss bulk pricing.
          Whether you're equipping one classroom or an entire school, or
          looking for educational gifts to hand out, get in touch and
          we'll work out what suits you.
        </p>

        <h2>Ready-Made School Packs</h2>
        <p>
          Our School Starter Colouring Pack bundles our most popular
          colouring books with crayons, ready to hand out to a class. It's
          a simple starting point for classroom use, take a look on our
          <a href="#/shop?category=schools-and-wholesale">Shop page</a>.
        </p>

        <h2>Who We Work With</h2>
        <ul>
          <li>Preschools and early learning centres</li>
          <li>Primary schools</li>
          <li>Individual teachers and classrooms</li>
          <li>Aftercare centres</li>
          <li>Learning and tutoring centres</li>
          <li>Church groups and Sunday school programmes</li>
          <li>Kids programmes and holiday clubs</li>
        </ul>
      </div>

      <div class="contact-layout">
        <div class="info-page__body">
          <h2>Let's Talk</h2>
          <p>
            Tell us a little about your school, church group or classroom
            and what you're looking for, using the form below or WhatsApp,
            and we'll be in touch to discuss options and pricing.
          </p>
          ${renderContactSupportNote("Prefer to reach us directly?")}
        </div>

        ${renderEnquiryForm({
          heading: "School Enquiry",
          orgLabel: "School / Organisation Name",
          orgPlaceholder: "e.g. Sunnyside Primary School",
          ctaText: "Send School Enquiry",
          idPrefix: "school",
          type: "SCHOOL",
          showQuantityField: true,
        })}
      </div>
    </section>
  `;
}
