/** The address people reach the site at: what links in emails point to. */
export const siteUrl = (): string => (process.env.KESTREL_SITE_URL?.trim() || "https://kestrel.zeroanomaly.tech").replace(/\/+$/, "");
