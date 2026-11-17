import { renderToString } from 'hono/jsx/dom/server';

import InvalidParameterError from '@/errors/types/invalid-parameter';
import type { DataItem, Language, Route } from '@/types';
import { ViewType } from '@/types';
import ofetch from '@/utils/ofetch';
import { parseDate } from '@/utils/parse-date';

const rootUrl = 'https://eqn.news';
const apiUrl = `${rootUrl}/api/v1/news`;

// Channel keys come from the site's public channel config
// (https://eqn.news/_shared/channels.js, listed at https://eqn.news/api-docs#channels)
const channelLabels = {
    all: { zh: '全部频道', en: 'All Channels' },
    main: { zh: '方程式新闻', en: 'Equation News' },
    tradfi: { zh: '方程式财经', en: 'Equation TradFi' },
    binance: { zh: '币安公告', en: 'Binance Monitor' },
    korea: { zh: '韩所监控', en: 'Korean Exchanges' },
    pricechange: { zh: '价格异动', en: 'Price Moves' },
    oi: { zh: 'OI价格异动', en: 'OI & Price Moves' },
    major: { zh: '大幅波动', en: 'Big Moves' },
    tier2: { zh: '二线上新', en: 'Tier-2 Listings' },
    tier3: { zh: '三线上新', en: 'Tier-3 Listings' },
    alpha: { zh: '币安Alpha', en: 'Binance Alpha' },
    cz: { zh: 'CZ&何一', en: 'CZ & Yi He Watch' },
    earn: { zh: '理财提醒', en: 'Earn Alerts' },
    hl: { zh: 'Hyperliquid', en: 'Hyperliquid' },
    tfmoves: { zh: '美股重大行情', en: 'US Stock Big Moves' },
} as const;

const languageLabels = {
    zh: '中文',
    en: 'English',
    ko: '한국어',
    tr: 'Türkçe',
    ru: 'Русский',
} as const;

type Channel = keyof typeof channelLabels;
type Lang = keyof typeof languageLabels;

const languageOrder: Lang[] = ['zh', 'en', 'ko', 'tr', 'ru'];

type NewsItem = {
    no: number;
    path?: string;
    published_ts?: number;
    channels?: string[];
    source?: {
        display?: string | null;
        display_zh?: string | null;
    } | null;
    i18n?: Partial<Record<Lang, string | null>> | null;
    images?: string[] | null;
};

const channelLabel = (channel: string, lang: string) => {
    const labels = channelLabels[channel as Channel];
    if (!labels) {
        return channel;
    }
    return lang === 'zh' ? labels.zh : labels.en;
};

const siteName = (lang: string) => (lang === 'zh' ? '方程式新闻' : 'Equation News');

const pickText = (item: NewsItem, lang: Lang) => {
    const i18n = item.i18n ?? {};
    const candidates: Lang[] = [lang, ...languageOrder.filter((key) => key !== lang)];
    for (const key of candidates) {
        const text = i18n[key];
        if (text) {
            return text;
        }
    }
    return '';
};

const absoluteImage = (image: string) => (image.startsWith('http') ? image : new URL(image, rootUrl).href);

// Story pages use /main/{no}, /tradfi/{no} or /monitor/{no}
const storyPrefix = (channels?: string[]) => {
    if (channels?.includes('main')) {
        return '/main';
    }
    if (channels?.includes('tradfi')) {
        return '/tradfi';
    }
    return '/monitor';
};

const NewsDescription = ({ images, paragraphs }: { images: string[]; paragraphs: string[] }) => (
    <>
        {images.map((image) => (
            <>
                <img src={image} />
                <br />
            </>
        ))}
        {paragraphs.map((paragraph) => (
            <p>{paragraph}</p>
        ))}
    </>
);

const feedDescription = (channel: string, label: string, lang: string) => {
    if (channel === 'main') {
        return lang === 'zh' ? '方程式新闻（Equation News）加密快讯，7×24 小时更新' : 'Equation News crypto newswire, updated 24/7';
    }
    return lang === 'zh' ? `${label} · 方程式新闻（Equation News）加密快讯` : `${label} · Equation News crypto newswire`;
};

