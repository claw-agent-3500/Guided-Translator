// Workflow Step Indicator Component
// Shows the current step in the translation workflow

import { Upload, Wand2, Edit3, Download, CheckCircle } from 'lucide-react';
import type { AppStatus } from '../types';

interface WorkflowStep {
    id: number;
    label: string;
    shortLabel: string;
    description: string;
    icon: React.ElementType;
}

const WORKFLOW_STEPS: WorkflowStep[] = [
    { id: 0, label: 'Upload Files', shortLabel: 'Upload', description: 'Upload glossary and document', icon: Upload },
    { id: 1, label: 'Review & Translate', shortLabel: 'Translate', description: 'Review chunks and start translation', icon: Wand2 },
    { id: 2, label: 'Edit & Refine', shortLabel: 'Edit', description: 'Review and correct translations', icon: Edit3 },
    { id: 3, label: 'Export Results', shortLabel: 'Export', description: 'Download translated document', icon: Download },
];

interface WorkflowIndicatorProps {
    currentStatus: AppStatus;
    hasGlossary: boolean;
    hasDocument: boolean;
    isTranslating: boolean;
    translationComplete: boolean;
    inEditMode: boolean;
}

export default function WorkflowIndicator({
    currentStatus,
    hasGlossary,
    hasDocument,
    isTranslating,
    translationComplete,
    inEditMode,
}: WorkflowIndicatorProps) {
    // Determine current step based on app state
    const getCurrentStep = (): number => {
        if (inEditMode) return 3; // Edit & Refine step
        if (translationComplete) return 3; // Export step
        if (isTranslating || currentStatus === 'translating') return 1; // Translation
        if (hasDocument) return 1; // Ready to translate
        return 0; // Upload step
    };

    // Check if a step is completed
    const isStepComplete = (stepId: number): boolean => {
        const currentStep = getCurrentStep();
        if (stepId < currentStep) return true;
        if (stepId === currentStep) return isTranslating || inEditMode || translationComplete;
        return false;
    };

    // Check if step is active (current)
    const isStepActive = (stepId: number): boolean => {
        const currentStep = getCurrentStep();
        return stepId === currentStep;
    };

    const getStepState = (stepId: number): 'complete' | 'active' | 'pending' => {
        if (isStepComplete(stepId) && !isStepActive(stepId)) return 'complete';
        if (isStepActive(stepId)) return 'active';
        return 'pending';
    };

    return (
        <div className="bg-white rounded-xl shadow-md p-4 mb-6">
            <div className="flex items-center justify-between">
                {WORKFLOW_STEPS.map((step, index) => {
                    const state = getStepState(step.id);
                    const Icon = step.icon;
                    
                    // State-based styling
                    const stateClasses = {
                        complete: 'bg-emerald-500 border-emerald-500 text-white',
                        active: 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200',
                        pending: 'bg-slate-100 border-slate-200 text-slate-400',
                    };
                    
                    const iconStateClasses = {
                        complete: 'text-white',
                        active: 'text-white',
                        pending: 'text-slate-400',
                    };

                    return (
                        <div key={step.id} className="flex items-center flex-1">
                            {/* Step */}
                            <div className="flex flex-col items-center flex-1">
                                <div 
                                    className={`
                                        w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all duration-300
                                        ${stateClasses[state]}
                                    `}
                                >
                                    {state === 'complete' ? (
                                        <CheckCircle className="w-6 h-6" />
                                    ) : (
                                        <Icon className={`w-5 h-5 ${iconStateClasses[state]}`} />
                                    )}
                                </div>
                                <div className="mt-2 text-center hidden sm:block">
                                    <p className={`text-sm font-semibold ${state === 'active' ? 'text-blue-600' : state === 'complete' ? 'text-emerald-600' : 'text-slate-400'}`}>
                                        {step.label}
                                    </p>
                                    <p className="text-xs text-slate-500 mt-0.5 hidden md:block">
                                        {step.description}
                                    </p>
                                </div>
                                {/* Mobile: just show short label */}
                                <div className="mt-2 text-center sm:hidden">
                                    <p className={`text-xs font-semibold ${state === 'active' ? 'text-blue-600' : state === 'complete' ? 'text-emerald-600' : 'text-slate-400'}`}>
                                        {step.shortLabel}
                                    </p>
                                </div>
                            </div>
                            
                            {/* Connector line */}
                            {index < WORKFLOW_STEPS.length - 1 && (
                                <div className="flex-1 h-1.5 mx-2 mb-6 rounded-full overflow-hidden">
                                    <div 
                                        className={`h-full transition-all duration-500 ${
                                            state === 'complete' ? 'bg-emerald-500' : 'bg-slate-200'
                                        }`}
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            
            {/* Step-specific help text */}
            {getCurrentStep() === 0 && !hasDocument && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-700 flex items-center gap-2">
                    <span className="text-lg">💡</span>
                    Start by uploading a glossary CSV file (optional but recommended), then upload your document.
                </div>
            )}
            {getCurrentStep() === 0 && hasDocument && !hasGlossary && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-700 flex items-center gap-2">
                    <span className="text-lg">💡</span>
                    Document loaded! For better accuracy, upload a glossary with domain-specific terms.
                </div>
            )}
            {getCurrentStep() === 1 && hasDocument && !isTranslating && (
                <div className="mt-4 p-3 bg-emerald-50 rounded-lg text-sm text-emerald-700 flex items-center gap-2">
                    <span className="text-lg">🎯</span>
                    Ready to translate! Click the main button below to begin.
                </div>
            )}
            {getCurrentStep() === 1 && isTranslating && (
                <div className="mt-4 p-3 bg-amber-50 rounded-lg text-sm text-amber-700 flex items-center gap-2">
                    <span className="text-lg">⏳</span>
                    Translation in progress. This may take a few minutes depending on document size.
                </div>
            )}
            {getCurrentStep() === 3 && translationComplete && !inEditMode && (
                <div className="mt-4 p-3 bg-purple-50 rounded-lg text-sm text-purple-700 flex items-center gap-2">
                    <span className="text-lg">✨</span>
                    Translation complete! Review the results and download in your preferred format.
                </div>
            )}
        </div>
    );
}