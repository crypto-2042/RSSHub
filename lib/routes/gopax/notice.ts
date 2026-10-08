import type { DataItem, Route } from '@/types';
import { ViewType } from '@/types';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';

const siteUrl = 'https://www.gopax.co.kr';
const apiUrl = 'https://api.gopax.co.kr/notices';

const noticeTypes = {
    1: { slug: 'notice', label: 'Notice' },
    2: { slug: 'listing', label: 'Listing' },
    3: { slug: 'event', label: 'Event' },
    4: { slug: 'deposit-withdrawal', label: 'Deposit and Withdrawal' },
    5: { slug: 'disclosure', label: 'Disclosure' },
} as const;

type NoticeTypeNumber = keyof typeof noticeTypes;

interface Notice {
    id: number;
    type: NoticeTypeNumber;
    title: string;
    content: string;
    createdAt: string;
    updatedAt: string;
}

const getNoticeType = (type: number) => noticeTypes[type as NoticeTypeNumber];

const handler: Route['handler'] = async (ctx) => {
    const { category } = ctx.req.param<'/gopax/notice/:category?'>();
    const limit = Number(ctx.req.query('limit') ?? '20');
    // The API caps the page size at 20
    const pageSize = Number.isNaN(limit) || limit <= 0 ? 20 : Math.min(limit, 20);

    const typeEntry = category && category !== 'all' ? Object.entries(noticeTypes).find(([, value]) => value.slug === category) : undefined;
    if (category && category !== 'all' && !typeEntry) {
        throw new Error(
            `Invalid category: ${category}. Available categories: all, ${Object.values(noticeTypes)
                .map((type) => type.slug)
                .join(', ')}`
        );
    }

    const data = await ofetch<Notice[]>(apiUrl, {
        query: {
            page: 0,
            limit: pageSize,
            ...(typeEntry && { type: typeEntry[0] }),
        },
    });

    const items: DataItem[] = data.map((notice) => {
        const noticeLabel = getNoticeType(notice.type)?.label;

        return {
            title: notice.title,
            link: `${siteUrl}/notice/detail?id=${notice.id}`,
            description: notice.content,
            pubDate: parseDate(notice.createdAt),
            category: noticeLabel ? [noticeLabel] : undefined,
        };
    });

    const label = typeEntry?.[1].label;

    return {
        title: label ? `GOPAX - ${label}` : 'GOPAX Notice',
        link: `${siteUrl}/notice`,
        item: items,
    };
};

export const route: Route = {
    path: '/notice/:category?',
    categories: ['finance'],
    view: ViewType.Articles,
    example: '/gopax/notice',
    parameters: {
        category: {
            description: 'Notice category. Use `all` or omit the parameter to get all categories.',
            default: 'all',
            options: [
                { value: 'all', label: 'All' },
                ...Object.values(noticeTypes).map((type) => ({
                    value: type.slug,
                    label: type.label,
                })),
            ],
        },
    },
    radar: [
        {
            source: ['www.gopax.co.kr/notice'],
            target: '/notice',
        },
    ],
    name: 'Notice',
    description: 'Notice list from GOPAX, with optional category filter.',
    maintainers: ['crypto-2042'],
    handler,
};
