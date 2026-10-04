import type { Route } from '@/types';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';

import { apiRootUrl, rootUrl } from './utils';

export const route: Route = {
    path: '/newsflash',
    categories: ['new-media'],
    example: '/odaily/newsflash',
    parameters: {},
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
            source: ['odaily.news/zh-CN/newsflash', 'odaily.news/newsflash', 'odaily.news/'],
        },
    ],
    name: '快讯',
    maintainers: ['nczitzk'],
    handler,
    url: 'odaily.news/zh-CN/newsflash',
};

async function handler(ctx) {
    const currentUrl = `${rootUrl}/zh-CN/newsflash`;

    const response = await got(`${apiRootUrl}/newsflash/page`, {
        searchParams: {
            page: 1,
            size: ctx.req.query('limit') ?? 100,
        },
    });

    const items = response.data.data.list.map((item) => ({
        title: item.title,
        // The newsflash page only accepts the numeric id; `newsUrl` is the external source of the news
        link: `${currentUrl}/${item.id}`,
        pubDate: parseDate(item.publishTimestamp),
        description: item.description,
    }));

    return {
        title: '快讯 - Odaily星球日报',
        link: currentUrl,
        item: items,
    };
}
