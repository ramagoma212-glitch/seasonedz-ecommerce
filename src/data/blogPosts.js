// Sample blog post data. Each post has a short `excerpt` for the blog
// listing cards and a `content` array of paragraphs for the full post
// page — kept as plain paragraph strings (not HTML) so rendering stays
// simple and safe.
//
// Version 7, Milestone 171I: `relatedLink` — each post already
// naturally discusses one real product family (e.g. post-1 mentions
// the ABC Colouring Book by name in its own text); this is the one
// genuinely relevant category/page a reader would want next, used by
// blogPost.js's own bottom CTA instead of a generic "/shop" link —
// real internal linking from content to commerce (Blog -> Category),
// per the milestone brief, without needing to turn plain-text content
// paragraphs into HTML just to add inline links.

import { withBase } from "../js/paths.js";

export const blogPosts = [
  {
    id: "post-1",
    // Milestone 198.2 pre-launch audit fix: was "5 Ways Colouring Books
    // Support Early Childhood Learning" — the body only ever had 4
    // unstructured paragraphs, never 5 enumerated points. Retitled to
    // match the actual content rather than restructuring the content
    // to force a 5th point (which would risk inventing a new claim).
    title: "How Colouring Books Support Early Childhood Learning",
    slug: "colouring-books-support-early-learning",
    category: "Educational Colouring",
    excerpt: "Discover how colouring activities build fine motor skills and focus.",
    image: "/images/product-1.jpg",
    date: "2026-01-15",
    relatedLink: { href: "/category/kids-colouring-books", label: "Shop Kids & Educational Colouring Books" },
    content: [
      "Colouring is often seen as simple play, but it does a lot of quiet work in the background. For young children, holding a crayon or marker and staying inside the lines builds the fine motor control they'll later use for writing.",
      "Colouring books that pair pictures with letters, numbers or fun facts also give children a gentle way to absorb new information without it feeling like a lesson. That's the idea behind our ABC Colouring Book for Kids with Fun Facts. Each page combines a letter, an illustration and a bite-sized fact.",
      "Beyond the academic side, colouring gives children a calm, screen-free activity that helps them practise patience and focus, skills that carry over into the classroom and beyond.",
      "As always, choose colouring books and supplies suited to your child's age, and enjoy the process together where you can.",
    ],
  },
  {
    id: "post-2",
    title: "Using Bible Colouring Books in Sunday School",
    slug: "bible-colouring-books-in-sunday-school",
    category: "Bible Learning",
    excerpt: "Practical tips for teachers integrating colouring into scripture lessons.",
    image: "/images/product-2.jpg",
    date: "2026-02-02",
    relatedLink: { href: "/category/bible-colouring-books", label: "Shop Bible Colouring Books" },
    content: [
      "Sunday school teachers know that keeping young minds engaged with scripture takes creativity. Colouring pages are a simple, low-prep way to reinforce a Bible story after it's been told.",
      "Our Little Hands Big Faith series pairs simple, warm illustrations with well-loved Old and New Testament stories, giving children something to take home that reminds them of what they learned.",
      "A few practical tips: introduce the story first, then hand out the matching colouring page while the story is still fresh. Encourage children to talk about the scene as they colour. This often opens up conversation more naturally than a worksheet would.",
      "Whether you're planning a single lesson or a full term, colouring pages are an easy addition to any Sunday school toolkit.",
    ],
  },
  {
    id: "post-3",
    title: "The Calming Power of Mindfulness Colouring",
    slug: "calming-power-of-mindfulness-colouring",
    category: "Mindfulness",
    excerpt: "Why intricate colouring patterns have become a popular way for adults to unwind.",
    image: "/images/product-3.jpg",
    date: "2026-03-10",
    relatedLink: { href: "/category/mindfulness-colouring", label: "Shop Mindfulness Colouring Books" },
    content: [
      "Mindfulness colouring books have grown in popularity as a screen-free way to slow down. The repetitive, focused nature of filling in intricate patterns gives your mind something gentle to settle on.",
      "Unlike a blank page, a printed pattern removes the pressure to 'be creative'. You simply choose colours and fill in shapes at your own pace. Many people find this genuinely relaxing after a long day.",
      "Our Mindfulness Colouring Book for Adults features nature-inspired patterns and mandalas designed for exactly this kind of unhurried, screen-free unwinding.",
      "You don't need to be an artist to benefit, just a quiet corner, a cup of tea, and a set of markers or pencils.",
    ],
  },
  {
    id: "post-4",
    title: "Bringing Creativity Into Your Classroom",
    slug: "bringing-creativity-into-your-classroom",
    category: "School Creativity",
    excerpt: "Simple ways teachers can use colouring activities to support classroom learning.",
    image: "/images/product-6.jpg",
    date: "2026-04-05",
    relatedLink: { href: "/schools", label: "See Schools & Churches Bulk Packs" },
    content: [
      "Creative activities like colouring give children a break from structured tasks while still keeping them engaged and calm, useful for transitions between lessons or as an early-finisher activity.",
      "Ready-made bundles, like our Old Testament Bible Colouring Book and 24 Acrylic Markers Bundle, are designed to make this easy: a colouring book and markers ready to hand out without extra prep.",
      "Consider setting up a small 'creative corner' with colouring supplies that children can use during quiet time. It's a simple way to bring a bit of calm and creativity into a busy school day.",
      "If you're planning for a full class or grade, our Schools page has more on bulk packs and how to get in touch for a quote.",
    ],
  },
  {
    id: "post-5",
    title: "Choosing the Right Markers and Crayons for Little Hands",
    slug: "choosing-markers-and-crayons-for-little-hands",
    category: "Product Tips",
    excerpt: "A few things to consider when picking colouring supplies for young children.",
    image: "/images/product-4.jpg",
    date: "2026-05-18",
    relatedLink: { href: "/category/markers-and-crayons", label: "Shop Markers & Crayons" },
    content: [
      "Not all colouring supplies are created equal, especially for younger children. Chunky, twist-up crayons like our Rotating Wax Crayons are easier for little hands to grip and don't need sharpening.",
      "For older children who want bolder colour, acrylic markers offer vibrant, richly pigmented lines, available in our 24 or 60 colour sets.",
      "It's worth matching supplies to the activity: crayons for everyday colouring books, and markers for bigger, bolder projects or mindfulness patterns where colour saturation matters more.",
      "Whatever you choose, always check the recommended age range on the product page before buying.",
    ],
  },
  {
    id: "post-6",
    title: "How to Choose Colouring Books by Age",
    slug: "how-to-choose-colouring-books-by-age",
    category: "Buying Guides",
    excerpt: "A practical guide to matching colouring books to a child's (or adult's) age and stage.",
    image: "/images/product-5.jpg",
    date: "2026-06-12",
    relatedLink: { href: "/shop", label: "Shop All Colouring Books" },
    content: [
      "With so many colouring books available, it helps to think less about the pictures on the cover and more about what a reader at a given age and stage actually needs from the page in front of them.",
      "For the youngest colourers, around preschool and early foundation phase, look for larger, simpler shapes and a clear, chunky outline that's easy to stay inside. Pairing colouring with an early-literacy skill, like our ABC Colouring Book for Kids with Fun Facts does with alphabet tracing and a short fact on each page, gives the activity a second, gentle purpose beyond colouring in.",
      "As children move into early primary school, they can usually manage more detail and a bit more reading alongside the pictures. Our Little Hands, Big Faith Old and New Testament Bible Colouring Books are built for this stage, combining a simplified Bible story with reading, writing and prayer prompts a child that age can follow with a bit of guidance.",
      "Older children and teens often want something that feels less 'babyish' without jumping straight to fully abstract adult patterns, so a good middle step is a book with more intricate scenes but still a recognisable subject, rather than pure geometric pattern work.",
      "For adults, intricate, abstract designs like mandalas and nature patterns, the kind found in our Mindfulness Colouring Book for Adults, tend to work better than anything aimed at children. There's no story to follow, just a pattern to settle into at your own pace, over as many sittings as you like.",
      "Whatever the age, it's worth checking the recommended age range stated on each product page rather than guessing from the cover art alone, since page complexity and subject matter vary a lot even within what looks like a similar type of book.",
    ],
  },
  {
    id: "post-7",
    title: "How to Use Acrylic Paint Markers",
    slug: "how-to-use-acrylic-paint-markers",
    category: "Product Tips",
    excerpt: "Simple techniques for getting clean, lasting results from acrylic paint markers.",
    image: "/images/product-3.jpg",
    date: "2026-07-03",
    relatedLink: { href: "/category/markers-and-crayons", label: "Shop Markers & Crayons" },
    content: [
      "Acrylic paint markers are more versatile than ordinary felt-tip colouring pens, but a few simple habits make a real difference to how clean and even your results turn out.",
      "Start by shaking the marker and following any activation instructions that came with it, then test the ink on a small, hidden area of whatever you're colouring on first. Our markers use a water-based acrylic ink designed to resist bleeding on suitable surfaces, but results genuinely do vary by material, so a quick test takes the guesswork out before you commit to the main page or project.",
      "On paper and card, usually in a colouring book, the ink dries quickly and handles normal layering well. On smoother, non-porous surfaces like glass, ceramic or plastic, clean the surface first and let each layer dry before adding the next, rather than trying to build up colour in one pass.",
      "If you're decorating something that needs to hold up to regular handling, like a mug or a wooden sign, a suitable craft sealer applied afterwards can add extra durability. One important exception: anything decorative on a mug, glass or plate should stay away from areas that actually touch food, drink or the mouth, since these are craft markers, not food-safe paint.",
      "Between sessions, replace the caps firmly so the ink doesn't dry out, and store the set in its own carry case rather than loose in a drawer, this keeps the tips in good condition for longer and makes it easier to find the colour you want next time.",
      "Pair the markers with a colouring book for a complete activity, our Old Testament and New Testament Bible Colouring Book bundles and the ABC Colouring Book and Rotating Crayons Bundle both combine a book with supplies in one ready-to-use set.",
    ],
  },
].map((post) => ({ ...post, image: withBase(post.image) }));
