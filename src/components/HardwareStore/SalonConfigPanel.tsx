import React, { useState, useEffect } from 'react';
import {
  FolderTree,
  Ruler,
  MapPin,
  Tag,
  Percent,
  Plus,
  Trash2,
  Check,
  RefreshCw,
  Edit2,
  X,
  Star,
} from 'lucide-react';
import {
  SalonFamilia,
  SalonGrupo,
  SalonPriceList,
  SalonSector,
  SalonUnidadMedida,
  SalonVentasConfig,
} from '../../types';
import { getNextFamiliaCode, getNextGrupoCode, padCode } from '../../services/salonConfig';

type ConfigTab = 'familias' | 'unidades' | 'sectores' | 'marcas' | 'listas';

interface SalonConfigPanelProps {
  config: SalonVentasConfig;
  onUpdateConfig: (nextConfig: SalonVentasConfig, toastMsg?: string) => Promise<void>;
  onRecalculateCatalogPrices?: () => Promise<void>;
  catalogCount: number;
  initialTab?: ConfigTab;
}

export const SalonConfigPanel: React.FC<SalonConfigPanelProps> = ({
  config,
  onUpdateConfig,
  onRecalculateCatalogPrices,
  catalogCount,
  initialTab = 'familias',
}) => {
  const [activeTab, setActiveTab] = useState<ConfigTab>(initialTab);
  const [isSaving, setIsSaving] = useState(false);

  // --- Familias & Grupos state ---
  const [selectedFamiliaId, setSelectedFamiliaId] = useState<string>(config.familias[0]?.id || '');
  const [newFamCode, setNewFamCode] = useState(() => getNextFamiliaCode(config.familias));
  const [newFamName, setNewFamName] = useState('');
  const [editingFamId, setEditingFamId] = useState<string | null>(null);
  const [editFamCode, setEditFamCode] = useState('');
  const [editFamName, setEditFamName] = useState('');

  const selectedFamilia = config.familias.find(f => f.id === selectedFamiliaId) || config.familias[0] || null;

  const [newGrpCode, setNewGrpCode] = useState(() => getNextGrupoCode(selectedFamilia));
  const [newGrpName, setNewGrpName] = useState('');
  const [editingGrpId, setEditingGrpId] = useState<string | null>(null);
  const [editGrpCode, setEditGrpCode] = useState('');
  const [editGrpName, setEditGrpName] = useState('');

  useEffect(() => {
    setNewFamCode(getNextFamiliaCode(config.familias));
  }, [config.familias]);

  useEffect(() => {
    if (!selectedFamilia && config.familias.length > 0) {
      setSelectedFamiliaId(config.familias[0].id);
    }
    setNewGrpCode(getNextGrupoCode(selectedFamilia));
  }, [selectedFamilia, config.familias]);

  // --- Unidades de Medida state ---
  const [selectedUnidadId, setSelectedUnidadId] = useState<string>(config.unidadesMedida[0]?.id || '');
  const [newUnidadName, setNewUnidadName] = useState('');
  const [newUnidadAbbr, setNewUnidadAbbr] = useState('');
  const [newValoresInput, setNewValoresInput] = useState('');

  const selectedUnidad =
    config.unidadesMedida.find(u => u.id === selectedUnidadId) || config.unidadesMedida[0] || null;

  useEffect(() => {
    if (!selectedUnidad && config.unidadesMedida.length > 0) {
      setSelectedUnidadId(config.unidadesMedida[0].id);
    }
  }, [selectedUnidad, config.unidadesMedida]);

  // --- Sectores & Subsectores state ---
  const [selectedSectorId, setSelectedSectorId] = useState<string>(config.sectores[0]?.id || '');
  const [newSectorName, setNewSectorName] = useState('');
  const [newSubsectorName, setNewSubsectorName] = useState('');

  const selectedSector = config.sectores.find(s => s.id === selectedSectorId) || config.sectores[0] || null;

  useEffect(() => {
    if (!selectedSector && config.sectores.length > 0) {
      setSelectedSectorId(config.sectores[0].id);
    }
  }, [selectedSector, config.sectores]);

  // --- Marcas state ---
  const [newMarcaName, setNewMarcaName] = useState('');
  const [marcaFilter, setMarcaFilter] = useState('');

  // --- Listas de Precios state ---
  const [newListaNombre, setNewListaNombre] = useState('');
  const [newListaMargen, setNewListaMargen] = useState<number>(35);

  const commitConfig = async (next: SalonVentasConfig, msg?: string) => {
    setIsSaving(true);
    try {
      await onUpdateConfig(next, msg);
    } finally {
      setIsSaving(false);
    }
  };

  // ==================== HANDLERS: FAMILIAS & GRUPOS ====================
  const handleAddFamilia = async (e: React.FormEvent) => {
    e.preventDefault();
    const nombre = newFamName.trim();
    if (!nombre) return;
    const codigo = padCode(newFamCode || getNextFamiliaCode(config.familias), 3);
    if (config.familias.some(f => f.codigo === codigo)) {
      return;
    }
    const nueva: SalonFamilia = {
      id: `fam-${Date.now()}`,
      codigo,
      nombre,
      grupos: [{ id: `grp-${Date.now()}-1`, codigo: '001', nombre: 'General' }],
    };
    const nextFamilias = [...config.familias, nueva].sort((a, b) => a.codigo.localeCompare(b.codigo));
    await commitConfig({ ...config, familias: nextFamilias }, `Familia ${codigo} - ${nombre} guardada.`);
    setSelectedFamiliaId(nueva.id);
    setNewFamName('');
  };

  const handleSaveEditFamilia = async (famId: string) => {
    const nombre = editFamName.trim();
    if (!nombre) return;
    const codigo = padCode(editFamCode, 3);
    const nextFamilias = config.familias
      .map(f => (f.id === famId ? { ...f, codigo, nombre } : f))
      .sort((a, b) => a.codigo.localeCompare(b.codigo));
    await commitConfig({ ...config, familias: nextFamilias }, 'Familia actualizada.');
    setEditingFamId(null);
  };

  const handleDeleteFamilia = async (famId: string) => {
    if (config.familias.length <= 1) return;
    const nextFamilias = config.familias.filter(f => f.id !== famId);
    await commitConfig({ ...config, familias: nextFamilias }, 'Familia eliminada.');
    if (selectedFamiliaId === famId && nextFamilias[0]) {
      setSelectedFamiliaId(nextFamilias[0].id);
    }
  };

  const handleAddGrupo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFamilia) return;
    const nombre = newGrpName.trim();
    if (!nombre) return;
    const codigo = padCode(newGrpCode || getNextGrupoCode(selectedFamilia), 3);
    if (selectedFamilia.grupos.some(g => g.codigo === codigo)) return;

    const nuevo: SalonGrupo = {
      id: `grp-${Date.now()}`,
      codigo,
      nombre,
    };
    const nextFamilias = config.familias.map(f =>
      f.id === selectedFamilia.id
        ? { ...f, grupos: [...f.grupos, nuevo].sort((a, b) => a.codigo.localeCompare(b.codigo)) }
        : f
    );
    await commitConfig({ ...config, familias: nextFamilias }, `Grupo ${codigo} - ${nombre} agregado.`);
    setNewGrpName('');
  };

  const handleSaveEditGrupo = async (grpId: string) => {
    if (!selectedFamilia) return;
    const nombre = editGrpName.trim();
    if (!nombre) return;
    const codigo = padCode(editGrpCode, 3);
    const nextFamilias = config.familias.map(f =>
      f.id === selectedFamilia.id
        ? {
            ...f,
            grupos: f.grupos
              .map(g => (g.id === grpId ? { ...g, codigo, nombre } : g))
              .sort((a, b) => a.codigo.localeCompare(b.codigo)),
          }
        : f
    );
    await commitConfig({ ...config, familias: nextFamilias }, 'Grupo actualizado.');
    setEditingGrpId(null);
  };

  const handleDeleteGrupo = async (grpId: string) => {
    if (!selectedFamilia) return;
    const nextFamilias = config.familias.map(f =>
      f.id === selectedFamilia.id ? { ...f, grupos: f.grupos.filter(g => g.id !== grpId) } : f
    );
    await commitConfig({ ...config, familias: nextFamilias }, 'Grupo eliminado.');
  };

  // ==================== HANDLERS: UNIDADES DE MEDIDA ====================
  const handleAddUnidad = async (e: React.FormEvent) => {
    e.preventDefault();
    const nombre = newUnidadName.trim();
    if (!nombre) return;
    const nueva: SalonUnidadMedida = {
      id: `um-${Date.now()}`,
      nombre,
      abreviatura: newUnidadAbbr.trim().toUpperCase() || nombre.slice(0, 4).toUpperCase(),
      valores: [],
    };
    await commitConfig(
      { ...config, unidadesMedida: [...config.unidadesMedida, nueva] },
      `Unidad de medida "${nombre}" creada.`
    );
    setSelectedUnidadId(nueva.id);
    setNewUnidadName('');
    setNewUnidadAbbr('');
  };

  const handleDeleteUnidad = async (unidadId: string) => {
    const next = config.unidadesMedida.filter(u => u.id !== unidadId);
    await commitConfig({ ...config, unidadesMedida: next }, 'Unidad de medida eliminada.');
    if (selectedUnidadId === unidadId && next[0]) setSelectedUnidadId(next[0].id);
  };

  const handleAddValoresToUnidad = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUnidad) return;
    const parts = newValoresInput
      .split(/[,;\n]+/)
      .map(s => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;

    const existingNames = new Set(selectedUnidad.valores.map(v => v.nombre.toLowerCase()));
    const toAdd = parts
      .filter(p => !existingNames.has(p.toLowerCase()))
      .map((nombre, idx) => ({ id: `val-${Date.now()}-${idx}`, nombre }));

    if (toAdd.length === 0) {
      setNewValoresInput('');
      return;
    }

    const nextUnidades = config.unidadesMedida.map(u =>
      u.id === selectedUnidad.id ? { ...u, valores: [...u.valores, ...toAdd] } : u
    );
    await commitConfig(
      { ...config, unidadesMedida: nextUnidades },
      `${toAdd.length} valor${toAdd.length > 1 ? 'es' : ''} agregado${toAdd.length > 1 ? 's' : ''} a "${selectedUnidad.nombre}".`
    );
    setNewValoresInput('');
  };

  const handleDeleteValorFromUnidad = async (valorId: string) => {
    if (!selectedUnidad) return;
    const nextUnidades = config.unidadesMedida.map(u =>
      u.id === selectedUnidad.id ? { ...u, valores: u.valores.filter(v => v.id !== valorId) } : u
    );
    await commitConfig({ ...config, unidadesMedida: nextUnidades }, 'Valor eliminado.');
  };

  // ==================== HANDLERS: SECTORES & SUBSECTORES ====================
  const handleAddSector = async (e: React.FormEvent) => {
    e.preventDefault();
    const nombre = newSectorName.trim();
    if (!nombre) return;
    const nuevo: SalonSector = {
      id: `sec-${Date.now()}`,
      nombre,
      subsectores: [],
    };
    await commitConfig(
      { ...config, sectores: [...config.sectores, nuevo] },
      `Sector "${nombre}" agregado.`
    );
    setSelectedSectorId(nuevo.id);
    setNewSectorName('');
  };

  const handleDeleteSector = async (sectorId: string) => {
    const next = config.sectores.filter(s => s.id !== sectorId);
    await commitConfig({ ...config, sectores: next }, 'Sector eliminado.');
    if (selectedSectorId === sectorId && next[0]) setSelectedSectorId(next[0].id);
  };

  const handleAddSubsector = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSector) return;
    const parts = newSubsectorName
      .split(/[,;\n]+/)
      .map(s => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;

    const existing = new Set(selectedSector.subsectores.map(s => s.nombre.toLowerCase()));
    const toAdd = parts
      .filter(p => !existing.has(p.toLowerCase()))
      .map((nombre, idx) => ({ id: `sub-${Date.now()}-${idx}`, nombre }));

    if (toAdd.length === 0) {
      setNewSubsectorName('');
      return;
    }

    const nextSectores = config.sectores.map(s =>
      s.id === selectedSector.id ? { ...s, subsectores: [...s.subsectores, ...toAdd] } : s
    );
    await commitConfig(
      { ...config, sectores: nextSectores },
      `Subsector agregado a "${selectedSector.nombre}".`
    );
    setNewSubsectorName('');
  };

  const handleDeleteSubsector = async (subId: string) => {
    if (!selectedSector) return;
    const nextSectores = config.sectores.map(s =>
      s.id === selectedSector.id
        ? { ...s, subsectores: s.subsectores.filter(sub => sub.id !== subId) }
        : s
    );
    await commitConfig({ ...config, sectores: nextSectores }, 'Subsector eliminado.');
  };

  // ==================== HANDLERS: MARCAS ====================
  const handleAddMarca = async (e: React.FormEvent) => {
    e.preventDefault();
    const parts = newMarcaName
      .split(/[,;\n]+/)
      .map(s => s.trim())
      .filter(Boolean);
    if (parts.length === 0) return;

    const existingLower = new Set(config.marcas.map(m => m.toLowerCase()));
    const nuevos = parts.filter(m => !existingLower.has(m.toLowerCase()));
    if (nuevos.length === 0) {
      setNewMarcaName('');
      return;
    }
    const nextMarcas = [...config.marcas, ...nuevos].sort((a, b) => a.localeCompare(b));
    await commitConfig({ ...config, marcas: nextMarcas }, `Marca agregada.`);
    setNewMarcaName('');
  };

  const handleDeleteMarca = async (marca: string) => {
    const nextMarcas = config.marcas.filter(m => m !== marca);
    await commitConfig({ ...config, marcas: nextMarcas }, `Marca "${marca}" eliminada.`);
  };

  // ==================== HANDLERS: LISTAS DE PRECIOS ====================
  const handleAddLista = async (e: React.FormEvent) => {
    e.preventDefault();
    const nombre = newListaNombre.trim();
    if (!nombre) return;
    const nueva: SalonPriceList = {
      id: `lista-${Date.now()}`,
      nombre,
      margenPorcentaje: Number(newListaMargen) || 0,
      activa: true,
      esPredeterminada: config.listasPrecios.length === 0,
    };
    await commitConfig(
      { ...config, listasPrecios: [...config.listasPrecios, nueva] },
      `Lista "${nombre}" creada.`
    );
    setNewListaNombre('');
    setNewListaMargen(35);
  };

  const handleUpdateListaMargen = async (listaId: string, margenPorcentaje: number) => {
    const next = config.listasPrecios.map(l =>
      l.id === listaId ? { ...l, margenPorcentaje } : l
    );
    await commitConfig({ ...config, listasPrecios: next });
  };

  const handleSetDefaultLista = async (listaId: string) => {
    const next = config.listasPrecios.map(l => ({
      ...l,
      esPredeterminada: l.id === listaId,
    }));
    await commitConfig({ ...config, listasPrecios: next }, 'Lista predeterminada actualizada.');
  };

  const handleDeleteLista = async (listaId: string) => {
    if (config.listasPrecios.length <= 1) return;
    const filtered = config.listasPrecios.filter(l => l.id !== listaId);
    if (!filtered.some(l => l.esPredeterminada) && filtered[0]) {
      filtered[0] = { ...filtered[0], esPredeterminada: true };
    }
    await commitConfig({ ...config, listasPrecios: filtered }, 'Lista de precios eliminada.');
  };

  const filteredMarcas = config.marcas.filter(
    m => !marcaFilter || m.toLowerCase().includes(marcaFilter.toLowerCase())
  );

  const tabs: Array<{ id: ConfigTab; label: string; icon: React.ComponentType<{ className?: string }>; count: number }> = [
    { id: 'familias', label: 'Familias y Grupos', icon: FolderTree, count: config.familias.length },
    { id: 'unidades', label: 'Unidades de Medida', icon: Ruler, count: config.unidadesMedida.length },
    { id: 'sectores', label: 'Sectores y Subsectores', icon: MapPin, count: config.sectores.length },
    { id: 'marcas', label: 'Marcas', icon: Tag, count: config.marcas.length },
    { id: 'listas', label: 'Listas de Precios', icon: Percent, count: config.listasPrecios.length },
  ];

  return (
    <div className="space-y-5">
      {/* Sub-navigation segmented bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-[#16191F] p-3 rounded-xl border border-[#2D2D2D]">
        <div className="flex flex-wrap items-center gap-1.5">
          {tabs.map(t => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-[#F0C800] text-[#16191F]'
                    : 'bg-[#1F2228] text-slate-300 hover:text-white hover:bg-[#282C34]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
                <span className={`font-mono tabular-nums text-[11px] ${active ? 'text-[#16191F]/80' : 'text-slate-500'}`}>
                  {t.count}
                </span>
              </button>
            );
          })}
        </div>
        {isSaving && (
          <span className="text-xs text-slate-400 font-medium px-2">Guardando cambios...</span>
        )}
      </div>

      {/* TAB 1: FAMILIAS Y GRUPOS */}
      {activeTab === 'familias' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Familias */}
          <div className="lg:col-span-5 bg-[#16191F] rounded-xl border border-[#2D2D2D] p-5 space-y-4">
            <div>
              <h2 className="text-sm font-bold text-white">Familias (3 dígitos)</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                La Familia y el Grupo reemplazan la categoría y forman los primeros 6 dígitos del código del producto.
              </p>
            </div>

            <form onSubmit={handleAddFamilia} className="flex items-center gap-2">
              <input
                type="text"
                maxLength={3}
                value={newFamCode}
                onChange={e => setNewFamCode(e.target.value.replace(/\D/g, ''))}
                placeholder="001"
                className="w-16 px-2.5 py-2 text-xs font-mono font-bold text-center bg-[#1F2228] border border-slate-700 rounded-lg text-[#F0C800] focus:outline-none focus:border-[#F0C800]"
                title="Código de 3 dígitos"
              />
              <input
                type="text"
                value={newFamName}
                onChange={e => setNewFamName(e.target.value)}
                placeholder="Nombre de la familia (ej: Herramientas Manuales)"
                className="flex-1 px-3 py-2 text-xs bg-[#1F2228] border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-[#F0C800]"
              />
              <button
                type="submit"
                className="px-3.5 py-2 bg-[#F0C800] hover:bg-[#F6D84C] text-[#16191F] font-bold text-xs rounded-lg flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar</span>
              </button>
            </form>

            <div className="divide-y divide-[#2D2D2D] border-t border-[#2D2D2D] max-h-[460px] overflow-y-auto">
              {config.familias.map(fam => {
                const isSelected = selectedFamilia?.id === fam.id;
                const isEditing = editingFamId === fam.id;
                return (
                  <div
                    key={fam.id}
                    onClick={() => !isEditing && setSelectedFamiliaId(fam.id)}
                    className={`py-2.5 px-3 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                      isSelected ? 'bg-[#1F2228] text-white' : 'hover:bg-[#1F2228]/50 text-slate-300'
                    }`}
                  >
                    {isEditing ? (
                      <div className="flex items-center gap-2 flex-1" onClick={e => e.stopPropagation()}>
                        <input
                          type="text"
                          maxLength={3}
                          value={editFamCode}
                          onChange={e => setEditFamCode(e.target.value.replace(/\D/g, ''))}
                          className="w-14 px-2 py-1 text-xs font-mono bg-[#16191F] border border-slate-600 rounded text-[#F0C800]"
                        />
                        <input
                          type="text"
                          value={editFamName}
                          onChange={e => setEditFamName(e.target.value)}
                          className="flex-1 px-2 py-1 text-xs bg-[#16191F] border border-slate-600 rounded text-white"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEditFamilia(fam.id)}
                          className="p-1.5 text-emerald-400 hover:bg-emerald-500/15 rounded cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingFamId(null)}
                          className="p-1.5 text-slate-400 hover:text-white rounded cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="min-w-0 flex items-center gap-2.5">
                          <span className={`font-mono text-xs font-bold tabular-nums ${isSelected ? 'text-[#F0C800]' : 'text-slate-400'}`}>
                            {fam.codigo}
                          </span>
                          <div className="truncate">
                            <div className="text-xs font-semibold truncate">{fam.nombre}</div>
                            <div className="text-[11px] text-slate-500">
                              {fam.grupos.length} grupo{fam.grupos.length === 1 ? '' : 's'}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingFamId(fam.id);
                              setEditFamCode(fam.codigo);
                              setEditFamName(fam.nombre);
                            }}
                            className="p-1.5 text-slate-400 hover:text-white rounded cursor-pointer"
                            title="Editar familia"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteFamilia(fam.id)}
                            disabled={config.familias.length <= 1}
                            className="p-1.5 text-slate-500 hover:text-rose-400 disabled:opacity-30 rounded cursor-pointer"
                            title="Eliminar familia"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Grupos de la Familia seleccionada */}
          <div className="lg:col-span-7 bg-[#16191F] rounded-xl border border-[#2D2D2D] p-5 space-y-4">
            {selectedFamilia ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-bold text-white">
                      Grupos de {selectedFamilia.codigo} · {selectedFamilia.nombre}
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Una familia puede tener todos los grupos que necesites. Código resultante:{' '}
                      <span className="font-mono text-[#F0C800]">
                        {selectedFamilia.codigo}
                        {padCode(newGrpCode || '001', 3)}00001
                      </span>
                    </p>
                  </div>
                </div>

                <form onSubmit={handleAddGrupo} className="flex items-center gap-2">
                  <input
                    type="text"
                    maxLength={3}
                    value={newGrpCode}
                    onChange={e => setNewGrpCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="001"
                    className="w-16 px-2.5 py-2 text-xs font-mono font-bold text-center bg-[#1F2228] border border-slate-700 rounded-lg text-[#F0C800] focus:outline-none focus:border-[#F0C800]"
                    title="Código de grupo (3 dígitos)"
                  />
                  <input
                    type="text"
                    value={newGrpName}
                    onChange={e => setNewGrpName(e.target.value)}
                    placeholder={`Nuevo grupo dentro de ${selectedFamilia.nombre}...`}
                    className="flex-1 px-3 py-2 text-xs bg-[#1F2228] border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-[#F0C800]"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-2 bg-[#F0C800] hover:bg-[#F6D84C] text-[#16191F] font-bold text-xs rounded-lg flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Agregar Grupo</span>
                  </button>
                </form>

                {selectedFamilia.grupos.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-500 border-t border-[#2D2D2D]">
                    Esta familia aún no tiene grupos. Agregá el primero arriba.
                  </div>
                ) : (
                  <div className="divide-y divide-[#2D2D2D] border-t border-[#2D2D2D] max-h-[460px] overflow-y-auto">
                    {selectedFamilia.grupos.map(grp => {
                      const isEditing = editingGrpId === grp.id;
                      return (
                        <div key={grp.id} className="py-2.5 px-3 flex items-center justify-between gap-2 hover:bg-[#1F2228]/50">
                          {isEditing ? (
                            <div className="flex items-center gap-2 flex-1">
                              <input
                                type="text"
                                maxLength={3}
                                value={editGrpCode}
                                onChange={e => setEditGrpCode(e.target.value.replace(/\D/g, ''))}
                                className="w-14 px-2 py-1 text-xs font-mono bg-[#16191F] border border-slate-600 rounded text-[#F0C800]"
                              />
                              <input
                                type="text"
                                value={editGrpName}
                                onChange={e => setEditGrpName(e.target.value)}
                                className="flex-1 px-2 py-1 text-xs bg-[#16191F] border border-slate-600 rounded text-white"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveEditGrupo(grp.id)}
                                className="p-1.5 text-emerald-400 hover:bg-emerald-500/15 rounded cursor-pointer"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingGrpId(null)}
                                className="p-1.5 text-slate-400 hover:text-white rounded cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="font-mono text-xs font-bold text-slate-400 tabular-nums">
                                  {selectedFamilia.codigo}-{grp.codigo}
                                </span>
                                <span className="text-xs font-semibold text-white truncate">{grp.nombre}</span>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingGrpId(grp.id);
                                    setEditGrpCode(grp.codigo);
                                    setEditGrpName(grp.nombre);
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-white rounded cursor-pointer"
                                  title="Editar grupo"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteGrupo(grp.id)}
                                  className="p-1.5 text-slate-500 hover:text-rose-400 rounded cursor-pointer"
                                  title="Eliminar grupo"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs text-slate-400">Seleccioná una familia para administrar sus grupos.</div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: UNIDADES DE MEDIDA Y SUS VALORES INTERNOS */}
      {activeTab === 'unidades' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Lista de Unidades de Medida */}
          <div className="lg:col-span-5 bg-[#16191F] rounded-xl border border-[#2D2D2D] p-5 space-y-4">
            <div>
              <h2 className="text-sm font-bold text-white">Unidades de Medida</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Definí cada unidad o atributo (ej: Pulgadas, Diámetro, Presentación, Peso) y qué medidas/opciones contiene adentro.
              </p>
            </div>

            <form onSubmit={handleAddUnidad} className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newUnidadName}
                  onChange={e => setNewUnidadName(e.target.value)}
                  placeholder="Nombre (ej: Medida / Pulgadas, Largo, Rosca)"
                  className="flex-1 px-3 py-2 text-xs bg-[#1F2228] border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-[#F0C800]"
                />
                <input
                  type="text"
                  maxLength={6}
                  value={newUnidadAbbr}
                  onChange={e => setNewUnidadAbbr(e.target.value)}
                  placeholder="Abrev"
                  className="w-20 px-2.5 py-2 text-xs font-mono bg-[#1F2228] border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-[#F0C800]"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2 bg-[#F0C800] hover:bg-[#F6D84C] text-[#16191F] font-bold text-xs rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Crear Unidad de Medida</span>
              </button>
            </form>

            <div className="divide-y divide-[#2D2D2D] border-t border-[#2D2D2D] max-h-[420px] overflow-y-auto">
              {config.unidadesMedida.map(um => {
                const isSelected = selectedUnidad?.id === um.id;
                return (
                  <div
                    key={um.id}
                    onClick={() => setSelectedUnidadId(um.id)}
                    className={`py-2.5 px-3 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                      isSelected ? 'bg-[#1F2228] text-white' : 'hover:bg-[#1F2228]/50 text-slate-300'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">{um.nombre}</div>
                      <div className="text-[11px] text-slate-500">
                        {um.abreviatura ? `${um.abreviatura} · ` : ''}
                        {um.valores.length} valor{um.valores.length === 1 ? '' : 'es'} adentro
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        handleDeleteUnidad(um.id);
                      }}
                      className="p-1.5 text-slate-500 hover:text-rose-400 rounded cursor-pointer"
                      title="Eliminar unidad de medida"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Valores dentro de la Unidad de Medida seleccionada */}
          <div className="lg:col-span-7 bg-[#16191F] rounded-xl border border-[#2D2D2D] p-5 space-y-4">
            {selectedUnidad ? (
              <>
                <div>
                  <h2 className="text-sm font-bold text-white">
                    Contenido de "{selectedUnidad.nombre}"
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Cargá todas las medidas o presentaciones dentro de esta unidad. Podés cargar varias separadas por coma (ej: <span className="text-slate-300 font-mono">1/2&quot;, 3/4&quot;, 1&quot;, 2&quot;</span>).
                  </p>
                </div>

                <form onSubmit={handleAddValoresToUnidad} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newValoresInput}
                    onChange={e => setNewValoresInput(e.target.value)}
                    placeholder={`Agregar valores a ${selectedUnidad.nombre} (separados por coma)...`}
                    className="flex-1 px-3 py-2 text-xs bg-[#1F2228] border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-[#F0C800]"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#F0C800] hover:bg-[#F6D84C] text-[#16191F] font-bold text-xs rounded-lg flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Agregar</span>
                  </button>
                </form>

                {selectedUnidad.valores.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-500 border-t border-[#2D2D2D]">
                    Todavía no cargaste valores adentro de esta unidad de medida.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-[#2D2D2D] max-h-[420px] overflow-y-auto">
                    {selectedUnidad.valores.map((val, idx) => (
                      <div
                        key={val.id}
                        className="flex items-center justify-between px-3 py-2 bg-[#1F2228] border border-[#2D2D2D] rounded-lg"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="text-[11px] font-mono text-slate-500 tabular-nums">
                            {String(idx + 1).padStart(2, '0')}
                          </span>
                          <span className="text-xs font-semibold text-white truncate">{val.nombre}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteValorFromUnidad(val.id)}
                          className="p-1 text-slate-500 hover:text-rose-400 rounded cursor-pointer"
                          title="Quitar valor"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs text-slate-400">Seleccioná o creá una unidad de medida.</div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: SECTORES Y SUBSECTORES */}
      {activeTab === 'sectores' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-5 bg-[#16191F] rounded-xl border border-[#2D2D2D] p-5 space-y-4">
            <div>
              <h2 className="text-sm font-bold text-white">Sectores del Salón</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Ubicaciones principales del salón de ventas o depósito de ferretería.
              </p>
            </div>

            <form onSubmit={handleAddSector} className="flex items-center gap-2">
              <input
                type="text"
                value={newSectorName}
                onChange={e => setNewSectorName(e.target.value)}
                placeholder="Nuevo sector (ej: Salón Principal, Bulonería)"
                className="flex-1 px-3 py-2 text-xs bg-[#1F2228] border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-[#F0C800]"
              />
              <button
                type="submit"
                className="px-3.5 py-2 bg-[#F0C800] hover:bg-[#F6D84C] text-[#16191F] font-bold text-xs rounded-lg flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar</span>
              </button>
            </form>

            <div className="divide-y divide-[#2D2D2D] border-t border-[#2D2D2D]">
              {config.sectores.map(sec => {
                const isSelected = selectedSector?.id === sec.id;
                return (
                  <div
                    key={sec.id}
                    onClick={() => setSelectedSectorId(sec.id)}
                    className={`py-2.5 px-3 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                      isSelected ? 'bg-[#1F2228] text-white' : 'hover:bg-[#1F2228]/50 text-slate-300'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold truncate">{sec.nombre}</div>
                      <div className="text-[11px] text-slate-500">
                        {sec.subsectores.length} subsector{sec.subsectores.length === 1 ? '' : 'es'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        handleDeleteSector(sec.id);
                      }}
                      className="p-1.5 text-slate-500 hover:text-rose-400 rounded cursor-pointer"
                      title="Eliminar sector"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="lg:col-span-7 bg-[#16191F] rounded-xl border border-[#2D2D2D] p-5 space-y-4">
            {selectedSector ? (
              <>
                <div>
                  <h2 className="text-sm font-bold text-white">
                    Subsectores de "{selectedSector.nombre}"
                  </h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Góndolas, estanterías, cajoneras o tableros dentro de este sector. Podés ingresar varios separados por coma.
                  </p>
                </div>

                <form onSubmit={handleAddSubsector} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newSubsectorName}
                    onChange={e => setNewSubsectorName(e.target.value)}
                    placeholder="ej: Góndola 1, Estantería A, Tablero Llaves"
                    className="flex-1 px-3 py-2 text-xs bg-[#1F2228] border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-[#F0C800]"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-2 bg-[#F0C800] hover:bg-[#F6D84C] text-[#16191F] font-bold text-xs rounded-lg flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Agregar</span>
                  </button>
                </form>

                {selectedSector.subsectores.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-500 border-t border-[#2D2D2D]">
                    Sin subsectores cargados aún para este sector.
                  </div>
                ) : (
                  <div className="divide-y divide-[#2D2D2D] border-t border-[#2D2D2D]">
                    {selectedSector.subsectores.map(sub => (
                      <div key={sub.id} className="py-2.5 px-3 flex items-center justify-between hover:bg-[#1F2228]/50">
                        <span className="text-xs font-semibold text-white">{sub.nombre}</span>
                        <button
                          type="button"
                          onClick={() => handleDeleteSubsector(sub.id)}
                          className="p-1.5 text-slate-500 hover:text-rose-400 rounded cursor-pointer"
                          title="Eliminar subsector"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="text-xs text-slate-400">Seleccioná un sector para gestionar sus subsectores.</div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: MARCAS */}
      {activeTab === 'marcas' && (
        <div className="bg-[#16191F] rounded-xl border border-[#2D2D2D] p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-white">Marcas de Ferretería y Herramientas</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                También podés crear nuevas marcas al instante desde el botón + al cargar un artículo.
              </p>
            </div>
            <input
              type="text"
              value={marcaFilter}
              onChange={e => setMarcaFilter(e.target.value)}
              placeholder="Filtrar marcas..."
              className="w-full sm:w-56 px-3 py-2 text-xs bg-[#1F2228] border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-[#F0C800]"
            />
          </div>

          <form onSubmit={handleAddMarca} className="flex items-center gap-2 max-w-xl">
            <input
              type="text"
              value={newMarcaName}
              onChange={e => setNewMarcaName(e.target.value)}
              placeholder="Nueva marca o varias separadas por coma (ej: Bahco, Stanley, DeWalt)"
              className="flex-1 px-3 py-2 text-xs bg-[#1F2228] border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-[#F0C800]"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-[#F0C800] hover:bg-[#F6D84C] text-[#16191F] font-bold text-xs rounded-lg flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Agregar Marca</span>
            </button>
          </form>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 pt-2 border-t border-[#2D2D2D]">
            {filteredMarcas.map(m => (
              <div
                key={m}
                className="flex items-center justify-between px-3 py-2 bg-[#1F2228] border border-[#2D2D2D] rounded-lg"
              >
                <span className="text-xs font-semibold text-white truncate">{m}</span>
                <button
                  type="button"
                  onClick={() => handleDeleteMarca(m)}
                  className="p-1 text-slate-500 hover:text-rose-400 rounded cursor-pointer"
                  title="Eliminar marca"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 5: LISTAS DE PRECIOS / COMPOSICIÓN */}
      {activeTab === 'listas' && (
        <div className="bg-[#16191F] rounded-xl border border-[#2D2D2D] p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-white">Listas de Precios y Composición Automática</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Al cargar un artículo o ingresar una Factura de Compra solo se carga el Costo Unitario. Estas listas calculan los precios de venta automáticamente.
              </p>
            </div>
            {onRecalculateCatalogPrices && catalogCount > 0 && (
              <button
                type="button"
                onClick={onRecalculateCatalogPrices}
                className="px-3.5 py-2 bg-[#1F2228] hover:bg-[#2A2E37] text-[#F0C800] border border-[#F0C800]/30 font-bold text-xs rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Recalcular {catalogCount} artículos</span>
              </button>
            )}
          </div>

          <form onSubmit={handleAddLista} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 max-w-2xl">
            <input
              type="text"
              value={newListaNombre}
              onChange={e => setNewListaNombre(e.target.value)}
              placeholder="Nombre de nueva lista (ej: Lista Gremio, Lista MercadoLibre)"
              className="sm:col-span-7 px-3 py-2 text-xs bg-[#1F2228] border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-[#F0C800]"
            />
            <div className="sm:col-span-3 relative">
              <input
                type="number"
                step="0.5"
                value={newListaMargen}
                onChange={e => setNewListaMargen(Number(e.target.value))}
                className="w-full px-3 py-2 pr-8 text-xs font-mono bg-[#1F2228] border border-slate-700 rounded-lg text-white focus:outline-none focus:border-[#F0C800]"
                placeholder="Margen %"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-mono">%</span>
            </div>
            <button
              type="submit"
              className="sm:col-span-2 px-3 py-2 bg-[#F0C800] hover:bg-[#F6D84C] text-[#16191F] font-bold text-xs rounded-lg flex items-center justify-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Crear</span>
            </button>
          </form>

          <div className="overflow-x-auto border-t border-[#2D2D2D] pt-3">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="text-slate-400 border-b border-[#2D2D2D]">
                  <th className="py-2.5 px-3 font-semibold">Lista de Precios</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Margen sobre Costo</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Ejemplo ($10.000 costo)</th>
                  <th className="py-2.5 px-3 font-semibold text-center">Predeterminada (PVP)</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2D2D2D]">
                {config.listasPrecios.map(lista => {
                  const example = Math.round(10000 * (1 + (Number(lista.margenPorcentaje) || 0) / 100));
                  return (
                    <tr key={lista.id} className="hover:bg-[#1F2228]/40">
                      <td className="py-3 px-3 font-semibold text-white">{lista.nombre}</td>
                      <td className="py-3 px-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <span className="text-slate-500">+</span>
                          <input
                            type="number"
                            step="0.5"
                            value={lista.margenPorcentaje}
                            onChange={e => handleUpdateListaMargen(lista.id, Number(e.target.value))}
                            className="w-20 px-2 py-1 text-right font-mono tabular-nums bg-[#1F2228] border border-slate-700 rounded text-white focus:outline-none focus:border-[#F0C800]"
                          />
                          <span className="text-slate-400 font-mono">%</span>
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-[#F0C800] font-bold">
                        ${example.toLocaleString('es-AR')}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => handleSetDefaultLista(lista.id)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                            lista.esPredeterminada
                              ? 'bg-[#F0C800]/15 text-[#F0C800]'
                              : 'text-slate-400 hover:text-white'
                          }`}
                        >
                          <Star className={`w-3.5 h-3.5 ${lista.esPredeterminada ? 'fill-[#F0C800]' : ''}`} />
                          <span>{lista.esPredeterminada ? 'Principal' : 'Usar'}</span>
                        </button>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeleteLista(lista.id)}
                          disabled={config.listasPrecios.length <= 1}
                          className="p-1.5 text-slate-500 hover:text-rose-400 disabled:opacity-30 rounded cursor-pointer"
                          title="Eliminar lista"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
