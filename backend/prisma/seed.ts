// Starter seed data for local/dev use. Mirrors the sample catalogue
// already shown on the frontend (src/data/categories.js and
// src/data/products.js) so the two stay conceptually in sync, even
// though nothing reads from this database yet — the frontend still
// runs entirely on its own static data files.
//
// Safe to re-run: categories and products are upserted by slug, tags
// are connected via connectOrCreate, and each product's images are
// replaced (not duplicated) on every run.

import { PrismaClient, ProductStatus } from "@prisma/client";

const prisma = new PrismaClient();

function slugifyTag(tag: string): string {
  return tag.toLowerCase().replace(/\s+/g, "-");
}

const categorySeeds = [
  {
    slug: "kids-colouring-books",
    name: "Kids Colouring Books",
    description: "Fun, educational colouring books for young learners.",
    imageUrl: "/images/product-1.jpg",
    sortOrder: 0,
  },
  {
    slug: "bible-colouring-books",
    name: "Bible Colouring Books",
    description: "Faith-based colouring books for children and families.",
    imageUrl: "/images/product-2.jpg",
    sortOrder: 1,
  },
  {
    slug: "mindfulness-colouring",
    name: "Mindfulness Colouring",
    description: "Calming, therapeutic colouring pages for relaxation.",
    imageUrl: "/images/product-3.jpg",
    sortOrder: 2,
  },
  {
    slug: "markers-and-crayons",
    name: "Markers and Crayons",
    description: "Vibrant, safe markers and crayons for creative colouring.",
    imageUrl: "/images/product-4.jpg",
    sortOrder: 3,
  },
  {
    slug: "bundles",
    name: "Bundles",
    description: "Colouring books and supplies bundled together at a better price.",
    imageUrl: "/images/product-6.jpg",
    sortOrder: 4,
  },
  {
    slug: "schools-and-wholesale",
    name: "Schools and Wholesale",
    description: "Classroom-ready packs for schools, churches and organisations.",
    imageUrl: "/images/product-1.jpg",
    sortOrder: 5,
  },
];

