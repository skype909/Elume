const RESERVED_SUBDOMAINS = new Set(["www", "api", "admin", "platform"]);
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
const VALID_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function validSlug(value: string | null) {
  const slug = (value || "").trim().toLowerCase();
  return VALID_SLUG.test(slug) ? slug : null;
}

/** Resolve presentation-only school context. It never affects authorization. */
export function resolveSchoolBrandingSlug(location: Location = window.location): string | null {
  const hostname = location.hostname.toLowerCase();
  if (LOCAL_HOSTS.has(hostname)) {
    return validSlug(new URLSearchParams(location.search).get("school"));
  }

  const labels = hostname.split(".");
  if (labels.length !== 3 || labels[1] !== "elume" || labels[2] !== "ie") return null;
  const candidate = labels[0];
  if (RESERVED_SUBDOMAINS.has(candidate)) return null;
  return validSlug(candidate);
}

export function normalElumeLoginUrl(location: Location = window.location) {
  if (LOCAL_HOSTS.has(location.hostname.toLowerCase())) {
    return `${location.origin}${location.pathname}${location.hash}`;
  }
  return `${location.protocol}//elume.ie/#/`;
}
