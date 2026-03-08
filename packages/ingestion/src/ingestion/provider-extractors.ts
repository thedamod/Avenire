import { assertSafeUrl } from '../utils/safety';

export type ProviderExtracted = {
  provider: 'instagram' | 'pinterest' | 'reddit' | 'twitter' | 'youtube';
  title?: string;
  content: string;
  mediaUrls: string[];
};

const fetchText = async (url: string): Promise<string> => {
  const response = await fetch(url, {
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
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    'i',
  );
  const match = html.match(pattern);
  return match?.[1]?.trim() ?? null;
};

const isSocialHost = (host: string, values: string[]): boolean => {
  return values.some(value => host === value || host.endsWith(`.${value}`));
};

const extractYouTube = async (url: URL): Promise<ProviderExtracted> => {
  const oembedUrl = new URL('https://www.youtube.com/oembed');
  oembedUrl.searchParams.set('url', url.toString());
  oembedUrl.searchParams.set('format', 'json');

  const response = await fetch(oembedUrl);
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

  const response = await fetch(jsonUrl, {
    headers: {
      'user-agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
      accept: 'application/json',
    },
  });

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
  const url = assertSafeUrl(inputUrl);
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