const productSeeds = [
  {
    sku: "SG-0001",
    slug: "abc-colouring-book-for-kids-with-fun-facts",
    name: "ABC Colouring Book for Kids with Fun Facts",
    categorySlug: "kids-colouring-books",
    price: "149.00",
    oldPrice: null,
    shortDescription: "A colourful A-Z colouring book packed with fun facts for little learners.",
    description:
      "Help your child learn their ABCs while having fun. Each letter comes with a large, easy-to-colour illustration and a bite-sized fun fact, making this book a favourite for home, pre-school and the classroom.",
    features: [
      "40 pages of colouring fun",
      "A fun fact printed on every page",
      "Thick, bleed-resistant paper",
      "Perfect for ages 3 to 8",
    ],
    ageRange: "3-8 years",
    stockQuantity: 50,
    images: ["/images/product-1.jpg", "/images/product-2.jpg", "/images/product-6.jpg"],
    tags: ["kids", "educational", "alphabet", "colouring book"],
    ratingAverage: "4.8",
    reviewCount: 36,
    isFeatured: true,
    isBestSeller: true,
    isNewArrival: false,
    discountLabel: null,
  },
  {
    sku: "SG-0002",
    slug: "mindfulness-colouring-book-for-adults",
    name: "Mindfulness Colouring Book for Adults",
    categorySlug: "mindfulness-colouring",
    price: "159.00",
    oldPrice: null,
    shortDescription: "Intricate, calming patterns designed to ease stress and encourage mindfulness.",
    description:
      "A beautifully illustrated colouring book for adults, featuring intricate mandalas and nature-inspired patterns. A screen-free way to unwind, focus and practise mindfulness after a long day.",
    features: [
      "50 intricate pattern pages",
      "Single-sided pages to prevent bleed-through",
      "Designed for coloured pencils and fine markers",
      "A relaxing, screen-free activity",
    ],
    ageRange: "16+ years",
    stockQuantity: 50,
    images: ["/images/product-3.jpg", "/images/product-5.jpg"],
    tags: ["mindfulness", "adult colouring", "relaxation", "self-care"],
    ratingAverage: "4.7",
    reviewCount: 52,
    isFeatured: true,
    isBestSeller: false,
    isNewArrival: false,
    discountLabel: null,
  },
  {
    sku: "SG-0003",
    slug: "little-hands-big-faith-old-testament-bible-colouring-book",
    name: "Little Hands Big Faith Old Testament Bible Colouring Book",
    categorySlug: "bible-colouring-books",
    price: "169.00",
    oldPrice: null,
    shortDescription: "Beloved Old Testament stories brought to life through colouring.",
    description:
      "From Noah's Ark to David and Goliath, this colouring book introduces children to well-loved Old Testament stories through warm, simple illustrations, ideal for Sunday school or family devotion time.",
    features: [
      "36 pages of Old Testament stories",
      "Simple illustrations suited to young colourists",
      "Great for Sunday school and family devotions",
      "Sturdy cover for regular use",
    ],
    ageRange: "4-10 years",
    stockQuantity: 50,
    images: ["/images/product-2.jpg", "/images/product-1.jpg"],
    tags: ["bible", "faith", "kids", "sunday school"],
    ratingAverage: "4.9",
    reviewCount: 41,
    isFeatured: false,
    isBestSeller: true,
    isNewArrival: false,
    discountLabel: null,
  },
  {
    sku: "SG-0004",
    slug: "little-hands-big-faith-new-testament-bible-colouring-book",
    name: "Little Hands Big Faith New Testament Bible Colouring Book",
    categorySlug: "bible-colouring-books",
    price: "169.00",
    oldPrice: null,
    shortDescription: "The life of Jesus and the New Testament, illustrated for little hands.",
    description:
      "A gentle introduction to the New Testament, from the Nativity to the parables of Jesus. Companion book to our Old Testament title, designed with the same warm, easy-to-colour illustration style.",
    features: [
      "36 pages of New Testament stories",
      "Companion to the Old Testament colouring book",
      "Simple illustrations suited to young colourists",
      "Great for Sunday school and family devotions",
    ],
    ageRange: "4-10 years",
    stockQuantity: 4,
    images: ["/images/product-2.jpg", "/images/product-1.jpg"],
    tags: ["bible", "faith", "kids", "sunday school"],
    ratingAverage: "4.9",
    reviewCount: 18,
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: true,
    discountLabel: null,
  },
  {
    sku: "SG-0005",
    slug: "acrylic-marker-set-24-colours",
    name: "Acrylic Marker Set 24 Colours",
    categorySlug: "markers-and-crayons",
    price: "249.00",
    oldPrice: "299.00",
    shortDescription: "A vibrant 24-colour acrylic marker set for bold, long-lasting colour.",
    description:
      "Bring any colouring book to life with this 24-colour acrylic marker set. Quick-drying, richly pigmented and long-lasting, these markers work beautifully on paper, card and craft projects.",
    features: [
      "24 vibrant, richly pigmented colours",
      "Quick-drying acrylic ink",
      "Fine and broad dual tips",
      "Comes in a reusable storage case",
    ],
    ageRange: "6+ years",
    stockQuantity: 50,
    images: ["/images/product-4.jpg", "/images/product-5.jpg"],
    tags: ["markers", "art supplies", "colouring"],
    ratingAverage: "4.6",
    reviewCount: 29,
    isFeatured: true,
    isBestSeller: false,
    isNewArrival: false,
    discountLabel: "Save R50",
  },
  {
    sku: "SG-0006",
    slug: "rotating-wax-crayons-12-colours",
    name: "Rotating Wax Crayons 12 Colours",
    categorySlug: "markers-and-crayons",
    price: "89.00",
    oldPrice: null,
    shortDescription: "No-mess, twist-up wax crayons in 12 classic colours.",
    description:
      "These twist-up wax crayons keep little hands clean and are perfect for on-the-go colouring. The rotating barrel means less breakage and less sharpening, making it a firm favourite with parents and teachers.",
    features: [
      "12 classic colours",
      "Twist-up barrel reduces breakage",
      "No sharpening or mess",
      "Comfortable, chunky grip for little hands",
    ],
    ageRange: "3+ years",
    stockQuantity: 50,
    images: ["/images/product-5.jpg", "/images/product-4.jpg"],
    tags: ["crayons", "art supplies", "kids"],
    ratingAverage: "4.5",
    reviewCount: 22,
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: true,
    discountLabel: null,
  },
  {
    sku: "SG-0007",
    slug: "abc-book-and-markers-bundle",
    name: "ABC Book and Markers Bundle",
    categorySlug: "bundles",
    price: "329.00",
    oldPrice: "398.00",
    shortDescription: "Our ABC colouring book paired with the 24-colour acrylic marker set.",
    description:
      "Everything a young learner needs in one bundle: the ABC Colouring Book for Kids with Fun Facts, paired with our 24-colour acrylic marker set, at a better price than buying separately.",
    features: [
      "Includes ABC Colouring Book for Kids with Fun Facts",
      "Includes Acrylic Marker Set 24 Colours",
      "Better value than buying individually",
      "A ready-made gift for birthdays or school",
    ],
    ageRange: "3-8 years",
    stockQuantity: 50,
    images: ["/images/product-6.jpg", "/images/product-1.jpg", "/images/product-4.jpg"],
    tags: ["bundle", "kids", "gift", "markers"],
    ratingAverage: "4.8",
    reviewCount: 15,
    isFeatured: false,
    isBestSeller: true,
    isNewArrival: false,
    discountLabel: "Bundle & Save",
  },
  {
    sku: "SG-0008",
    slug: "bible-colouring-book-bundle",
    name: "Bible Colouring Book Bundle",
    categorySlug: "bundles",
    price: "319.00",
    oldPrice: "338.00",
    shortDescription: "Both Little Hands Big Faith colouring books, Old and New Testament, together.",
    description:
      "The complete Little Hands Big Faith set: our Old Testament and New Testament Bible colouring books together in one bundle, perfect for Sunday school classes or as a thoughtful family gift.",
    features: [
      "Includes Old Testament Bible Colouring Book",
      "Includes New Testament Bible Colouring Book",
      "Great value for churches and Sunday schools",
      "A meaningful gift for young believers",
    ],
    ageRange: "4-10 years",
    stockQuantity: 4,
    images: ["/images/product-6.jpg", "/images/product-2.jpg"],
    tags: ["bundle", "bible", "faith", "gift"],
    ratingAverage: "4.9",
    reviewCount: 11,
    isFeatured: true,
    isBestSeller: false,
    isNewArrival: false,
    discountLabel: "Bundle & Save",
  },
  {
    sku: "SG-0009",
    slug: "mindfulness-book-and-markers-bundle",
    name: "Mindfulness Book and Markers Bundle",
    categorySlug: "bundles",
    price: "379.00",
    oldPrice: "408.00",
    shortDescription: "The mindfulness colouring book paired with the acrylic marker set.",
    description:
      "A relaxing self-care bundle combining our Mindfulness Colouring Book for Adults with the 24-colour acrylic marker set. A thoughtful gift, or a lovely way to treat yourself.",
    features: [
      "Includes Mindfulness Colouring Book for Adults",
      "Includes Acrylic Marker Set 24 Colours",
      "A ready-made self-care gift",
      "Better value than buying individually",
    ],
    ageRange: "16+ years",
    stockQuantity: 50,
    images: ["/images/product-6.jpg", "/images/product-3.jpg", "/images/product-4.jpg"],
    tags: ["bundle", "mindfulness", "gift", "markers"],
    ratingAverage: "4.7",
    reviewCount: 9,
    isFeatured: false,
    isBestSeller: false,
    isNewArrival: true,
    discountLabel: "Bundle & Save",
  },
  {
    sku: "SG-0010",
    slug: "school-starter-colouring-pack",
    name: "School Starter Colouring Pack",
    categorySlug: "schools-and-wholesale",
    price: "459.00",
    oldPrice: null,
    shortDescription: "A ready-made classroom pack of colouring books and crayons for schools.",
    description:
      "Designed for teachers and classrooms, this starter pack combines our most popular colouring books with rotating wax crayons, ready to hand out to a class. Wholesale and bulk pricing available on request.",
    features: [
      "Includes a set of ABC Colouring Books",
      "Includes Rotating Wax Crayons 12 Colours",
      "Designed for classroom use",
      "Wholesale pricing available for schools and churches",
    ],
    ageRange: "5-12 years",
    stockQuantity: 50,
    images: ["/images/product-1.jpg", "/images/product-5.jpg", "/images/product-6.jpg"],
    tags: ["schools", "wholesale", "classroom", "bundle"],
    ratingAverage: "4.8",
    reviewCount: 7,
    isFeatured: true,
    isBestSeller: true,
    isNewArrival: false,
    discountLabel: null,
  },
];

