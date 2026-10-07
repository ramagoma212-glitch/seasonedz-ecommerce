// Milestone 203: submits the current sitemap URLs to IndexNow after a
// successful deploy, so Bing (and Yandex, which IndexNow shares
// submissions with) can pick up changes faster than waiting for their
// own crawl schedule. Google has stated it is "exploring" IndexNow but
// does not consume it today — this script is Bing/Yandex-only by the
// protocol's own current scope, not a Google mechanism.
//
// Deliberately run AFTER deploy-pages succeeds (see the "deploy" job
// in .github/workflows/deploy.yml, which has no local dist/ — only the
// build job does) and fetches the sitemap + key file from the LIVE
// site rather than a local build artifact, so this can only ever
// submit URLs that are genuinely already live — never a pre-deploy
// promise of pages that don't exist yet.
//
// Never fails the deploy: IndexNow is a courtesy ping, not a
// requirement — a network error, a non-2xx response, or the key file
// not yet being live (a fresh key submitted in the same deploy that
// creates it) all just log a warning and exit 0. The real sitemap and
// the real pages are the only things search engines actually need;
// this is a nice-to-have acceleration, never a blocker.

const SITE_HOST = "www.seasonedzgroup.co.za";
const SITE_URL = `https://${SITE_HOST}`;
// Must match the key file actually published at public/<key>.txt — see
// the live-fetch check below, which refuses to submit if the two have
// drifted apart.
const INDEXNOW_KEY = "f54bda2221889d3cf92f97a03867c0a9";
const KEY_LOCATION = `${SITE_URL}/${INDEXNOW_KEY}.txt`;
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

function extractSitemapUrls(xml) {
  const matches = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)];
  return matches.map((m) => m[1]);
}

async function main() {
  let keyResponse;
  try {
    keyResponse = await fetch(KEY_LOCATION);
  } catch (error) {
    console.warn(`[submit-indexnow] Could not reach the live key file (${error.message}) — skipping submission.`);
    return;
  }
  if (!keyResponse.ok) {
    console.warn(`[submit-indexnow] Live key file returned HTTP ${keyResponse.status} — skipping submission rather than pinging search engines with a key they can't verify.`);
    return;
  }
  const liveKey = (await keyResponse.text()).trim();
  if (liveKey !== INDEXNOW_KEY) {
    console.warn("[submit-indexnow] Live key file content does not match this script's key — skipping submission.");
    return;
  }

  let sitemapResponse;
  try {
    sitemapResponse = await fetch(`${SITE_URL}/sitemap.xml`);
  } catch (error) {
    console.warn(`[submit-indexnow] Could not reach the live sitemap (${error.message}) — skipping submission.`);
    return;
  }
  if (!sitemapResponse.ok) {
    console.warn(`[submit-indexnow] Live sitemap returned HTTP ${sitemapResponse.status} — skipping submission.`);
    return;
  }

  const xml = await sitemapResponse.text();
  const urlList = extractSitemapUrls(xml);
  if (urlList.length === 0) {
    console.warn("[submit-indexnow] Sitemap contained no URLs — skipping submission.");
    return;
  }

  const body = JSON.stringify({ host: SITE_HOST, key: INDEXNOW_KEY, keyLocation: KEY_LOCATION, urlList });

  try {
    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body,
    });
    if (response.ok || response.status === 202) {
      console.log(`[submit-indexnow] Submitted ${urlList.length} URL(s) to IndexNow — HTTP ${response.status}.`);
    } else {
      console.warn(`[submit-indexnow] IndexNow responded HTTP ${response.status} — not treated as a deploy failure.`);
    }
  } catch (error) {
    console.warn(`[submit-indexnow] IndexNow submission failed (${error.message}) — not treated as a deploy failure.`);
  }
}

await main();
