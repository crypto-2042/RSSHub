interface RichTextMark {
    type: string;
}

interface RichTextNode {
    nodeType: string;
    value?: string;
    marks?: RichTextMark[];
    data?: {
        uri?: string;
        target?: {
            sys?: {
                id?: string;
            };
        };
    };
    content?: RichTextNode[];
}

export interface RichTextDocument extends RichTextNode {
    nodeType: 'document';
}

const escapeHtml = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

const renderText = (node: RichTextNode) => {
    let html = escapeHtml(node.value ?? '');
    const marks = node.marks ?? [];
    for (const mark of marks) {
        switch (mark.type) {
            case 'bold':
                html = `<strong>${html}</strong>`;
                break;

            case 'italic':
                html = `<em>${html}</em>`;
                break;

            case 'underline':
                html = `<u>${html}</u>`;
                break;

            case 'code':
                html = `<code>${html}</code>`;
                break;

            default:
                break;
        }
    }
    return html;
};

const headingTags: Record<string, string> = {
    'heading-1': 'h1',
    'heading-2': 'h2',
    'heading-3': 'h3',
    'heading-4': 'h4',
    'heading-5': 'h5',
    'heading-6': 'h6',
};

const renderNode = (node: RichTextNode, assets: Map<string, string>): string => {
    const children = () => renderNodes(node.content ?? [], assets);

    if (node.nodeType === 'text') {
        return renderText(node);
    }
    if (node.nodeType === 'paragraph') {
        return `<p>${children()}</p>`;
    }
    if (node.nodeType.startsWith('heading-')) {
        return `<${headingTags[node.nodeType]}>${children()}</${headingTags[node.nodeType]}>`;
    }
    if (node.nodeType === 'hyperlink') {
        return `<a href="${escapeHtml(node.data?.uri ?? '')}">${children()}</a>`;
    }
    if (node.nodeType === 'unordered-list') {
        return `<ul>${children()}</ul>`;
    }
    if (node.nodeType === 'ordered-list') {
        return `<ol>${children()}</ol>`;
    }
    if (node.nodeType === 'list-item') {
        return `<li>${children()}</li>`;
    }
    if (node.nodeType === 'blockquote') {
        return `<blockquote>${children()}</blockquote>`;
    }
    if (node.nodeType === 'hr') {
        return '<hr>';
    }
    if (node.nodeType === 'table') {
        return `<table>${children()}</table>`;
    }
    if (node.nodeType === 'table-row') {
        return `<tr>${children()}</tr>`;
    }
    if (node.nodeType === 'table-cell') {
        return `<td>${children()}</td>`;
    }
    if (node.nodeType === 'table-header-cell') {
        return `<th>${children()}</th>`;
    }
    if (node.nodeType === 'embedded-asset-block') {
        const url = assets.get(node.data?.target?.sys?.id ?? '');
        return url ? `<img src="${escapeHtml(url)}">` : '';
    }
    if (node.nodeType === 'asset-hyperlink') {
        const url = assets.get(node.data?.target?.sys?.id ?? '');
        return url ? `<a href="${escapeHtml(url)}">${children() || escapeHtml(url)}</a>` : children();
    }
    return children();
};

const renderNodes = (nodes: RichTextNode[], assets: Map<string, string>): string => nodes.map((node) => renderNode(node, assets)).join('');

/**
 * Renders a Contentful rich text document to HTML.
 */
export const renderRichText = (document: RichTextDocument, assets: Map<string, string>) => renderNodes(document.content ?? [], assets);
