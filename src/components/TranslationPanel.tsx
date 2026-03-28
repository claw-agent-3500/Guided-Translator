// Translation Panel Component - Side by side view
// Translation Panel Component - Side by side view
import type { TranslatedChunk, TermMatch } from '../types';

interface TranslationPanelProps {
    chunks: TranslatedChunk[];
    onScroll?: (position: number) => void;
    isTranslating?: boolean;
}

export default function TranslationPanel({ chunks, isTranslating = false }: TranslationPanelProps) {
    /**
     * Escape HTML special characters
     */
    const escapeHtml = (text: string) => {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    };

    /**
     * Convert markdown images to HTML img tags
     * Handles: ![alt](url) and ![](url) patterns
     */
    const renderMarkdownImages = (text: string): string => {
        // Match markdown image syntax: ![alt text](url)
        const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;

        return text.replace(imageRegex, (_match, alt, url) => {
            // Create a placeholder that won't be escaped
            // Using data attributes for the actual render
            return `__IMG_START__${url}__IMG_ALT__${alt || 'image'}__IMG_END__`;
        });
    };

    /**
     * Convert image placeholders back to actual img tags (after HTML escaping)
     */
    const restoreImages = (text: string): string => {
        const placeholderRegex = /__IMG_START__(.+?)__IMG_ALT__(.+?)__IMG_END__/g;

        return text.replace(placeholderRegex, (_match, url, alt) => {
            return `<img src="${url}" alt="${alt}" class="max-w-full h-auto rounded-lg my-2 border border-slate-200" loading="lazy" />`;
        });
    };

    /**
     * Highlight terms in text and render images
     */
    const highlightTerms = (text: string, matches: TermMatch[], isTranslation: boolean = false) => {
        // First, extract images and replace with placeholders
        const textWithPlaceholders = renderMarkdownImages(text);

        // Then escape HTML (placeholders are safe ASCII)
        const escapedText = escapeHtml(textWithPlaceholders);
        let result = escapedText;

        // Apply term highlighting
        if (matches.length > 0) {
            // For translation, we need to match the Chinese terms
            const termsToHighlight = isTranslation
                ? matches.map(m => ({ term: m.chinese, tooltip: m.english, type: m.source }))
                : matches.map(m => ({ term: m.english, tooltip: m.chinese, type: m.source }));

            // Sort by length descending to avoid partial matches inside longer matches
            const sortedTerms = [...new Set(termsToHighlight)].sort((a, b) => b.term.length - a.term.length);

            for (const item of sortedTerms) {
                const escapedTerm = escapeHtml(item.term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(escapedTerm, 'g');

                const colorClass = item.type === 'glossary' ? 'term-match-glossary' : 'term-match-new';

                // Use a temporary placeholder to avoid double-highlighting
                result = result.replace(regex, `<mark class="term-match ${colorClass}" title="${escapeHtml(item.tooltip)}">${item.term}</mark>`);
            }
        }

        // Finally, restore images from placeholders
        result = restoreImages(result);

        return result;
    };

    if (chunks.length === 0 && !isTranslating) {
        return (
            <div className="bg-white rounded-lg shadow-md p-8">
                <div className="text-center py-8">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                    </div>
                    <p className="text-slate-600 font-medium mb-2">No translation yet</p>
                    <p className="text-slate-500 text-sm">
                        Upload a glossary and document, then click <span className="font-semibold text-blue-600">Start Translation</span> to begin
                    </p>
                </div>
            </div>
        );
    }

    // Initial Loading State (Before any chunks generated)
    if (chunks.length === 0 && isTranslating) {
        return (
            <div className="bg-white rounded-lg shadow-md overflow-hidden flex flex-col h-[700px]">
                <div className="border-b bg-gray-50 p-4 flex-none grid grid-cols-2 gap-6">
                    <h3 className="font-semibold text-gray-700">Original (English)</h3>
                    <h3 className="font-semibold text-gray-700">Translation (Chinese)</h3>
                </div>
                <div className="flex-grow flex items-center justify-center bg-slate-50/30">
                    <div className="text-center">
                        <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mx-auto mb-4"></div>
                        <h3 className="text-lg font-medium text-slate-800">Initializing Translation Engine</h3>
                        <p className="text-slate-500">Preparing terminology and context...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow-md overflow-hidden flex flex-col h-[500px] sm:h-[700px]">
            <div className="border-b bg-gray-50 p-3 sm:p-4 flex-none grid grid-cols-2 gap-2 sm:gap-6">
                <h3 className="font-semibold text-gray-700 text-sm sm:text-base">Original (English)</h3>
                <h3 className="font-semibold text-gray-700 text-sm sm:text-base">Translation (Chinese)</h3>
            </div>

            <div className="flex-grow overflow-y-auto p-3 sm:p-6 bg-slate-50/30">
                <div className="space-y-3 sm:space-y-4">
                    {chunks.map((chunk, index) => (
                        <div key={chunk.id} className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden flex flex-col lg:grid lg:grid-cols-2 items-stretch">
                            {/* Original Text */}
                            <div className="p-3 sm:p-4 border-b lg:border-b-0 lg:border-r border-slate-100 bg-slate-50/50 h-full">
                                <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1 sm:mb-2 font-mono">Chunk {index + 1}</div>
                                <div
                                    className={`doc-content text-sm sm:text-base ${chunk.type === 'heading' ? 'font-bold text-lg' : ''}`}
                                    dangerouslySetInnerHTML={{
                                        __html: highlightTerms(chunk.text, chunk.matchedTerms, false)
                                    }}
                                />
                            </div>

                            {/* Translated Text */}
                            <div className="p-3 sm:p-4 bg-white h-full">
                                <div className="text-[10px] uppercase tracking-wider text-slate-400 mb-1 sm:mb-2 font-mono lg:text-right">段落 {index + 1}</div>
                                <div
                                    className={`doc-content doc-content-zh text-sm sm:text-base ${chunk.type === 'heading' ? 'font-bold text-lg' : ''}`}
                                    dangerouslySetInnerHTML={{
                                        __html: highlightTerms(chunk.translation, chunk.matchedTerms, true)
                                    }}
                                />
                            </div>
                        </div>
                    ))}

                    {/* Skeleton Loader - Appears at bottom when translating */}
                    {isTranslating && (
                        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden flex flex-col lg:grid lg:grid-cols-2 animate-pulse">
                            <div className="p-3 sm:p-4 lg:border-r border-slate-100 bg-slate-50/50">
                                <div className="h-3 w-16 bg-slate-200 rounded mb-3 sm:mb-4"></div>
                                <div className="h-4 w-full bg-slate-200 rounded mb-2"></div>
                                <div className="h-4 w-3/4 bg-slate-200 rounded mb-2"></div>
                                <div className="h-4 w-5/6 bg-slate-200 rounded"></div>
                            </div>
                            <div className="p-3 sm:p-4 bg-white">
                                <div className="flex justify-end mb-3 sm:mb-4">
                                    <div className="h-3 w-16 bg-slate-200 rounded"></div>
                                </div>
                                <div className="h-4 w-full bg-slate-200 rounded mb-2"></div>
                                <div className="h-4 w-5/6 bg-slate-200 rounded mb-2"></div>
                                <div className="h-4 w-4/6 bg-slate-200 rounded"></div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Legend - Responsive */}
            <div className="border-t bg-gray-50 p-3 sm:p-4 flex flex-wrap gap-3 sm:gap-6 text-xs sm:text-sm flex-none">
                <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-emerald-400"></span>
                    <span className="text-slate-600 font-medium">Glossary</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full bg-sky-400"></span>
                    <span className="text-slate-600 font-medium">Auto-Translated</span>
                </div>
                <div className="ml-auto text-xs text-slate-400 italic hidden sm:block">
                    Hover to see source
                </div>
            </div>
        </div>
    );
}
