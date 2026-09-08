import { lookup } from 'node:dns/promises';
import https from 'node:https';
import ipaddr from 'ipaddr.js';

export const isPublicAddress = (address: string): boolean => {
  try {
    return ipaddr.process(address).range() === 'unicast';
  } catch {
    return false;
  }
};
export function importUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Enter a valid public HTTPS recipe link.');
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    raw.length > 2048
  )
    throw new Error('Enter a valid public HTTPS recipe link.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (ipaddr.isValid(host) && !isPublicAddress(host))
    throw new Error('This recipe link is not publicly accessible.');
  return url;
}

/** Validate every redirect and pin the DNS result used by TLS; never forward user credentials. */
export async function fetchImport(
  raw: string,
  image = false,
  deadline = Date.now() + 6500,
  redirects = 0,
): Promise<{ body: Buffer; contentType: string; url: string }> {
  if (redirects > 3) throw new Error('The recipe link redirected too many times.');
  const url = importUrl(raw);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error('Recipe import timed out. Try again.');
  let dnsTimer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([
    lookup(host, { all: true }),
    new Promise<never>((_, reject) => {
      dnsTimer = setTimeout(
        () => reject(new Error('Recipe import timed out. Try again.')),
        remaining,
      );
    }),
  ]).finally(() => clearTimeout(dnsTimer));
  if (!addresses.length || addresses.some((entry) => !isPublicAddress(entry.address)))
    throw new Error('This recipe link is not publicly accessible.');
  const address = addresses[0];
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        agent: false,
        family: address.family,
        lookup: (_host, _options, callback) => callback(null, address.address, address.family),
        headers: {
          'User-Agent': 'PantryRecipeImport/1.0',
          Accept: image ? 'image/jpeg,image/png,image/webp' : 'text/html,application/xhtml+xml',
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if ([301, 302, 303, 307, 308].includes(status) && response.headers.location) {
          response.resume();
          clearTimeout(timer);
          fetchImport(
            new URL(response.headers.location, url).href,
            image,
            deadline,
            redirects + 1,
          ).then(resolve, reject);
          return;
        }
        const contentType = (response.headers['content-type'] ?? '').split(';')[0].toLowerCase();
        const allowed = image
          ? ['image/jpeg', 'image/png', 'image/webp']
          : ['text/html', 'application/xhtml+xml'];
        if (status !== 200 || !allowed.includes(contentType)) {
          response.resume();
          clearTimeout(timer);
          reject(
            new Error('Could not read this recipe link. Try another link or continue manually.'),
          );
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > (image ? 1000000 : 2000000))
            request.destroy(new Error('The source is too large to import.'));
          else chunks.push(chunk);
        });
        response.on('error', reject);
        response.on('end', () => {
          clearTimeout(timer);
          resolve({ body: Buffer.concat(chunks), contentType, url: url.href });
        });
      },
    );
    const timer = setTimeout(
      () => request.destroy(new Error('Recipe import timed out. Try again.')),
      Math.max(1, deadline - Date.now()),
    );
    request.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}
