// FAQ data for the FAQ page, grouped by category so related questions
// sit together. Each item's `category` groups it into a section on the
// FAQ page — add new items under an existing category, or introduce a
// new one, and the page picks it up automatically.

import { businessInfo } from "./businessInfo.js";

export const faqs = [
  {
    category: "Ordering",
    question: "Do I need an account to place an order?",
    answer:
      "No. Seasonedz Group supports guest checkout, so you can order without creating an account or logging in.",
  },
  {
    category: "Ordering",
    question: "Can I change or cancel my order after placing it?",
    answer:
      "Contact Seasonedz Group as soon as possible after placing your order. Orders are prepared for delivery once payment is confirmed, so the sooner you reach us, the more we can help.",
  },
  {
    category: "Delivery",
    question: "Do you deliver countrywide in South Africa?",
    answer:
      "We're focused on delivering across South Africa. We use The Courier Guy for courier deliveries where applicable, alongside other couriers as needed.",
  },
  {
    category: "Delivery",
    question: "How much does delivery cost, and when is it free?",
    answer:
      "Courier Guy Locker to Locker and Courier Guy Door to Door both carry a delivery fee, free once your qualifying products reach a set amount — the same rule for every customer, guest or signed in. Customer Collection in Pretoria or Thohoyandou is always free, by arrangement. See our Shipping Policy page for the current fees and free-delivery threshold.",
  },
  {
    category: "Delivery",
    question: "How is my order delivered?",
    answer:
      "Orders are dispatched within 1 to 2 working days via The Courier Guy. You'll receive your tracking number on WhatsApp and email once your order ships, and delivery usually takes 2 to 4 working days in main centres.",
  },
  {
    category: "Delivery",
    question: "Can I track my delivery?",
    answer:
      "Yes — once your order ships, you'll receive your tracking number on WhatsApp and email. You can also look up your order anytime on our Track Order page using your order number.",
  },
  {
    category: "Delivery",
    question: "What if my delivery address is wrong?",
    answer: `Contact Seasonedz Group as soon as possible so we can correct it before your order is dispatched. Email: <a href="${businessInfo.mailtoUrl}">${businessInfo.email}</a> WhatsApp: <a href="${businessInfo.whatsappUrl}" target="_blank" rel="noopener noreferrer">${businessInfo.phoneDisplay}</a>.`,
  },
  {
    category: "Delivery",
    question: "Who do I contact for delivery help?",
    answer: `Seasonedz Group handles all delivery arrangements directly. Email: <a href="${businessInfo.mailtoUrl}">${businessInfo.email}</a> WhatsApp: <a href="${businessInfo.whatsappUrl}" target="_blank" rel="noopener noreferrer">${businessInfo.phoneDisplay}</a>.`,
  },
  {
    category: "Payment",
    question: "What payment methods will you accept?",
    answer:
      "You can pay online using PayFast. We also support manual bank transfer where available. All payment options are shown clearly at checkout.",
  },
  {
    category: "Returns",
    question: "What is your returns policy?",
    answer:
      "If an item arrives damaged or incorrect, we want to make it right. See our Returns Policy page for guidance, and contact us directly to arrange it.",
  },
  {
    category: "Support",
    question: "How can I contact Seasonedz Group for support?",
    answer: `For help with orders, school orders, bulk orders or product questions, contact Seasonedz Group. Email: <a href="${businessInfo.mailtoUrl}">${businessInfo.email}</a> WhatsApp: <a href="${businessInfo.whatsappUrl}" target="_blank" rel="noopener noreferrer">${businessInfo.phoneDisplay}</a>. Our details are also in the footer of every page. We're a small team, so please allow us a little time to respond.`,
  },
  {
    category: "School Orders",
    question: "Do you offer bulk pricing for schools, churches or bulk gifts?",
    answer:
      "Yes. We're happy to discuss bulk pricing for preschools, primary schools, aftercare centres, churches and Sunday schools, or for educational gifts bought in bulk. Visit our Schools page or contact us for a quote.",
  },
  {
    category: "Wholesale",
    question: "Can I stock Seasonedz Group products in my shop?",
    answer:
      'We welcome enquiries from bookshops, educational stores, church shops and stationery stores. Visit our <a href="/wholesale">Wholesale page</a> to get in touch.',
  },
  {
    category: "Distributor",
    question: "How do I enquire about becoming a distributor?",
    answer:
      "Visit our Distributor page and send us an enquiry with your company name, region and distribution experience. Every distributor enquiry is reviewed personally by the Seasonedz Group team, and we'll respond once we've had a chance to review it.",
  },
  {
    category: "Product Age Ranges",
    question: "How do I know which products suit my child's age?",
    answer:
      "Every product page lists a recommended age range, so you can choose colouring books and supplies that suit your child or classroom.",
  },
  {
    category: "Colouring Books",
    question: "Are your colouring books educational?",
    answer:
      "Yes. Our colouring books are designed to combine creativity with learning, from fun facts and alphabet practice to Bible stories and mindfulness patterns.",
  },
  {
    category: "Markers",
    question: "Are your markers and crayons safe for children?",
    answer:
      "Our markers and crayons are chosen for everyday classroom and home use. Always check individual product pages for age recommendations.",
  },
  {
    category: "Guest Checkout",
    question: "Is guest checkout secure?",
    answer:
      "Yes. Guest checkout sends your order details securely to the Seasonedz Group backend, no account or password needed. Bank Transfer places a real order without taking an online payment. See our Privacy Policy for more detail.",
  },
  {
    category: "Order Tracking",
    question: "How can I track my order?",
    answer:
      "You'll receive your tracking number on WhatsApp and email once your order ships. You can also use our Track Order page with the order number from your confirmation page to see its current status.",
  },
];
