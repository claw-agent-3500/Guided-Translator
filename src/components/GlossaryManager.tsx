// Glossary Manager Component
// Full CRUD panel for managing glossary terms via backend API

import { useState, useEffect, useCallback } from 'react';
import {
    Book,
    Plus,
    Trash2,
    Upload,
    Search,
    X,
    Check,
    AlertCircle,
    Edit2,
    Filter,
    RefreshCw
} from 'lucide-react';
import {
    GlossaryTerm,
    GlossaryUploadResult,
    listGlossary,
    listGlossaryCategories,
    createGlossaryTerm,
    updateGlossaryTerm,
    deleteGlossaryTerm,
    uploadGlossary,
    clearGlossary
} from '../services/apiClient';

interface GlossaryManagerProps {
    onTermsUpdated?: () => void;
}

export default function GlossaryManager({ onTermsUpdated }: GlossaryManagerProps) {
    // State
    const [terms, setTerms] = useState<GlossaryTerm[]>([]);
    const [categories, setCategories] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string>('');

    // Add/Edit form
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingTerm, setEditingTerm] = useState<GlossaryTerm | null>(null);
    const [formData, setFormData] = useState<GlossaryTerm>({
        english: '',
        chinese: '',
        notes: '',
        category: ''
    });

    // Upload result
    const [uploadResult, setUploadResult] = useState<GlossaryUploadResult | null>(null);

    // Load terms and categories
    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [termsData, categoriesData] = await Promise.all([
                listGlossary(selectedCategory || undefined, searchQuery || undefined),
                listGlossaryCategories()
            ]);
            setTerms(termsData);
            setCategories(categoriesData);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load glossary');
        } finally {
            setLoading(false);
        }
    }, [selectedCategory, searchQuery]);

    useEffect(() => {
        loadData();
    }, [loadData]);

    // Handle file upload
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setLoading(true);
        setError(null);
        setUploadResult(null);

        try {
            const result = await uploadGlossary(file);
            setUploadResult(result);
            await loadData();
            onTermsUpdated?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setLoading(false);
            e.target.value = ''; // Reset input
        }
    };

    // Handle form submit (add or edit)
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.english.trim() || !formData.chinese.trim()) return;

        setLoading(true);
        setError(null);

        try {
            if (editingTerm?.id) {
                await updateGlossaryTerm(editingTerm.id, formData);
            } else {
                await createGlossaryTerm(formData);
            }

            setFormData({ english: '', chinese: '', notes: '', category: '' });
            setEditingTerm(null);
            setShowAddForm(false);
            await loadData();
            onTermsUpdated?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Operation failed');
        } finally {
            setLoading(false);
        }
    };

    // Handle delete
    const handleDelete = async (id: number) => {
        if (!confirm('Delete this term?')) return;

        setLoading(true);
        try {
            await deleteGlossaryTerm(id);
            await loadData();
            onTermsUpdated?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Delete failed');
        } finally {
            setLoading(false);
        }
    };

    // Handle clear all
    const handleClearAll = async () => {
        if (!confirm('Delete ALL glossary terms? This cannot be undone!')) return;

        setLoading(true);
        try {
            await clearGlossary();
            await loadData();
            onTermsUpdated?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Clear failed');
        } finally {
            setLoading(false);
        }
    };

    // Start editing a term
    const startEdit = (term: GlossaryTerm) => {
        setEditingTerm(term);
        setFormData({ ...term });
        setShowAddForm(true);
    };

    // Cancel form
    const cancelForm = () => {
        setShowAddForm(false);
        setEditingTerm(null);
        setFormData({ english: '', chinese: '', notes: '', category: '' });
    };

    return (
        <div className="glossary-manager" style={{
            backgroundColor: '#1a1a2e',
            borderRadius: '12px',
            padding: '20px',
            color: '#e0e0e0'
        }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Book size={24} color="#8b5cf6" />
                    <h2 style={{ margin: 0, fontSize: '18px' }}>Glossary Manager</h2>
                    <span style={{
                        backgroundColor: '#8b5cf6',
                        color: 'white',
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '12px'
                    }}>
                        {terms.length} terms
                    </span>
                </div>
                <button
                    onClick={() => loadData()}
                    disabled={loading}
                    style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: '#888'
                    }}
                    title="Refresh"
                >
                    <RefreshCw size={18} className={loading ? 'spinning' : ''} />
                </button>
            </div>

            {/* Error display */}
            {error && (
                <div style={{
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid #ef4444',
                    borderRadius: '8px',
                    padding: '12px',
                    marginBottom: '16px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                }}>
                    <AlertCircle size={18} color="#ef4444" />
                    <span>{error}</span>
                </div>
            )}

            {/* Upload result */}
            {uploadResult && (
                <div style={{
                    backgroundColor: uploadResult.success ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    border: `1px solid ${uploadResult.success ? '#22c55e' : '#ef4444'}`,
                    borderRadius: '8px',
                    padding: '12px',
                    marginBottom: '16px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                        <Check size={18} color="#22c55e" />
                        <strong>Upload Complete</strong>
                    </div>
                    <div style={{ fontSize: '14px', color: '#aaa' }}>
                        Added: {uploadResult.terms_added} | Updated: {uploadResult.terms_updated}
                        {uploadResult.errors.length > 0 && (
                            <span style={{ color: '#ef4444' }}> | Errors: {uploadResult.errors.length}</span>
                        )}
                    </div>
                    <button
                        onClick={() => setUploadResult(null)}
                        style={{
                            marginTop: '8px',
                            background: 'none',
                            border: 'none',
                            color: '#888',
                            cursor: 'pointer',
                            fontSize: '12px'
                        }}
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* Actions bar */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
                {/* Search */}
                <div style={{
                    flex: 1,
                    minWidth: '200px',
                    display: 'flex',
                    alignItems: 'center',
                    backgroundColor: '#2a2a3e',
                    borderRadius: '8px',
                    padding: '0 12px'
                }}>
                    <Search size={16} color="#666" />
                    <input
                        type="text"
                        placeholder="Search terms..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        style={{
                            flex: 1,
                            padding: '10px',
                            background: 'none',
                            border: 'none',
                            color: '#e0e0e0',
                            outline: 'none'
                        }}
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery('')}
                            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                        >
                            <X size={16} color="#666" />
                        </button>
                    )}
                </div>

                {/* Category filter */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    backgroundColor: '#2a2a3e',
                    borderRadius: '8px',
                    padding: '0 12px'
                }}>
                    <Filter size={16} color="#666" />
                    <select
                        value={selectedCategory}
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        style={{
                            padding: '10px',
                            background: 'none',
                            border: 'none',
                            color: '#e0e0e0',
                            outline: 'none',
                            cursor: 'pointer'
                        }}
                    >
                        <option value="">All Categories</option>
                        {categories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                </div>

                {/* Add button */}
                <button
                    onClick={() => setShowAddForm(true)}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '10px 16px',
                        backgroundColor: '#8b5cf6',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: 500
                    }}
                >
                    <Plus size={16} />
                    Add Term
                </button>

                {/* Upload button */}
                <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '10px 16px',
                    backgroundColor: '#2a2a3e',
                    color: '#e0e0e0',
                    border: '1px dashed #444',
                    borderRadius: '8px',
                    cursor: 'pointer'
                }}>
                    <Upload size={16} />
                    Upload CSV
                    <input
                        type="file"
                        accept=".csv"
                        onChange={handleFileUpload}
                        style={{ display: 'none' }}
                    />
                </label>
            </div>

            {/* Add/Edit Form */}
            {showAddForm && (
                <form onSubmit={handleSubmit} style={{
                    backgroundColor: '#2a2a3e',
                    borderRadius: '8px',
                    padding: '16px',
                    marginBottom: '16px'
                }}>
                    <h3 style={{ margin: '0 0 12px', fontSize: '14px' }}>
                        {editingTerm ? 'Edit Term' : 'Add New Term'}
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <input
                            type="text"
                            placeholder="English term *"
                            value={formData.english}
                            onChange={(e) => setFormData({ ...formData, english: e.target.value })}
                            required
                            style={{
                                padding: '10px',
                                backgroundColor: '#1a1a2e',
                                border: '1px solid #444',
                                borderRadius: '6px',
                                color: '#e0e0e0',
                                outline: 'none'
                            }}
                        />
                        <input
                            type="text"
                            placeholder="Chinese translation *"
                            value={formData.chinese}
                            onChange={(e) => setFormData({ ...formData, chinese: e.target.value })}
                            required
                            style={{
                                padding: '10px',
                                backgroundColor: '#1a1a2e',
                                border: '1px solid #444',
                                borderRadius: '6px',
                                color: '#e0e0e0',
                                outline: 'none'
                            }}
                        />
                        <input
                            type="text"
                            placeholder="Category (optional)"
                            value={formData.category || ''}
                            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                            style={{
                                padding: '10px',
                                backgroundColor: '#1a1a2e',
                                border: '1px solid #444',
                                borderRadius: '6px',
                                color: '#e0e0e0',
                                outline: 'none'
                            }}
                        />
                        <input
                            type="text"
                            placeholder="Notes (optional)"
                            value={formData.notes || ''}
                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            style={{
                                padding: '10px',
                                backgroundColor: '#1a1a2e',
                                border: '1px solid #444',
                                borderRadius: '6px',
                                color: '#e0e0e0',
                                outline: 'none'
                            }}
                        />
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                        <button
                            type="submit"
                            disabled={loading}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '8px 16px',
                                backgroundColor: '#22c55e',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer'
                            }}
                        >
                            <Check size={16} />
                            {editingTerm ? 'Update' : 'Add'}
                        </button>
                        <button
                            type="button"
                            onClick={cancelForm}
                            style={{
                                padding: '8px 16px',
                                backgroundColor: '#444',
                                color: '#e0e0e0',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer'
                            }}
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            )}

            {/* Terms list */}
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {loading && terms.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: '#666' }}>
                        <RefreshCw size={24} className="spinning mx-auto mb-3" />
                        <div>Loading glossary...</div>
                    </div>
                ) : terms.length === 0 ? (
                    <div style={{ 
                        textAlign: 'center', 
                        padding: '40px 20px', 
                        color: '#888',
                        backgroundColor: '#1a1a2e',
                        borderRadius: '8px',
                        border: '1px dashed #333'
                    }}>
                        <Book size={40} className="mx-auto mb-3 opacity-50" />
                        <div style={{ fontSize: '15px', fontWeight: 500, marginBottom: '8px', color: '#aaa' }}>
                            No glossary terms yet
                        </div>
                        <div style={{ fontSize: '13px', color: '#666', lineHeight: '1.6' }}>
                            Upload a CSV file with your terminology<br/>
                            or add terms manually using the form above
                        </div>
                        <div style={{ marginTop: '16px', fontSize: '12px', color: '#555', backgroundColor: '#2a2a3e', padding: '8px 12px', borderRadius: '6px', display: 'inline-block' }}>
                            📋 Suggested CSV format:<br/>
                            <code style={{ color: '#8b5cf6' }}>English,Chinese,Category</code>
                        </div>
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid #333' }}>
                                <th style={{ textAlign: 'left', padding: '10px', color: '#888', fontSize: '12px' }}>English</th>
                                <th style={{ textAlign: 'left', padding: '10px', color: '#888', fontSize: '12px' }}>Chinese</th>
                                <th style={{ textAlign: 'left', padding: '10px', color: '#888', fontSize: '12px' }}>Category</th>
                                <th style={{ textAlign: 'right', padding: '10px', color: '#888', fontSize: '12px' }}>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {terms.map((term) => (
                                <tr
                                    key={term.id}
                                    style={{
                                        borderBottom: '1px solid #2a2a3e',
                                        transition: 'background-color 0.2s'
                                    }}
                                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2a2a3e')}
                                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                                >
                                    <td style={{ padding: '12px 10px' }}>{term.english}</td>
                                    <td style={{ padding: '12px 10px' }}>{term.chinese}</td>
                                    <td style={{ padding: '12px 10px' }}>
                                        {term.category && (
                                            <span style={{
                                                backgroundColor: '#8b5cf6',
                                                color: 'white',
                                                padding: '2px 8px',
                                                borderRadius: '4px',
                                                fontSize: '11px'
                                            }}>
                                                {term.category}
                                            </span>
                                        )}
                                    </td>
                                    <td style={{ padding: '12px 10px', textAlign: 'right' }}>
                                        <button
                                            onClick={() => startEdit(term)}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                cursor: 'pointer',
                                                padding: '4px',
                                                marginRight: '4px'
                                            }}
                                            title="Edit"
                                        >
                                            <Edit2 size={16} color="#8b5cf6" />
                                        </button>
                                        <button
                                            onClick={() => term.id && handleDelete(term.id)}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                cursor: 'pointer',
                                                padding: '4px'
                                            }}
                                            title="Delete"
                                        >
                                            <Trash2 size={16} color="#ef4444" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Footer with clear all */}
            {terms.length > 0 && (
                <div style={{
                    marginTop: '16px',
                    paddingTop: '16px',
                    borderTop: '1px solid #333',
                    display: 'flex',
                    justifyContent: 'flex-end'
                }}>
                    <button
                        onClick={handleClearAll}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '8px 12px',
                            backgroundColor: 'transparent',
                            color: '#ef4444',
                            border: '1px solid #ef4444',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '12px'
                        }}
                    >
                        <Trash2 size={14} />
                        Clear All
                    </button>
                </div>
            )}
        </div>
    );
}
