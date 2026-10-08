import type { DataItem, Route } from '@/types';
import { ViewType } from '@/types';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';

const siteUrl = 'https://www.upbit.com';
const apiUrl = 'https://pub-info.upbit.com/api/v1/announcements';

const categories = {
    all: 'All',
    notice: 'Notice',
    trade: 'Trade',
    dtw: 'Deposit and Withdrawal',
    maintenance: 'Maintenance',
    digital_asset: 'Digital Asset',
    nft: 'NFT',
    staking: 'Service+',
    event: 'Event',
} as const;

type Category = keyof typeof categories;

interface Notice {
    id: number;
    uuid: string;
    title: string;
    category: string;
    listed_at: string;
}

interface NoticeListResponse {
    data: {
        total_pages: number;
        total_count: number;
        notices: Notice[];
        fixed_notices: Notice[];
    };
}

const handler: Route['handler'] = async (ctx) => {
    const { category = 'all' } = ctx.req.param<'/upbit/notice/:category?'>();
    const limit = Number(ctx.req.query('limit') ?? '20');
    const perPage = Number.isNaN(limit) || limit <= 0 ? 20 : limit;

    if (!Object.hasOwn(categories, category)) {
        throw new Error(`Invalid category: ${category}. Available categories: ${Object.keys(categories).join(', ')}`);
    }

    const { data } = await ofetch<NoticeListResponse>(apiUrl, {
        query: {
            os: 'web',
            page: 1,
            per_page: perPage,
            category,
        },
    });

    const items: DataItem[] = data.notices.map((notice) => ({
        title: notice.title,
        link: `${siteUrl}/service_center/notice?id=${notice.uuid}`,
        pubDate: parseDate(notice.listed_at),
        category: notice.category ? [notice.category] : undefined,
    }));

    return {
        title: category === 'all' ? 'Upbit Notice' : `Upbit - ${categories[category as Category]}`,
        link: `${siteUrl}/service_center/notice`,
        item: items,
    };
};

export const route: Route = {
    path: '/notice/:category?',
    categories: ['finance'],
    view: ViewType.Articles,
    example: '/upbit/notice',
    parameters: {
        category: {
            description: 'Notice category',
            default: 'all',
            options: Object.entries(categories).map(([value, label]) => ({
                value,
                label,
            })),
        },
    },
    radar: [
        {
            source: ['www.upbit.com/service_center/notice'],
            target: '/notice',
        },
    ],
    name: 'Notice',
    description: 'Notice list from Upbit, with optional category filter. The notice detail API is heavily rate limited, so items only contain title, category and publish date.',
    maintainers: ['crypto-2042'],
    handler,
};
