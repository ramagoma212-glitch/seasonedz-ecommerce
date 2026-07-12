// Sample blog post data. Each post has a short `excerpt` for the blog
// listing cards and a `content` array of paragraphs for the full post
// page — kept as plain paragraph strings (not HTML) so rendering stays
// simple and safe.

import { withBase } from "../js/paths.js";

export const blogPosts = [
  {
    id: "post-1",
    title: "5 Ways Colouring Books Support Early Childhood Learning",
    slug: "colouring-books-support-early-learning",
    category: "Educational Colouring",
    excerpt: "Discover how colouring activities build fine motor skills and focus.",
    image: "/images/product-1.jpg",
    date: "2026-01-15",
    content: [
      "Colouring is often seen as simple play, but it does a lot of quiet work in the background. For young children, holding a crayon or marker and staying inside the lines builds the fine motor control they'll later use for writing.",
      "Colouring books that pair pictures with letters, numbers or fun facts also give children a gentle way to absorb new information without it feeling like a lesson. That's the idea behind our ABC Colouring Book for Kids with Fun Facts — each page combines a letter, an illustration and a bite-sized fact.",
      "Beyond the academic side, colouring gives children a calm, screen-free activity that helps them practise patience and focus — skills that carry over into the classroom and beyond.",
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
    content: [
      "Sunday school teachers know that keeping young minds engaged with scripture takes creativity. Colouring pages are a simple, low-prep way to reinforce a Bible story after it's been told.",
      "Our Little Hands Big Faith series pairs simple, warm illustrations with well-loved Old and New Testament stories, giving children something to take home that reminds them of what they learned.",
      "A few practical tips: introduce the story first, then hand out the matching colouring page while the story is still fresh. Encourage children to talk about the scene as they colour — it often opens up conversation more naturally than a worksheet would.",
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
    content: [
      "Mindfulness colouring books have grown in popularity as a screen-free way to slow down. The repetitive, focused nature of filling in intricate patterns gives your mind something gentle to settle on.",
      "Unlike a blank page, a printed pattern removes the pressure to 'be creative' — you simply choose colours and fill in shapes at your own pace. Many people find this genuinely relaxing after a long day.",
      "Our Mindfulness Colouring Book for Adults features nature-inspired patterns and mandalas designed for exactly this kind of unhurried, screen-free unwinding.",
      "You don't need to be an artist to benefit — just a quiet corner, a cup of tea, and a set of markers or pencils.",
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
    content: [
      "Creative activities like colouring give children a break from structured tasks while still keeping them engaged and calm — useful for transitions between lessons or as an early-finisher activity.",
      "Classroom colouring packs, like our School Starter Colouring Pack, are designed to make this easy: a set of colouring books and crayons ready to hand out without extra prep.",
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
    content: [
      "Not all colouring supplies are created equal, especially for younger children. Chunky, twist-up crayons like our Rotating Wax Crayons are easier for little hands to grip and don't need sharpening.",
      "For older children who want bolder colour, acrylic markers offer vibrant, richly pigmented lines — our 24-colour set includes both fine and broad tips for different styles of colouring.",
      "It's worth matching supplies to the activity: crayons for everyday colouring books, and markers for bigger, bolder projects or mindfulness patterns where colour saturation matters more.",
      "Whatever you choose, always check the recommended age range on the product page before buying.",
    ],
  },
].map((post) => ({ ...post, image: withBase(post.image) }));
