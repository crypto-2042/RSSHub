import type { DataItem, Route } from '@/types';
import { ViewType } from '@/types';
import ofetch from '@/utils/ofetch';
import { parseDateInTimezone } from '@/utils/parse-date-in-timezone';

const siteUrl = 'https://feed.bithumb.com';
// The literal `notices` path is blocked by the gateway WAF, encoding the `n` is required
const apiUrl = 'https://gw.bithumb.com/feed/v2/articles/%6Eotices';

const categories = {
    notice: { id: 1, label: 'Notice' },
    'new-service': { id: 2, label: 'New Service' },
    maintenance: { id: 3, label: 'Maintenance' },
    update: { id: 4, label: 'Update' },
    'trading-caution': { id: 5, label: 'Trading Caution' },
    'caution-and-delisting': { id: 6, label: 'Trading Caution and Delisting' },
    'deposit-withdrawal': { id: 7, label: 'Deposit and Withdrawal' },
    event: { id: 8, label: 'Event' },
    'market-addition': { id: 9, label: 'Market Addition' },
    disclosure: { id: 15, label: 'Disclosure' },
} as const;

type Category = keyof typeof categories;

interface Notice {
    id: number;
    title: string;
    categoryName1?: string;
    categoryName2?: string;
    topFixYn?: string;
    publicationDateTime: string;
    modifyDateTime?: string;
}

interface NoticeListResponse {
    data: {
        content: Notice[];
        totalElements: number;
        totalPages: number;
    };
}

const handler: Route['handler'] = async (ctx) => {
    const { category } = ctx.req.param<'/bithumb/notice/:category?'>();

    if (category && !Object.hasOwn(categories, category)) {
        throw new Error(`Invalid category: ${category}. Available categories: ${Object.keys(categories).join(', ')}`);
    }

    const { data } = await ofetch<NoticeListResponse>(apiUrl, {
        query: {
            pageNumber: 0,
            ...(category && { categoryId: categories[category as Category].id }),
        },
    });

    const items: DataItem[] = data.content.map((notice) => ({
        title: notice.title,
        link: `${siteUrl}/notice/${notice.id}`,
        // The API returns Korean local time without an offset
        pubDate: parseDateInTimezone(notice.publicationDateTime, 9),
        category: [notice.categoryName1, notice.categoryName2].filter((name): name is string => Boolean(name)),
    }));

    return {
        title: category ? `Bithumb - ${categories[category as Category].label}` : 'Bithumb Notice',
        link: `${siteUrl}/notice`,
        item: items,
    };
};

export const route: Route = {
    path: '/notice/:category?',
    categories: ['finance'],
    view: ViewType.Articles,
    example: '/bithumb/notice',
    parameters: {
        category: {
            description: 'Notice category. Omit to get all categories.',
            options: Object.entries(categories).map(([value, { label }]) => ({
                value,
                label,
            })),
        },
    },
    radar: [
        {
            source: ['feed.bithumb.com/notice'],
            target: '/notice',
        },
        {
            source: ['www.bithumb.com/react/notice'],
            target: '/notice',
        },
    ],
    name: 'Notice',
    description: 'Notice list from Bithumb, with optional category filter. The notice body is not exposed by the public API, so items only contain title, category and publish date.',
    maintainers: ['crypto-2042'],
    handler,
};
