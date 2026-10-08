import type { DataItem, Route } from '@/types';
import { ViewType } from '@/types';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';

import type { RichTextDocument } from './utils';
import { renderRichText } from './utils';

const siteUrl = 'https://digitalx.miraeasset.com';
const apiUrl = 'https://portal-prod.korbit.co.kr/api/korbit/v2/contentful';

const categories = [
    { slug: 'important', label: 'Important', value: '중요' },
    { slug: 'notice', label: 'Notice', value: '안내' },
    { slug: 'event', label: 'Event', value: '이벤트' },
    { slug: 'fee-event', label: 'Fee Event', value: '수수료 이벤트' },
    { slug: 'deposit-withdrawal', label: 'Deposit and Withdrawal', value: '입출금' },
    { slug: 'web3', label: 'Web3', value: 'Web3' },
    { slug: 'maintenance', label: 'Maintenance', value: '점검' },
    { slug: 'insights', label: 'Insights', value: '인사이트' },
    { slug: 'new', label: 'New', value: '신규' },
    { slug: 'caution', label: 'Caution', value: '유의' },
    { slug: 'update', label: 'Update', value: '업데이트' },
    { slug: 'closed', label: 'Closed', value: '종료' },
    { slug: 'other', label: 'Other', value: '기타' },
];

interface Asset {
    sys: {
        id: string;
    };
    fields: {
        file?: {
            url?: string;
        };
    };
}

interface NoticeEntry {
    sys: {
        id: string;
    };
    fields: {
        title?: string;
        category?: string;
        createdAt?: string;
        contents?: RichTextDocument | string;
    };
}

interface ContentfulResponse {
    total: number;
    items: NoticeEntry[];
    includes?: {
        Asset?: Asset[];
    };
}

const normalizeAssetUrl = (url?: string) => {
    if (!url) {
        return;
    }
    return url.startsWith('//') ? `https:${url}` : url;
};

const handler: Route['handler'] = async (ctx) => {
    const { category } = ctx.req.param<'/digitalx/notice/:category?'>();
    const limit = Number(ctx.req.query('limit') ?? '20');
    const pageSize = Number.isNaN(limit) || limit <= 0 ? 20 : Math.min(limit, 100);

    const categoryEntry = category ? categories.find((item) => item.slug === category) : undefined;
    if (category && !categoryEntry) {
        throw new Error(`Invalid category: ${category}. Available categories: ${categories.map((item) => item.slug).join(', ')}`);
    }

    const { items: entries, includes } = await ofetch<ContentfulResponse>(apiUrl, {
        query: {
            content_type: 'notice',
            order: '-fields.createdAt',
            limit: pageSize,
            ...(categoryEntry && { 'fields.category': categoryEntry.value }),
        },
        headers: {
            // The web client identifies itself as a React Native build
            korbit_platform_id: '21',
            'platform-identifier': 'rn_ios',
        },
    });

    const assets = new Map((includes?.Asset ?? []).map((asset) => [asset.sys.id, normalizeAssetUrl(asset.fields.file?.url) ?? '']));

    const items: DataItem[] = entries.map((entry) => ({
        title: entry.fields.title ?? '',
        link: `${siteUrl}/notice/detail?id=${entry.sys.id}`,
        description: typeof entry.fields.contents === 'object' && entry.fields.contents ? renderRichText(entry.fields.contents, assets) : undefined,
        pubDate: entry.fields.createdAt ? parseDate(entry.fields.createdAt) : undefined,
        category: entry.fields.category ? [entry.fields.category] : undefined,
    }));

    return {
        title: categoryEntry ? `Digital X - ${categoryEntry.label}` : 'Digital X Notice',
        link: `${siteUrl}/notice`,
        item: items,
    };
};

export const route: Route = {
    path: '/notice/:category?',
    categories: ['finance'],
    view: ViewType.Articles,
    example: '/digitalx/notice',
    parameters: {
        category: {
            description: 'Notice category. Omit to get all categories.',
            options: categories.map((item) => ({
                value: item.slug,
                label: item.label,
            })),
        },
    },
    radar: [
        {
            source: ['digitalx.miraeasset.com/notice'],
            target: '/notice',
        },
    ],
    name: 'Notice',
    description: 'Notice list from Digital X (formerly Korbit), with optional category filter.',
    maintainers: ['crypto-2042'],
    handler,
};
