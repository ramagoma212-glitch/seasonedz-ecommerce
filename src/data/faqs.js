// FAQ data for the FAQ page, grouped by category so related questions
// sit together. Each item's `category` groups it into a section on the
// FAQ page — add new items under an existing category, or introduce a
// new one, and the page picks it up automatically.

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
      "This is a frontend demo store, so orders placed here are for preview purposes only. Once real ordering goes live, we'll add clear guidance on changes and cancellations.",
  },
  {
    category: "Delivery",
    question: "Do you deliver countrywide in South Africa?",
    answer:
      "We're focused on delivering across South Africa. Exact courier coverage will be confirmed once courier integration is complete.",
  },
  {
    category: "Delivery",
    question: "How much does delivery cost?",
    answer:
      "Standard delivery is a flat rate, with free delivery on orders over R700. See our Shipping Policy for full details.",
  },
  {
    category: "Payment",
    question: "What payment methods will you accept?",
    answer:
      "We're preparing options including PayFast and bank transfer. Real online payment isn't connected yet — this site currently shows a demo checkout only.",
  },
  {
    category: "Returns",
    question: "What is your returns policy?",
    answer:
      "If an item arrives damaged or incorrect, we want to make it right. See our Returns Policy page for guidance, and contact us directly to arrange it.",
  },
  {
    category: "School Orders",
    question: "Do you offer bulk pricing for schools?",
    answer:
      "Yes — we're happy to discuss bulk orders for preschools, primary schools and aftercare centres. Visit our Schools page or contact us for a quote.",
  },
  {
    category: "Wholesale",
    question: "Can I stock Seasonedz Group products in my shop?",
    answer:
      "We welcome enquiries from bookshops, educational stores, church shops and stationery stores. Visit our Wholesale page to get in touch.",
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
      "Yes. Our colouring books are designed to combine creativity with learning — from fun facts and alphabet practice to Bible stories and mindfulness patterns.",
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
      "This site's checkout is currently a frontend demo — details are stored only in your browser's Local Storage and no real payment is taken. See our Privacy Policy for more detail.",
  },
  {
    category: "Order Tracking",
    question: "How can I track my order?",
    answer:
      "Use our Track Order page with the order number from your confirmation page. Note that this is currently a demo tracking experience, not live courier tracking.",
  },
];
