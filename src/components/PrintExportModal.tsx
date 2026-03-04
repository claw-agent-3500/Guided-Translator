// Print Export Modal - Paged.js PDF export with preview
// Supports: Chinese-only, Bilingual (side-by-side), and legacy backend PDF

import { useState, useRef, useEffect } from 'react';
import { X, Printer, Eye, FileText, Loader2, Download } from 'lucide-react';
import type { TranslatedChunk } from '../types';
import '../styles/print.css';

// Paged.js types
declare global {
    interface Window {
        PagedPolyfill?: {
            preview: () => Promise<void>;
        };
        Paged?: {
            Previewer: new () => {
                preview: (content: HTMLElement, stylesheets: string[], renderTo: HTMLElement) => Promise<{
                    total: number;
                }>;
            };
        };
    }
}

type ExportMode = 'chinese' | 'bilingual' | 'backend';

interface PrintExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    chunks: TranslatedChunk[];
    title?: string;
    onBackendExport?: () => Promise<void>;
}

export default function PrintExportModal({
    isOpen,
    onClose,
    chunks,
    title = 'Technical Translation',
    onBackendExport
}: PrintExportModalProps) {
    const [mode, setMode] = useState<ExportMode>('chinese');
    const [isPreviewReady, setIsPreviewReady] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [pageCount, setPageCount] = useState(0);
    const previewContainerRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    // Reset when modal opens
    useEffect(() => {
        if (isOpen) {
            setIsPreviewReady(false);
            setPageCount(0);
        }
    }, [isOpen]);

    // Generate preview with Paged.js
    const handlePreview = async () => {
        if (!previewContainerRef.current || !contentRef.current) return;

        setIsLoading(true);
        setIsPreviewReady(false);

        try {
            // Dynamically import Paged.js
            const { Previewer } = await import('pagedjs');

            // Clear previous preview
            previewContainerRef.current.innerHTML = '';

            // Clone content for preview
            const content = contentRef.current.cloneNode(true) as HTMLElement;

            // Create previewer
            const paged = new Previewer();
            const flow = await paged.preview(
                content,
                ['/src/styles/print.css'],
                previewContainerRef.current
            );

            setPageCount(flow.total);
            setIsPreviewReady(true);
        } catch (error) {
            console.error('Paged.js preview failed:', error);
            alert('Preview generation failed. You can still print manually.');
        } finally {
            setIsLoading(false);
        }
    };

    // Print to PDF
    const handlePrint = () => {
        window.print();
    };

    // Use backend export
    const handleBackendExport = async () => {
        if (onBackendExport) {
            setIsLoading(true);
            try {
                await onBackendExport();
            } finally {
                setIsLoading(false);
            }
        }
    };

    // Render chunk as HTML
    const renderChunk = (chunk: TranslatedChunk, index: number) => {
        const translation = chunk.translation || '';

        // Detect markdown headings
        if (translation.startsWith('# ')) {
            return <h1 key={index}>{translation.slice(2)}</h1>;
        }
        if (translation.startsWith('## ')) {
            return <h2 key={index}>{translation.slice(3)}</h2>;
        }
        if (translation.startsWith('### ')) {
            return <h3 key={index}>{translation.slice(4)}</h3>;
        }

        // Handle lists
        if (translation.match(/^[-*•]\s/m)) {
            const items = translation.split('\n').filter(line => line.match(/^[-*•]\s/));
            return (
                <ul key={index}>
                    {items.map((item, i) => (
                        <li key={i}>{item.replace(/^[-*•]\s/, '')}</li>
                    ))}
                </ul>
            );
        }

        // Default: paragraph
        return <p key={index}>{translation}</p>;
    };

    // Render bilingual chunk
    const renderBilingualChunk = (chunk: TranslatedChunk, index: number) => {
        return (
            <div key={index} className="bilingual-row">
                <div className="original-column">
                    <div className="column-header">Original (EN)</div>
                    <p>{chunk.text || ''}</p>
                </div>
                <div className="translation-column">
                    <div className="column-header">Translation (ZH)</div>
                    <p>{chunk.translation || ''}</p>
                </div>
            </div>
        );
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col m-4">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    <div className="flex items-center gap-3">
                        <FileText className="w-6 h-6 text-blue-600" />
                        <h2 className="text-xl font-bold text-slate-800">Smart PDF Export</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Mode Selector */}
                <div className="flex gap-2 p-4 bg-slate-50 border-b">
                    <button
                        onClick={() => setMode('chinese')}
                        className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${mode === 'chinese'
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'bg-white text-slate-600 hover:bg-slate-100 border'
                            }`}
                    >
                        Chinese Only
                    </button>
                    <button
                        onClick={() => setMode('bilingual')}
                        className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${mode === 'bilingual'
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'bg-white text-slate-600 hover:bg-slate-100 border'
                            }`}
                    >
                        Bilingual (EN/ZH)
                    </button>
                    <button
                        onClick={() => setMode('backend')}
                        className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${mode === 'backend'
                                ? 'bg-amber-600 text-white shadow-md'
                                : 'bg-white text-slate-600 hover:bg-slate-100 border'
                            }`}
                    >
                        Backend PDF
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-hidden flex">
                    {mode === 'backend' ? (
                        /* Backend mode explanation */
                        <div className="flex-1 p-8 flex flex-col items-center justify-center text-center">
                            <Download size={64} className="text-amber-500 mb-4" />
                            <h3 className="text-xl font-semibold mb-2">Backend PDF Generation</h3>
                            <p className="text-slate-600 max-w-md mb-6">
                                Uses the server-side fpdf2 library. Good for basic documents
                                but may have limited layout control.
                            </p>
                            <button
                                onClick={handleBackendExport}
                                disabled={isLoading}
                                className="px-6 py-3 bg-amber-600 text-white rounded-xl font-semibold hover:bg-amber-700 disabled:opacity-50 flex items-center gap-2"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                        Generating...
                                    </>
                                ) : (
                                    <>
                                        <Download size={20} />
                                        Download Backend PDF
                                    </>
                                )}
                            </button>
                        </div>
                    ) : (
                        /* Paged.js preview */
                        <div className="flex-1 flex flex-col">
                            {/* Preview toolbar */}
                            <div className="flex items-center gap-4 p-3 bg-slate-100 border-b">
                                <button
                                    onClick={handlePreview}
                                    disabled={isLoading}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Generating...
                                        </>
                                    ) : (
                                        <>
                                            <Eye size={18} />
                                            Generate Preview
                                        </>
                                    )}
                                </button>

                                {pageCount > 0 && (
                                    <span className="text-sm text-slate-600">
                                        {pageCount} pages
                                    </span>
                                )}

                                <div className="flex-1" />

                                <button
                                    onClick={handlePrint}
                                    disabled={!isPreviewReady}
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                >
                                    <Printer size={18} />
                                    Print / Save PDF
                                </button>
                            </div>

                            {/* Preview container */}
                            <div className="flex-1 overflow-auto bg-slate-200 p-4">
                                {isPreviewReady ? (
                                    <div
                                        ref={previewContainerRef}
                                        className="pagedjs-preview"
                                    />
                                ) : (
                                    <div className="print-preview-container">
                                        {/* Hidden source content for Paged.js */}
                                        <div
                                            ref={contentRef}
                                            className={`print-document ${mode === 'bilingual' ? 'bilingual' : ''}`}
                                        >
                                            <div className="doc-title">{title}</div>

                                            {mode === 'bilingual'
                                                ? chunks.map((chunk, i) => renderBilingualChunk(chunk, i))
                                                : chunks.map((chunk, i) => renderChunk(chunk, i))
                                            }
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t bg-slate-50 text-sm text-slate-500">
                    💡 <strong>Tip:</strong> Use "Print / Save PDF" and choose "Save as PDF" in the print dialog for best results.
                </div>
            </div>
        </div>
    );
}
