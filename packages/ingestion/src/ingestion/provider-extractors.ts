import { assertSafeUrl } from '../utils/safety';

export type ProviderExtracted = {
  provider: 'instagram' | 'pinterest' | 'reddit' | 'twitter' | 'youtube';
  title?: string;
  content: string;
  mediaUrls: string[];
};

const MAX_REDIRECTS = 5;

const isRedirectStatus = (status: number): boolean =>
  status === 301 || status === 302 || status === 303 || status === 307 || status === 308;

const fetchWithSafeRedirects = async (
  inputUrl: string | URL,
  init?: RequestInit,
): Promise<Response> => {
  let currentUrl = await assertSafeUrl(
    typeof inputUrl === 'string' ? inputUrl : inputUrl.toString(),
  );

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetch(currentUrl, {
      ...init,
      redirect: 'manual',
    });

    if (!isRedirectStatus(response.status)) {
      return response;
    }

    const location = response.headers.get('location');
    if (!location) {
      throw new Error(`Redirect response missing location header for ${currentUrl.toString()}`);
    }

    if (redirectCount === MAX_REDIRECTS) {
      throw new Error(`Too many redirects while fetching ${currentUrl.toString()}`);
    }

    currentUrl = await assertSafeUrl(new URL(location, currentUrl).toString());
  }

  throw new Error(`Too many redirects while fetching ${currentUrl.toString()}`);
};

const fetchText = async (url: string): Promise<string> => {
  const response = await fetchWithSafeRedirects(url, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      accept: 'text/html,application/json;q=0.9,*/*;q=0.8',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.text();
};

const getOgValue = (html: string, property: string): string | null => {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const metaTagPattern = new RegExp(
    `<meta[^>]*\\b(?:property|name)=["']${escaped}["'][^>]*>`,
    'i',
  );
  const metaTag = html.match(metaTagPattern)?.[0];
  if (!metaTag) {
    return null;
  }

  const contentMatch = metaTag.match(/\bcontent=["']([^"']+)["']/i);
  return contentMatch?.[1]?.trim() ?? null;
};

const isSocialHost = (host: string, values: string[]): boolean => {
  return values.some(value => host === value || host.endsWith(`.${value}`));
};

const extractYouTube = async (url: URL): Promise<ProviderExtracted> => {
  const oembedUrl = new URL('https://www.youtube.com/oembed');
  oembedUrl.searchParams.set('url', url.toString());
  oembedUrl.searchParams.set('format', 'json');

  const response = await fetch(oembedUrl);
  if (!response.ok) {
    throw new Error(
      `YouTube oEmbed request failed (${response.status} ${response.statusText})`,
    );
  }
  const json = (await response.json().catch(() => ({}))) as {
    title?: string;
    author_name?: string;
    thumbnail_url?: string;
  };

  const content = [
    `YouTube URL: ${url.toString()}`,
    json.title ? `Title: ${json.title}` : '',
    json.author_name ? `Channel: ${json.author_name}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    provider: 'youtube',
    title: json.title,
    content,
    mediaUrls: json.thumbnail_url ? [json.thumbnail_url] : [],
  };
};

const extractPinterest = async (url: URL): Promise<ProviderExtracted> => {
  const html = await fetchText(url.toString());
  const videoRegex = /"url":"(https:[^"]*pinimg[^"]*)"/g;
  const imageRegex = /src="(https:\/\/i\.pinimg\.com\/.*?\.(jpg|gif|png))"/g;

  const mediaUrls = [
    ...Array.from(html.matchAll(videoRegex)).map(match => match[1]?.replaceAll('\\/', '/')),
    ...Array.from(html.matchAll(imageRegex)).map(match => match[1]),
  ].filter((value): value is string => Boolean(value));

  return {
    provider: 'pinterest',
    content: `Pinterest URL: ${url.toString()}\nMedia found: ${mediaUrls.length}`,
    mediaUrls,
  };
};

const extractReddit = async (url: URL): Promise<ProviderExtracted> => {
  const pathname = url.pathname.replace(/\/$/, '');
  const jsonUrl = pathname.endsWith('.json')
    ? new URL(url.toString())
    : new URL(`${url.origin}${pathname}.json`);

  const response = await fetchWithSafeRedirects(jsonUrl, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${jsonUrl.toString()}: ${response.status}`);
  }

  const payload = (await response.json().catch(() => null)) as any;
  const post = payload?.[0]?.data?.children?.[0]?.data;

  const mediaUrls: string[] = [];
  if (typeof post?.url_overridden_by_dest === 'string') mediaUrls.push(post.url_overridden_by_dest);
  if (typeof post?.url === 'string') mediaUrls.push(post.url);
  if (typeof post?.secure_media?.reddit_video?.fallback_url === 'string') {
    mediaUrls.push(post.secure_media.reddit_video.fallback_url);
  }

  return {
    provider: 'reddit',
    title: post?.title,
    content: [
      `Reddit URL: ${url.toString()}`,
      post?.title ? `Title: ${post.title}` : '',
      post?.selftext ? `Body: ${post.selftext}` : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    mediaUrls,
  };
};

const extractFromOgTags = async (
  provider: ProviderExtracted['provider'],
  url: URL,
): Promise<ProviderExtracted> => {
  const html = await fetchText(url.toString());

  const mediaUrls = [
    getOgValue(html, 'og:video'),
    getOgValue(html, 'og:video:url'),
    getOgValue(html, 'og:image'),
  ].filter((value): value is string => Boolean(value));

  return {
    provider,
    title: getOgValue(html, 'og:title') ?? undefined,
    content: [
      `${provider.toUpperCase()} URL: ${url.toString()}`,
      getOgValue(html, 'og:title') ? `Title: ${getOgValue(html, 'og:title')}` : '',
      getOgValue(html, 'og:description')
        ? `Description: ${getOgValue(html, 'og:description')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n'),
    mediaUrls,
  };
};

export const extractFromSupportedProvider = async (
  inputUrl: string,
): Promise<ProviderExtracted | null> => {
  const url = await assertSafeUrl(inputUrl);
  const host = url.hostname.toLowerCase();

  if (isSocialHost(host, ['youtube.com', 'youtu.be', 'm.youtube.com'])) {
    return extractYouTube(url);
  }

  if (isSocialHost(host, ['pinterest.com', 'pin.it'])) {
    return extractPinterest(url);
  }

  if (isSocialHost(host, ['reddit.com', 'redd.it'])) {
    return extractReddit(url);
  }

  if (isSocialHost(host, ['x.com', 'twitter.com'])) {
    return extractFromOgTags('twitter', url);
  }

  if (isSocialHost(host, ['instagram.com'])) {
    return extractFromOgTags('instagram', url);
  }

  return null;
};
