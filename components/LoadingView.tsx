import React from 'react';

interface LoadingViewProps {
    onCancel?: () => void;
}

const LoadingView: React.FC<LoadingViewProps> = ({ onCancel }) => {
  return (
    <div className="flex flex-col items-center justify-center py-20 space-y-8 animate-fade-in">
      <div className="relative">
        <div className="w-16 h-16 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
            <i className="fas fa-book-open text-blue-600 text-sm"></i>
        </div>
      </div>
      <div className="text-center space-y-2">
        <h3 className="text-xl font-medium text-slate-800">Analyzing Research</h3>
        <p className="text-slate-500 text-sm max-w-md mx-auto mb-4">
          Searching repositories, reading content, and extracting insights using Gemini 2.0...
        </p>
        
        {onCancel && (
            <button 
                onClick={onCancel}
                className="mt-4 px-4 py-2 bg-white border border-red-200 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors shadow-sm flex items-center justify-center gap-2 mx-auto"
            >
                <i className="fas fa-stop-circle"></i> Stop Analysis
            </button>
        )}
      </div>
    </div>
  );
};

export default LoadingView;