const handler: Route['handler'] = async (ctx) => {
    const { channel = 'main', lang = 'zh' } = ctx.req.param();

    if (!Object.hasOwn(channelLabels, channel)) {
        throw new InvalidParameterError(`Invalid channel: ${channel}. Available channels: ${Object.keys(channelLabels).join(', ')}`);
    }
    if (!Object.hasOwn(languageLabels, lang)) {
        throw new InvalidParameterError(`Invalid lang: ${lang}. Available languages: ${Object.keys(languageLabels).join(', ')}`);
    }

    const requestedLimit = Math.trunc(Number(ctx.req.query('limit') ?? '50'));
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 100) : 50;

    const response = await ofetch<{ items?: NewsItem[] }>(apiUrl, {
        query: {
            ch: channel,
            limit,
        },
    });

    const data: DataItem[] = (response.items ?? []).map((item) => {
        const paragraphs = pickText(item, lang as Lang)
            .split(/\r?\n+/)
            .map((line) => line.trim())
            .filter(Boolean);
        const [headline, ...body] = paragraphs;
        const images = (item.images ?? []).map((image) => absoluteImage(image));
        const source = lang === 'zh' ? item.source?.display_zh || item.source?.display : item.source?.display;

        return {
            title: headline ?? `#${item.no}`,
            description: body.length > 0 || images.length > 0 ? renderToString(<NewsDescription images={images} paragraphs={body} />) : undefined,
            link: `${rootUrl}${item.path ?? `${storyPrefix(item.channels)}/${item.no}`}`,
            pubDate: item.published_ts ? parseDate(item.published_ts) : undefined,
            author: source ?? undefined,
            category: item.channels?.map((itemChannel) => channelLabel(itemChannel, lang)),
        };
    });

    const label = channelLabel(channel, lang);

    return {
        title: channel === 'main' ? siteName(lang) : `${siteName(lang)} - ${label}`,
        description: feedDescription(channel, label, lang),
        link: channel === 'all' || channel === 'main' ? `${rootUrl}/` : `${rootUrl}/?ch=${channel}`,
        image: `${rootUrl}/_shared/brand/apple-touch-icon.png`,
        language: (lang === 'zh' ? 'zh-CN' : lang) as Language,
        item: data,
    };
};

export const route: Route = {
    path: '/:channel?/:lang?',
    categories: ['new-media'],
    view: ViewType.Notifications,
    example: '/eqn/main',
    parameters: {
        channel: {
            description: '频道；`all` 为全部频道（默认 `main`）',
            default: 'main',
            options: [
                { value: 'main', label: '主频道 Main' },
                { value: 'all', label: '全部频道 All' },
                { value: 'tradfi', label: '方程式财经 TradFi' },
                { value: 'binance', label: '币安公告 Binance' },
                { value: 'korea', label: '韩所监控 Korean Exchanges' },
                { value: 'pricechange', label: '价格异动 Price Moves' },
                { value: 'oi', label: 'OI价格异动 OI & Price Moves' },
                { value: 'major', label: '大幅波动 Big Moves' },
                { value: 'tier2', label: '二线上新 Tier-2 Listings' },
                { value: 'tier3', label: '三线上新 Tier-3 Listings' },
                { value: 'alpha', label: '币安Alpha Binance Alpha' },
                { value: 'cz', label: 'CZ&何一 CZ & Yi He Watch' },
                { value: 'earn', label: '理财提醒 Earn Alerts' },
                { value: 'hl', label: 'Hyperliquid' },
                { value: 'tfmoves', label: '美股重大行情 US Stock Big Moves' },
            ],
        },
        lang: {
            description: '语言；缺少对应译文时依次回退到中文、英文、韩文（`tr` / `ru` 仅在源站提供译文时生效）',
            default: 'zh',
            options: [
                { value: 'zh', label: '中文' },
                { value: 'en', label: 'English' },
                { value: 'ko', label: '한국어' },
                { value: 'tr', label: 'Türkçe' },
                { value: 'ru', label: 'Русский' },
            ],
        },
    },
    radar: [
        {
            source: ['eqn.news/'],
            target: '/main',
        },
    ],
    name: '快讯',
    description: '数据来自「方程式新闻」公开 JSON 接口，免 Key。`all` 为全部频道；`lang` 缺少对应译文时回退到中文、英文、韩文，`tr` / `ru` 仅在源站提供译文时生效。',
    maintainers: ['crypto-2042'],
    handler,
    url: 'eqn.news/',
};
