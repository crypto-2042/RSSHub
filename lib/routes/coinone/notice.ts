import type { DataItem, Route } from '@/types';
import { ViewType } from '@/types';
import cache from '@/utils/cache';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';

const siteUrl = 'https://coinone.co.kr';
const apiUrl = 'https://api-gateway.coinone.co.kr/notice/v1/announcements/posts';

const noticeTypes = {
    1: { slug: 'event', label: 'Event' },
    2: { slug: 'event-result', label: 'Event Result' },
    3: { slug: 'listing', label: 'Listing' },
    4: { slug: 'deposit-withdrawal', label: 'Deposit and Withdrawal' },
    7: { slug: 'security', label: 'Security' },
    8: { slug: 'announcement', label: 'Announcement' },
    9: { slug: 'disclosure', label: 'Disclosure' },
} as const;

type NoticeTypeNumber = keyof typeof noticeTypes;

interface Notice {
    id: number;
    title: string;
    noticeTypeNum: NoticeTypeNumber;
    displayUpdatedAt?: number;
    exposedAt?: number;
    updatedAt?: number;
}

interface NoticeListResponse {
    body: {
        notices: Notice[];
        pinnedNotices: Notice[];
        pagination: {
            page: number;
            pageSize: number;
            totalElements: number;
        };
    };
}

interface NoticeDetailResponse {
    body: {
        id: number;
        title: string;
        content?: string;
    };
}

const getNoticeType = (noticeTypeNum: number) => noticeTypes[noticeTypeNum as NoticeTypeNumber];

const handler: Route['handler'] = async (ctx) => {
    const { category } = ctx.req.param<'/coinone/notice/:category?'>();
    const limit = Number(ctx.req.query('limit') ?? '20');
    const pageSize = Number.isNaN(limit) || limit <= 0 ? 20 : limit;

    const typeEntry = category ? Object.entries(noticeTypes).find(([, value]) => value.slug === category) : undefined;
    if (category && !typeEntry) {
        throw new Error(
            `Invalid category: ${category}. Available categories: ${Object.values(noticeTypes)
                .map((type) => type.slug)
                .join(', ')}`
        );
    }

    const { body } = await ofetch<NoticeListResponse>(apiUrl, {
        query: {
            page: 0,
            pageSize,
            ...(typeEntry && { noticeTypeNum: typeEntry[0] }),
        },
    });

    const items: DataItem[] = await Promise.all(
        body.notices.map((notice) =>
            cache.tryGet(`${siteUrl}/info/notice/${notice.id}`, async () => {
                const { body: detail } = await ofetch<NoticeDetailResponse>(`${apiUrl}/${notice.id}`);
                const label = getNoticeType(notice.noticeTypeNum)?.label;
                const timestamp = notice.displayUpdatedAt ?? notice.exposedAt ?? notice.updatedAt;

                return {
                    title: notice.title,
                    link: `${siteUrl}/info/notice/${notice.id}`,
                    description: detail.content,
                    pubDate: timestamp ? parseDate(timestamp * 1000) : undefined,
                    category: label ? [label] : undefined,
                };
            })
        )
    );

    const label = typeEntry?.[1].label;

    return {
        title: label ? `Coinone - ${label}` : 'Coinone Notice',
        link: `${siteUrl}/info/notice`,
        item: items,
    };
};

export const route: Route = {
    path: '/notice/:category?',
    categories: ['finance'],
    view: ViewType.Articles,
    example: '/coinone/notice',
    parameters: {
        category: {
            description: 'Notice category. Omit to get all categories.',
            options: Object.values(noticeTypes).map((type) => ({
                value: type.slug,
                label: type.label,
            })),
        },
    },
    radar: [
        {
            source: ['coinone.co.kr/info/notice'],
            target: '/notice',
        },
    ],
    name: 'Notice',
    description: 'Notice list from Coinone, with optional category filter.',
    maintainers: ['crypto-2042'],
    handler,
};
