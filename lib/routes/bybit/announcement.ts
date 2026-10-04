import type { DataItem, Route } from '@/types';
import { ViewType } from '@/types';
import got from '@/utils/got';
import { parseDate } from '@/utils/parse-date';

const apiUrl = 'https://api.bybit.com/v5/announcements/index';

const locales = ['en-US', 'zh-TW', 'zh-HK', 'ja-JP', 'ru-RU', 'es-ES', 'pt-BR', 'fr-FR', 'tr-TR', 'vi-VN', 'id-ID', 'th-TH', 'ar-SA'];

// Types are case-sensitive and `Listing Billboard` contains a space, see the announcements page
const types = {
    new_crypto: '新币上线',
    latest_bybit_news: '最新资讯',
    maintenance_updates: '维护更新',
    delistings: '币种下线',
    latest_activities: '最新活动',
    Web3: 'Web3',
    other: '其他',
    Earn: '赚币',
    Partnership_Announcement: '合作伙伴公告',
    'Listing Billboard': '上币公告牌',
} as const;

type AnnouncementType = keyof typeof types;

interface Announcement {
    title: string;
    description: string;
    type?: {
        key?: string;
        title?: string;
    };
    tags?: string[];
    url: string;
    publishTime?: number;
}

async function handler(ctx) {
    const { type = '', locale = 'en-US' } = ctx.req.param<'/bybit/announcement/:type?/:locale?'>();
    const limit = ctx.req.query('limit') ?? 20;

    if (!locales.includes(locale)) {
        throw new Error(`Invalid locale: ${locale}. Available locales: ${locales.join(', ')}`);
    }
    if (type && !(type in types)) {
        throw new Error(`Invalid type: ${type}. Available types: ${Object.keys(types).join(', ')}`);
    }

    const { data } = await got(apiUrl, {
        searchParams: {
            locale,
            limit,
            ...(type && { type }),
        },
    });

    if (data.retCode !== 0) {
        throw new Error(`Bybit API returned an error: ${data.retMsg || data.retCode}`);
    }

    const items: DataItem[] = (data.result?.list ?? []).map((item: Announcement) => ({
        title: item.title,
        link: item.url,
        description: item.description,
        // `publishTime` is an epoch timestamp in milliseconds and is missing on some older items
        pubDate: item.publishTime ? parseDate(item.publishTime) : undefined,
        category: [...(item.tags ?? []), item.type?.title].filter((tag): tag is string => Boolean(tag)),
    }));

    return {
        title: type ? `${types[type as AnnouncementType]} - Bybit 公告` : 'Bybit 公告',
        link: 'https://www.bybit.com/announcement-info/',
        item: items,
        allowEmpty: true,
    };
}

export const route: Route = {
    path: '/announcement/:type?/:locale?',
    categories: ['finance'],
    view: ViewType.Articles,
    example: '/bybit/announcement/latest_bybit_news/en-US',
    parameters: {
        type: {
            description: '公告类型，默认为全部',
            options: [
                { value: 'new_crypto', label: '新币上线' },
                { value: 'latest_bybit_news', label: '最新资讯' },
                { value: 'maintenance_updates', label: '维护更新' },
                { value: 'delistings', label: '币种下线' },
                { value: 'latest_activities', label: '最新活动' },
                { value: 'Web3', label: 'Web3' },
                { value: 'other', label: '其他' },
                { value: 'Earn', label: '赚币' },
                { value: 'Partnership_Announcement', label: '合作伙伴公告' },
                { value: 'Listing Billboard', label: '上币公告牌' },
            ],
        },
        locale: {
            description: '语言',
            default: 'en-US',
            options: locales.map((value) => ({ value, label: value })),
        },
    },
    radar: [
        {
            source: ['www.bybit.com/announcement-info'],
            target: '/announcement',
        },
    ],
    name: 'Announcement',
    description: `type:

| Type                     | Description      |
| ------------------------ | ---------------- |
| new_crypto               | 新币上线         |
| latest_bybit_news        | 最新资讯         |
| maintenance_updates      | 维护更新         |
| delistings               | 币种下线         |
| latest_activities        | 最新活动         |
| Web3                     | Web3             |
| other                    | 其他             |
| Earn                     | 赚币             |
| Partnership_Announcement | 合作伙伴公告     |
| Listing Billboard        | 上币公告牌       |

locale:

${locales.join(', ')}`,
    maintainers: ['YukiCoco'],
    handler,
};
