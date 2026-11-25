import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, X, CheckSquare, Square } from 'lucide-react';

export interface SearchableSelectOption {
  value: string;
  label: string;
  secondaryText?: string;
  extraSearchTerms?: string;
}

interface SearchableSelectProps {
  label?: string;
  icon?: React.ReactNode;
  placeholder?: string;
  searchPlaceholder?: string;
  options: SearchableSelectOption[];
  value: string;
  onChange: (value: string) => void;
  multiple?: boolean;
  selectedValues?: string[];
  onChangeMultiple?: (values: string[]) => void;
  clearValue?: string;
  showClear?: boolean;
  compact?: boolean;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  dropdownClassName?: string;
  emptyMessage?: string;
  id?: string;
}

const normalizeSearchText = (text: string): string =>
  String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

export const SearchableSelect: React.FC<SearchableSelectProps> = ({
  label,
  icon,
  placeholder = 'Seleccionar...',
  searchPlaceholder = 'Escriba para filtrar...',
  options,
  value,
  onChange,
  multiple = false,
  selectedValues = [],
  onChangeMultiple,
  clearValue = '',
  showClear = true,
  compact = false,
  required = false,
  disabled = false,
  className = '',
  dropdownClassName = '',
  emptyMessage = 'No se encontraron opciones',
  id,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues]);
  const selectedOption = options.find((opt) => opt.value === value);
  const hasClearableSelection = multiple
    ? showClear && selectedValues.length > 0
    : showClear && Boolean(selectedOption) && value !== clearValue;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Focus search input when opening
  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setHighlightedIndex(0);
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 30);
    }
  }, [isOpen]);

  const filteredOptions = useMemo(() => {
    const normTerm = normalizeSearchText(searchTerm);
    if (!normTerm) return options;
    const tokens = normTerm.split(/\s+/).filter(Boolean);
    return options.filter((opt) => {
      const hay = normalizeSearchText(
        `${opt.label} ${opt.secondaryText || ''} ${opt.extraSearchTerms || ''} ${opt.value}`
      );
      return tokens.every((tok) => hay.includes(tok));
    });
  }, [options, searchTerm]);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchTerm]);

  const handleSelect = (val: string) => {
    if (multiple && onChangeMultiple) {
      if (val === clearValue) {
        onChangeMultiple([]);
        return;
      }
      const next = new Set(selectedValues);
      if (next.has(val)) {
        next.delete(val);
      } else {
        next.add(val);
      }
      onChangeMultiple(Array.from(next));
      return;
    }
    onChange(val);
    setIsOpen(false);
  };

  const handleSelectAllFiltered = () => {
    if (!multiple || !onChangeMultiple) return;
    const next = new Set(selectedValues);
    filteredOptions.forEach((opt) => {
      if (opt.value && opt.value !== clearValue) {
        next.add(opt.value);
      }
    });
    onChangeMultiple(Array.from(next));
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (multiple && onChangeMultiple) {
      onChangeMultiple([]);
    } else {
      onChange(clearValue);
    }
    setSearchTerm('');
  };

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        filteredOptions.length === 0 ? 0 : Math.min(prev + 1, filteredOptions.length - 1)
      );
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const target = filteredOptions[highlightedIndex] || filteredOptions[0];
      if (target) {
        handleSelect(target.value);
      }
    }
  };

  const multiDisplayLabel = useMemo(() => {
    if (!multiple) return '';
    if (selectedValues.length === 0) {
      const clearOpt = options.find((o) => o.value === clearValue);
      return clearOpt ? clearOpt.label : placeholder;
    }
    if (selectedValues.length === 1) {
      const opt = options.find((o) => o.value === selectedValues[0]);
      return opt ? opt.label : selectedValues[0];
    }
    return `${selectedValues.length} equipos seleccionados`;
  }, [multiple, selectedValues, options, clearValue, placeholder]);

  const isTriggerActive = multiple
    ? selectedValues.length > 0
    : Boolean(selectedOption) && value !== clearValue;

  return (
    <div className={`relative ${className}`} ref={containerRef} id={id}>
      {label && (
        <label className="block text-xs font-semibold text-slate-400 mb-1.5 flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            {icon}
            {label}
            {required && <span className="text-amber-500">*</span>}
          </span>
          {isTriggerActive && !disabled && (
            <span className="text-[10px] text-amber-400 font-mono">
              {multiple ? `${selectedValues.length} selec.` : '1 seleccionado'}
            </span>
          )}
        </label>
      )}

      {/* Main trigger button */}
      <div
        role="combobox"
        aria-expanded={isOpen}
        tabIndex={disabled ? -1 : 0}
        onKeyDown={(e) => {
          if (disabled) return;
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
            e.preventDefault();
            setIsOpen(true);
          }
        }}
        onClick={() => {
          if (!disabled) setIsOpen(!isOpen);
        }}
        className={`w-full bg-[#0F1115] border rounded-xl ${
          compact ? 'px-2.5 py-2' : 'px-3 py-2.5'
        } text-xs flex items-center justify-between gap-2 transition cursor-pointer select-none ${
          disabled
            ? 'opacity-60 cursor-not-allowed border-slate-800 bg-slate-900/40 text-slate-500'
            : isOpen
            ? 'border-amber-500 ring-2 ring-amber-500/20 text-white'
            : isTriggerActive
            ? 'border-amber-500/50 hover:border-amber-400 text-white'
            : 'border-slate-700 hover:border-slate-600 text-slate-300'
        }`}
      >
        <div className="flex items-center gap-1.5 truncate flex-1">
          {icon && !label && <span className="shrink-0 text-amber-400">{icon}</span>}
          {multiple ? (
            <span
              className={`truncate font-medium ${
                selectedValues.length === 0 ? 'text-slate-300' : 'text-amber-300 font-bold'
              }`}
            >
              {multiDisplayLabel}
            </span>
          ) : selectedOption ? (
            <span className={`truncate font-medium ${value === clearValue ? 'text-slate-300' : 'text-slate-100'}`}>
              {selectedOption.label}
            </span>
          ) : (
            <span className="text-slate-500 truncate">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {hasClearableSelection && !disabled && (
            <button
              type="button"
              onClick={handleClear}
              className="p-0.5 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition cursor-pointer"
              title="Restablecer filtro / selección"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
              isOpen ? 'rotate-180 text-amber-400' : ''
            }`}
          />
        </div>
      </div>

      {/* Dropdown panel */}
      {isOpen && (
        <div
          className={`absolute z-50 left-0 right-0 min-w-[250px] mt-1.5 bg-[#16191F] border border-slate-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-80 ${dropdownClassName}`}
        >
          {/* Search box inside dropdown */}
          <div className="p-2 border-b border-slate-800 bg-[#12151B] sticky top-0 z-10 space-y-1.5">
            <div className="relative flex items-center">
              <Search className="w-3.5 h-3.5 text-amber-400 absolute left-2.5 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder={searchPlaceholder}
                className="w-full bg-[#0F1115] border border-slate-700 focus:border-amber-500 rounded-lg pl-8 pr-7 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500 font-sans"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 text-slate-400 hover:text-white p-0.5 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {multiple && onChangeMultiple && (
              <div className="flex items-center justify-between gap-1 text-[10px]">
                <button
                  type="button"
                  onClick={handleSelectAllFiltered}
                  className="px-2 py-1 rounded bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 font-bold cursor-pointer transition"
                >
                  + Marcar visibles ({filteredOptions.filter((o) => o.value !== clearValue).length})
                </button>
                <div className="flex items-center gap-1">
                  {selectedValues.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onChangeMultiple([])}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 font-semibold cursor-pointer transition"
                    >
                      Todos / Limpiar ({selectedValues.length})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="px-2 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 font-bold cursor-pointer transition"
                  >
                    Listo
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Options list */}
          <div className="overflow-y-auto flex-1 p-1 space-y-0.5 divide-y divide-slate-800/30">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-slate-500">
                {emptyMessage}
              </div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isClearOpt = opt.value === clearValue;
                const isSelected = multiple
                  ? isClearOpt
                    ? selectedValues.length === 0
                    : selectedSet.has(opt.value)
                  : opt.value === value;
                const isHighlighted = idx === highlightedIndex;
                return (
                  <button
                    key={`${opt.value}-${idx}`}
                    type="button"
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onClick={() => handleSelect(opt.value)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between gap-2 transition cursor-pointer ${
                      isSelected
                        ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30'
                        : isHighlighted
                        ? 'bg-slate-800/90 text-white'
                        : 'hover:bg-slate-800/80 text-slate-200 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate flex-1">
                      {multiple && !isClearOpt && (
                        isSelected ? (
                          <CheckSquare className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        ) : (
                          <Square className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        )
                      )}
                      <div className="truncate flex-1">
                        <div className="truncate font-medium">{opt.label}</div>
                        {opt.secondaryText && (
                          <div className="text-[11px] text-slate-400 truncate mt-0.5">
                            {opt.secondaryText}
                          </div>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="w-4 h-4 text-amber-400 shrink-0 stroke-[2.5]" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
