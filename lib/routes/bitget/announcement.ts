import { load } from 'cheerio';

import { config } from '@/config';
import type { DataItem, Route } from '@/types';
import { ViewType } from '@/types';
import cache from '@/utils/cache';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';

const baseUrl = 'https://www.bitget.com';

// The announcement center only serves these language paths, the other locales fall back to English
const languages = ['zh-CN', 'en', 'es-ES'];

/**
 * Section ids are not stable across languages (and some sections are missing
 * from a language entirely), so every type maps to its id per language.
 * `en` is served without a language prefix.
 */
const sectionIds: Record<string, Record<string, string>> = {
    'zh-CN': {
        latest: '12508313443483',
        'new-listing': '5955813039257',
        'product-updates': '12508313449108',
        campaigns: '4413154768537',
        delistings: '12508313443290',
        security: '12508313444842',
        institutional: '12508313450724',
        'api-trading': '360011097932',
        fiat: '12508313443315',
        maintenance: '12508313446623',
    },
    en: {
        latest: '12508313443483',
        'new-listing': '5955813039257',
        'product-updates': '12508313449108',
        campaigns: '4413154768537',
        delistings: '12508313443290',
        security: '12508313444842',
        institutional: '12508313450724',
        'api-trading': '360011097932',
        fiat: '12508313443315',
        maintenance: '12508313446623',
    },
    'es-ES': {
        latest: '12508313443483',
        'product-updates': '12508313448115',
        campaigns: '4413154768537',
        delistings: '12508313443290',
        security: '12508313444842',
        'api-trading': '360011097932',
        maintenance: '12508313446623',
    },
};

const sectionOrder = ['latest', 'new-listing', 'product-updates', 'campaigns', 'delistings', 'security', 'institutional', 'api-trading', 'fiat', 'maintenance'] as const;

type AnnouncementType = (typeof sectionOrder)[number];

interface ArticleItem {
    contentId: string;
    title: string;
    showTime: string;
}

interface SectionArticle {
    items: ArticleItem[];
}

/**
 * The support site is a React application that embeds its server state in a
 * `window.__ZEUS_REACT_QUERY_STATE__` script tag, so the data can be read
 * without executing any JavaScript.
 */
function parseQueryState(html: string) {
    const $ = load(html);
    const state = $('script')
        .toArray()
        .map((element) => $(element).text())
        .find((text) => text.includes('__ZEUS_REACT_QUERY_STATE__'));
    if (!state) {
        throw new Error('Failed to find the Bitget announcement data in the response');
    }

    const start = state.indexOf('{', state.indexOf('__ZEUS_REACT_QUERY_STATE__'));
    if (start === -1) {
        throw new Error('Failed to parse the Bitget announcement data');
    }

    // Extract the assignment by matching braces, quotes may contain braces
    let depth = 0;
    let end = -1;
    let inString = false;
    let escaped = false;
    for (let i = start; i < state.length; i++) {
        const char = state[i];
        if (inString) {
            if (escaped) {
                escaped = false;
            } else if (char === '\\') {
                escaped = true;
            } else if (char === '"') {
                inString = false;
            }
            continue;
        }
        if (char === '"') {
            inString = true;
        } else if (char === '{') {
            depth++;
        } else if (char === '}') {
            depth--;
            if (depth === 0) {
                end = i + 1;
                break;
            }
        }
    }
    if (end === -1) {
        throw new Error('Failed to parse the Bitget announcement data');
    }
    return JSON.parse(state.slice(start, end));
}

function getQueryData(queries: Array<{ queryKey: unknown[]; state?: { data?: unknown } }>, key: string) {
    const query = queries.find((item) => item.queryKey[0] === key);
    if (!query?.state?.data) {
        throw new Error(`Failed to find the "${key}" data in the Bitget response`);
    }
    return query.state.data as Record<string, any>;
}

