// Editing Interface Component
// Display 3-4 chunks at once with side-by-side English/Chinese view

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Edit3, Save, ChevronLeft, ChevronRight, Loader2, FileText, Clock } from 'lucide-react';
import type { TranslatedChunk } from '../types';

interface EditingInterfaceProps {
    chunks: TranslatedChunk[];
    allChunks: TranslatedChunk[];
    currentPage: number;
    totalPages: number;
    onSubmit: (editedChunks: TranslatedChunk[]) => Promise<void>;
    onNavigate: (page: number) => void;
    onReviewComplete?: () => void;  // Called when last page is submitted
    isAnalyzing: boolean;
}

const CHUNKS_PER_PAGE = 4;

// Helper to render markdown images as HTML
const renderMarkdownContent = (text: string): string => {
    // Convert markdown images to HTML img tags
    const withImages = text.replace(
        /!\[([^\]]*)\]\(([^)]+)\)/g,
        '<img src="$2" alt="$1" class="max-w-full h-auto rounded-lg my-2 border border-slate-200" loading="lazy" />'
    );
    // Also handle line breaks for better display
    return withImages.replace(/\n/g, '<br/>');
};

export default function EditingInterface({
    chunks,
    allChunks,
    currentPage,
    totalPages,
    onSubmit,
    onNavigate,
    onReviewComplete,
    isAnalyzing,
}: EditingInterfaceProps) {
    const [editedChunks, setEditedChunks] = useState<TranslatedChunk[]>(chunks);
    const [hasChanges, setHasChanges] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Refs for auto-resize textareas
    const textareaRefs = useRef<(HTMLTextAreaElement | null)[]>([]);
    const originalRefs = useRef<(HTMLDivElement | null)[]>([]);

    // Auto-resize textarea to match content
    const autoResizeTextarea = useCallback((textarea: HTMLTextAreaElement | null, originalDiv: HTMLDivElement | null) => {
        if (!textarea) return;

        // Reset height to auto to get correct scrollHeight
        textarea.style.height = 'auto';

        // Get the original text container height
        const originalHeight = originalDiv?.offsetHeight || 0;
        const scrollHeight = textarea.scrollHeight;

        // Use the larger of scroll height or original container height
        const targetHeight = Math.max(scrollHeight, originalHeight - 40); // 40px for padding/label
        textarea.style.height = `${Math.max(120, targetHeight)}px`;
    }, []);

    // Sync textarea heights on mount and when chunks change
    useEffect(() => {
        editedChunks.forEach((_, idx) => {
            autoResizeTextarea(textareaRefs.current[idx], originalRefs.current[idx]);
        });
    }, [editedChunks, autoResizeTextarea]);

    // Auto-save to local state every 2 seconds
    useEffect(() => {
        const hasModifications = editedChunks.some((chunk, idx) => {
            return chunk.translation !== chunks[idx]?.translation;
        });
        setHasChanges(hasModifications);
    }, [editedChunks, chunks]);

    // Update local state when chunks prop changes
    useEffect(() => {
        setEditedChunks(chunks);
    }, [chunks]);

    const handleTextChange = (chunkIndex: number, newText: string) => {
        const updated = [...editedChunks];
        updated[chunkIndex] = {
            ...updated[chunkIndex],
            translation: newText,
        };
        setEditedChunks(updated);
    };

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ctrl/Cmd + Enter to submit
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                if (!isSaving && !isAnalyzing && editedChunks?.length > 0) {
                    handleSubmit();
                }
            }
            // Alt + Arrow keys for navigation
            if (e.altKey && e.key === 'ArrowRight') {
                e.preventDefault();
                if (currentPage < totalPages - 1) {
                    onNavigate(currentPage + 1);
                }
            }
            if (e.altKey && e.key === 'ArrowLeft') {
                e.preventDefault();
                if (currentPage > 0) {
                    onNavigate(currentPage - 1);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isSaving, isAnalyzing, editedChunks, currentPage, totalPages, onNavigate]);

    // Calculate word/character counts
    const stats = useMemo(() => {
        let words = 0;
        let chars = 0;
        editedChunks?.forEach(chunk => {
            const text = chunk.translation || '';
            chars += text.length;
            words += text.trim() ? text.trim().split(/\s+/).length : 0;
        });
        return { words, chars };
    }, [editedChunks]);

    const handleSubmit = async () => {
        console.log('[EditingInterface] handleSubmit called', {
            editedChunksLength: editedChunks?.length,
            currentPage,
            totalPages,
            isSaving,
            isAnalyzing
        });

        // Guard: Skip if already saving or no chunks
        if (isSaving || isAnalyzing) {
            console.log('[EditingInterface] Already processing, skipping');
            return;
        }

        if (!editedChunks || editedChunks.length === 0) {
            console.log('[EditingInterface] No chunks to submit');
            return;
        }

        setIsSaving(true);
        try {
            await onSubmit(editedChunks);
            setHasChanges(false);

            // Auto-advance to next page if not on the last page
            if (currentPage < totalPages - 1) {
                console.log('[EditingInterface] Navigating to next page');
                onNavigate(currentPage + 1);
            } else {
                console.log('[EditingInterface] Last page submitted - review complete!');
                // Notify parent that review is complete
                if (onReviewComplete) {
                    onReviewComplete();
                }
            }
        } catch (error) {
            console.error('[EditingInterface] Error submitting edits:', error);
        } finally {
            console.log('[EditingInterface] Submit complete, resetting isSaving');
            setIsSaving(false);
        }
    };

    const startChunk = currentPage * CHUNKS_PER_PAGE + 1;
    const endChunk = Math.min(startChunk + CHUNKS_PER_PAGE - 1, allChunks.length);
    const reviewedChunks = allChunks.filter((_, i) => i < currentPage * CHUNKS_PER_PAGE).length;
    const progressPercent = Math.round((reviewedChunks / allChunks.length) * 100);

    return (
        <div className="bg-white rounded-lg shadow-lg p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <Edit3 className="w-6 h-6 text-blue-600" />
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800">Edit & Refine Translation</h2>
                        <p className="text-sm text-slate-500">
                            Make corrections and the AI will learn your preferences
                        </p>
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-sm font-medium text-slate-700">
                        Chunks {startChunk}-{endChunk} of {allChunks.length}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                        <div className="w-32 h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-blue-600 transition-all duration-300"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                        <span className="text-xs text-slate-500">{progressPercent}%</span>
                    </div>
                    {/* Word/Character stats */}
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                        <span className="flex items-center gap-1">
                            <FileText size={12} />
                            {stats.words} words
                        </span>
                        <span className="flex items-center gap-1">
                            <Clock size={12} />
                            {stats.chars} chars
                        </span>
                    </div>
                </div>
            </div>

            {/* Aligned Editing List */}
            <div className="space-y-6 mb-6">
                {editedChunks.map((chunk, idx) => (
                    <div key={chunk.id} className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden flex flex-col md:grid md:grid-cols-2 items-stretch">
                        {/* Original (English) */}
                        <div
                            ref={(el) => { originalRefs.current[idx] = el; }}
                            className="p-4 border-b md:border-b-0 md:border-r border-slate-100 bg-slate-50/50"
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-mono">Chunk {chunk.position + 1}</span>
                                <span className="text-[10px] text-slate-400 px-1.5 py-0.5 bg-slate-100 rounded-full">{chunk.type}</span>
                            </div>
                            <div
                                className="text-slate-800 leading-relaxed doc-content"
                                dangerouslySetInnerHTML={{ __html: renderMarkdownContent(chunk.text) }}
                            />
                        </div>

                        {/* Translation (Editable) */}
                        <div className="p-4 bg-white relative">
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] uppercase tracking-wider text-emerald-600 font-medium">编辑翻译</span>
                                {chunks[idx] && chunk.translation !== chunks[idx].translation && (
                                    <span className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">Modified</span>
                                )}
                            </div>
                            <textarea
                                ref={(el) => { textareaRefs.current[idx] = el; }}
                                value={chunk.translation}
                                onChange={(e) => handleTextChange(idx, e.target.value)}
                                onInput={(e) => autoResizeTextarea(e.currentTarget, originalRefs.current[idx])}
                                placeholder={chunk.translation ? "" : "Translation is empty..."}
                                className="w-full p-3 bg-white text-slate-800 rounded border border-emerald-100 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all resize-y font-sans text-base leading-relaxed doc-content-zh"
                                style={{ minHeight: '120px', overflow: 'hidden' }}
                            />
                        </div>
                    </div>
                ))}
            </div>

            {/* Navigation & Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                <button
                    onClick={() => onNavigate(currentPage - 1)}
                    disabled={currentPage === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    <ChevronLeft className="w-4 h-4" />
                    Previous
                </button>

                <div className="flex items-center gap-4">
                    {hasChanges && (
                        <span className="text-xs text-amber-600 flex items-center gap-1">
                            <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
                            Unsaved changes
                        </span>
                    )}
                    <button
                        onClick={handleSubmit}
                        disabled={isSaving || isAnalyzing}
                        className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg font-medium"
                    >
                        {isSaving || isAnalyzing ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                {isAnalyzing ? 'Analyzing...' : 'Saving...'}
                            </>
                        ) : (
                            <>
                                <Save className="w-4 h-4" />
                                Submit & Analyze Changes
                            </>
                        )}
                    </button>
                </div>

                <button
                    onClick={() => onNavigate(currentPage + 1)}
                    disabled={currentPage >= totalPages - 1}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    Next
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>

            {/* Helper Tips */}
            <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-100">
                <h4 className="text-sm font-semibold text-blue-800 mb-2">💡 Editing Tips</h4>
                <ul className="text-xs text-blue-700 space-y-1 leading-relaxed">
                    <li>• Make terminology corrections and the AI will automatically apply them to similar contexts</li>
                    <li>• Your preferences will be saved to a personal glossary for future translations</li>
                    <li>• Click "Submit & Analyze" to apply your changes across the document</li>
                </ul>
            </div>
        </div>
    );
}
