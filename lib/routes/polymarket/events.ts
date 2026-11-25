import InvalidParameterError from '@/errors/types/invalid-parameter';
import type { Data, Route } from '@/types';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';

import type { EventsPagination } from './types';
import { GAMMA_API } from './types';
import { formatEventDescription } from './utils';

export const route: Route = {
    path: '/events/:tagSlug?/:mode?',
    categories: ['finance'],
    example: '/polymarket/events',
    parameters: {
        tagSlug: 'Tag slug to filter events, e.g. politics, sports, crypto. Omit for all events.',
        mode: 'Set to latest to follow newly created events and omit high-frequency recurring markets and live quotes.',
    },
    features: {
        requireConfig: false,
        requirePuppeteer: false,
        antiCrawler: false,
        supportBT: false,
        supportPodcast: false,
        supportScihub: false,
    },
    radar: [
        {
            source: ['polymarket.com', 'polymarket.com/:tagSlug'],
            target: '/events/:tagSlug',
        },
    ],
    name: 'Events',
    url: 'polymarket.com',
    maintainers: ['heqi201255'],
    handler,
};

async function handler(ctx): Promise<Data> {
    const { tagSlug, mode } = ctx.req.param();
    if (mode !== undefined && mode !== 'latest') {
        throw new InvalidParameterError('Polymarket events mode must be latest.');
    }
    const latest = mode === 'latest';
    const limit = 30;

    const query = {
        active: true,
        closed: false,
        limit,
        order: latest ? 'createdAt' : 'volume',
        // Polymarket marks short recurring markets with the hide-from-new tag.
        exclude_tag_id: latest ? 102169 : undefined,
        ascending: false,
        tag_slug: tagSlug || undefined,
    };

    const response = await ofetch<EventsPagination>(`${GAMMA_API}/events/pagination`, { query });

    const data = response.data || [];

    const items = (latest ? data.filter((event) => event.createdAt) : data).map((event) => {
        const publishedAt = latest ? event.createdAt : event.startDate;
        return {
            title: event.title,
            description: formatEventDescription(event, !latest),
            link: `https://polymarket.com/event/${event.slug}`,
            pubDate: publishedAt ? parseDate(publishedAt) : undefined,
            category: event.tags?.map((t) => t.label).filter((label): label is string => Boolean(label)),
        };
    });

    return {
        title: `Polymarket ${latest ? 'Latest Events' : 'Events'}${tagSlug ? ` - ${tagSlug}` : ''}`,
        link: tagSlug ? `https://polymarket.com/${tagSlug}` : 'https://polymarket.com',
        item: items,
    };
}
