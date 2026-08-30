/**
 * Asset-tag QR codes point at https://austinhams.org/equipment/?00132 — a bare
 * query string with no key. Those get sent to the gear inventory; a scan with
 * no tag (or a malformed one) falls through to the static /equipment/ page.
 */
const ASSET_TAG = /^[A-Za-z0-9-]{1,32}$/;

export function onRequestGet(context) {
  const tag = new URL(context.request.url).search.slice(1);

  // Guard the pattern: without it, a crafted query string turns this into an
  // open redirect / path injection against gear.austinhams.org.
  if (!ASSET_TAG.test(tag)) {
    return context.next();
  }

  return Response.redirect(`https://gear.austinhams.org/assettag/${tag}`, 302);
}