async function main() {
  for (const category of categorySeeds) {
    await prisma.category.upsert({
      where: { slug: category.slug },
      update: {
        name: category.name,
        description: category.description,
        imageUrl: category.imageUrl,
        sortOrder: category.sortOrder,
      },
      create: category,
    });
  }

  for (const product of productSeeds) {
    const category = await prisma.category.findUniqueOrThrow({
      where: { slug: product.categorySlug },
    });

    const tagConnections = product.tags.map((tag) => ({
      where: { slug: slugifyTag(tag) },
      create: { name: tag, slug: slugifyTag(tag) },
    }));

    const savedProduct = await prisma.product.upsert({
      where: { slug: product.slug },
      update: {
        sku: product.sku,
        name: product.name,
        description: product.description,
        shortDescription: product.shortDescription,
        price: product.price,
        oldPrice: product.oldPrice,
        stockQuantity: product.stockQuantity,
        status: ProductStatus.ACTIVE,
        ageRange: product.ageRange,
        features: product.features,
        categoryId: category.id,
        ratingAverage: product.ratingAverage,
        reviewCount: product.reviewCount,
        isFeatured: product.isFeatured,
        isBestSeller: product.isBestSeller,
        isNewArrival: product.isNewArrival,
        discountLabel: product.discountLabel,
        tags: { connectOrCreate: tagConnections },
      },
      create: {
        sku: product.sku,
        slug: product.slug,
        name: product.name,
        description: product.description,
        shortDescription: product.shortDescription,
        price: product.price,
        oldPrice: product.oldPrice,
        stockQuantity: product.stockQuantity,
        status: ProductStatus.ACTIVE,
        ageRange: product.ageRange,
        features: product.features,
        categoryId: category.id,
        ratingAverage: product.ratingAverage,
        reviewCount: product.reviewCount,
        isFeatured: product.isFeatured,
        isBestSeller: product.isBestSeller,
        isNewArrival: product.isNewArrival,
        discountLabel: product.discountLabel,
        tags: { connectOrCreate: tagConnections },
      },
    });

    await prisma.productImage.deleteMany({ where: { productId: savedProduct.id } });
    await prisma.productImage.createMany({
      data: product.images.map((url, index) => ({
        productId: savedProduct.id,
        url,
        isPrimary: index === 0,
        sortOrder: index,
      })),
    });
  }

  const categoryCount = await prisma.category.count();
  const productCount = await prisma.product.count();
  console.log(`Seed complete: ${categoryCount} categories, ${productCount} products.`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
