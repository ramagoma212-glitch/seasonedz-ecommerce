// About page: brand story, mission, who we serve, and why educational
// colouring matters, ending with a call to action to shop.

export function renderAbout() {
  return `
    <section class="stub-page container">
      <h1 class="stub-page__title">About Seasonedz Group</h1>
      <p class="stub-page__text">
        Educational colouring books, Bible colouring books, mindfulness
        colouring books, markers, crayons and creative learning products —
        made for parents, teachers, schools, churches and anyone who loves
        to colour.
      </p>

      <div class="info-page__body">
        <h2>Our Story</h2>
        <p>
          Seasonedz Group started with a simple idea: colouring shouldn't
          just be something to keep children busy — it can genuinely help
          them learn, reflect and grow. From there, our range has grown to
          include colouring books for young learners, faith-based colouring
          books for Sunday school, mindfulness colouring for adults, and the
          markers and crayons that bring it all to life.
        </p>

        <h2>Our Mission</h2>
        <p>
          We want to make it easy for families, teachers and churches to
          find colouring books and creative supplies that are educational,
          well made and genuinely enjoyable to use — whether that's a
          classroom of Grade 1 learners, a Sunday school class, or an adult
          winding down after a long day.
        </p>

        <h2>Who We're For</h2>
        <p>We create products for a wide range of people, including:</p>
        <ul>
          <li>Parents looking for screen-free, educational activities</li>
          <li>Teachers and preschools wanting classroom-ready resources</li>
          <li>Churches and Sunday school teachers</li>
          <li>Aftercare and learning centres</li>
          <li>Gift buyers looking for something thoughtful and creative</li>
          <li>Adults who enjoy mindfulness colouring to unwind</li>
        </ul>

        <h2>Why Educational Colouring Matters</h2>
        <p>
          Colouring does more than fill a quiet afternoon. It helps develop
          fine motor skills, supports focus and patience, and — when paired
          thoughtfully with letters, Bible stories or calming patterns — can
          reinforce learning or simply help someone slow down. That's the
          thinking behind every product we make.
        </p>

        <div class="grid grid--3 about-trust">
          <div class="trust-item">
            <div class="trust-item__icon" aria-hidden="true">&#10003;</div>
            <h4 class="trust-item__title">Thoughtfully Designed</h4>
            <p class="trust-item__text">Every product is designed with a clear educational or wellbeing purpose.</p>
          </div>
          <div class="trust-item">
            <div class="trust-item__icon" aria-hidden="true">&#127968;</div>
            <h4 class="trust-item__title">South African</h4>
            <p class="trust-item__text">A South African business, built for South African families, schools and churches.</p>
          </div>
          <div class="trust-item">
            <div class="trust-item__icon" aria-hidden="true">&#9825;</div>
            <h4 class="trust-item__title">Growing With You</h4>
            <p class="trust-item__text">We're building this site and range step by step, with your feedback in mind.</p>
          </div>
        </div>

        <div class="info-page__cta">
          <h2>Ready to Explore?</h2>
          <p>Browse our colouring books, markers and crayons, or get in touch if you have any questions.</p>
          <a class="btn btn--primary" href="#/shop">Shop Now</a>
        </div>
      </div>
    </section>
  `;
}