const handler: Route['handler'] = async (ctx) => {
    const { type = 'latest', lang = 'zh-CN' } = ctx.req.param<'/bitget/announcement/:type/:lang?'>();
    if (!sectionOrder.includes(type as AnnouncementType)) {
        throw new Error(`Invalid type: ${type}. Available types: ${sectionOrder.join(', ')}`);
    }
    if (!languages.includes(lang)) {
        throw new Error(`Invalid lang: ${lang}. Available languages: ${languages.join(', ')}`);
    }

    const sectionId = sectionIds[lang]?.[type];
    if (!sectionId) {
        throw new Error(`The "${type}" section is not available in ${lang}. Available types: ${Object.keys(sectionIds[lang]).join(', ')}`);
    }

    const locale = lang.replace('-', '_');
    const prefix = lang === 'en' ? '' : `/${lang}`;
    const headers = {
        Referer: `${baseUrl}${prefix}/support/announcement-center`,
        accept: 'application/json, text/plain, */*',
        language: locale,
        locale,
    };
    const limit = Number(ctx.req.query('limit') ?? 20);

    const { items, title } = await cache.tryGet(
        `bitget:announcement:${type}:${lang}:${limit}`,
        async () => {
            const html = await ofetch<string>(`${baseUrl}${prefix}/support/sections/${sectionId}`, { headers });
            const section = getQueryData(parseQueryState(html).queries, 'sections');
            const sectionArticle = section.sectionArticle as SectionArticle;
            if (!Array.isArray(sectionArticle?.items)) {
                throw new TypeError('Bitget returned an invalid announcement list');
            }

            // The localized section name is only available in the navigation list
            const navigation = section.originCategory?.navigationList?.find((item: { jumpUrl?: string }) => item.jumpUrl?.replace(/\/$/, '').endsWith(sectionId));

            return {
                title: navigation?.navigationName ?? section.originCategory?.categoryName ?? 'Bitget',
                items: sectionArticle.items.slice(0, limit),
            };
        },
        config.cache.routeExpire,
        false
    );

    const data = await Promise.all(
        items.map((item) =>
            cache.tryGet(`bitget:announcement:${item.contentId}:${lang}`, async () => {
                const link = `${baseUrl}${prefix}/support/articles/${item.contentId}`;
                const dataItem: DataItem = {
                    title: item.title,
                    link,
                    pubDate: item.showTime ? parseDate(Number(item.showTime)) : undefined,
                };

                try {
                    const detailResponse = await ofetch<string>(link, { headers });
                    const { queries } = parseQueryState(detailResponse);
                    dataItem.description = getQueryData(queries, 'articles').articleDetails?.content;
                } catch {
                    // Keep the feed usable even if a single article cannot be fetched
                }

                return dataItem;
            })
        )
    );

    return {
        title: `${title} - Bitget`,
        link: `${baseUrl}${prefix}/support/announcement-center`,
        item: data,
    };
};

export const route: Route = {
    path: '/announcement/:type/:lang?',
    categories: ['finance'],
    view: ViewType.Articles,
    example: '/bitget/announcement/latest/zh-CN',
    parameters: {
        type: {
            description: 'Bitget 通知类型',
            default: 'latest',
            options: [
                { value: 'latest', label: '最新动态' },
                { value: 'new-listing', label: '新币上线' },
                { value: 'product-updates', label: '产品更新' },
                { value: 'campaigns', label: '交易比赛和活动' },
                { value: 'delistings', label: '下架资讯' },
                { value: 'security', label: '安全专栏' },
                { value: 'institutional', label: '机构服务' },
                { value: 'api-trading', label: 'API交易' },
                { value: 'fiat', label: '法币' },
                { value: 'maintenance', label: '维护/系统升级' },
            ],
        },
        lang: {
            description: '语言',
            default: 'zh-CN',
            options: [
                { value: 'zh-CN', label: '中文' },
                { value: 'en', label: 'English' },
                { value: 'es-ES', label: 'Español' },
            ],
        },
    },
    radar: [
        {
            source: ['www.bitget.com/:lang/support/announcement-center', 'www.bitget.com/support/announcement-center'],
            target: '/announcement/latest/:lang?',
        },
    ],
    name: 'Announcement',
    description: `type:

| Type            | Description     |
| --------------- | --------------- |
| latest          | 最新动态        |
| new-listing     | 新币上线        |
| product-updates | 产品更新        |
| campaigns       | 交易比赛和活动  |
| delistings      | 下架资讯        |
| security        | 安全专栏        |
| institutional   | 机构服务        |
| api-trading     | API 交易        |
| fiat            | 法币            |
| maintenance     | 维护 / 系统升级 |

lang:

| Lang  | Description | Missing types                    |
| ----- | ----------- | -------------------------------- |
| zh-CN | 中文        |                                  |
| en    | English     |                                  |
| es-ES | Español     | new-listing, institutional, fiat |`,
    maintainers: ['YukiCoco'],
    handler,
};
