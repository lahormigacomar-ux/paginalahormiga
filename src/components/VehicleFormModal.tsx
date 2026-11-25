import React, { useState, useEffect } from 'react';
import { Vehicle, VehicleClassification, VehicleStatus, RentalModality, EquipmentCategory } from '../types';
import { PRESET_MACHINERY_IMAGES } from '../data/initialFleet';
import { uploadImageToCloudflareR2 } from '../services/api';
import { ImageClipboardDropzone } from './common/ImageClipboardDropzone';
import { useClipboardImagePaste } from '../hooks/useClipboardImagePaste';
import { 
  PlusCircle, 
  Edit3, 
  X, 
  Upload, 
  Image as ImageIcon, 
  Calculator, 
  Check, 
  AlertCircle,
  Truck,
  Hash,
  FileText,
  DollarSign,
  Tag,
  Clock,
  MapPin,
  Sparkles,
  Globe,
  UserCheck,
  Clipboard
} from 'lucide-react';

import { 
  SIMPLIFIED_CLASSIFICATIONS, 
  normalizeEquipmentClassification, 
  getCategoryFromClassification 
} from '../utils/equipmentClassification';

interface VehicleFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (vehicle: Vehicle) => void;
  vehicleToEdit?: Vehicle | null;
  existingCount: number;
}

const CATEGORIES: { value: EquipmentCategory; label: string; desc: string }[] = [
  { value: 'VIAL_PESADA', label: 'Vial Pesada & Movimientos', desc: 'Máquinas viales, excavadoras, palas, rodillos' },
  { value: 'HERRAMIENTA_MENOR', label: 'Herramientas Eléctricas & Menores', desc: 'Rotomartillos, hormigoneras, chanchas, generadores' },
  { value: 'EVENTOS_GASTRONOMIA', label: 'Equipos & Gastronomía', desc: 'Freezers, heladeras, pancheras, hornos' },
  { value: 'TRANSPORTE', label: 'Transporte & Carga', desc: 'Camiones volcadores, chasis, camionetas, acoplados' },
  { value: 'VEHICULOS_TERCEROS', label: 'Vehículos de Terceros', desc: 'Camiones, maquinarias o utilitarios tercerizados / fleteros' },
];

const CLASSIFICATIONS = SIMPLIFIED_CLASSIFICATIONS;

const STATUSES: { value: VehicleStatus; label: string }[] = [
  { value: 'DISPONIBLE', label: 'Disponible (Listo para Alquiler)' },
  { value: 'ALQUILADO', label: 'Alquilado / En Obra' },
  { value: 'EN_MANTENIMIENTO', label: 'En Mantenimiento Preventivo' },
  { value: 'TALLER', label: 'En Taller / Reparación' },
  { value: 'RESERVADO', label: 'Reservado' },
  { value: 'FUERA_DE_SERVICIO', label: 'Fuera de Servicio' },
];

export const VehicleFormModal: React.FC<VehicleFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  vehicleToEdit,
  existingCount,
}) => {
  const isEditing = Boolean(vehicleToEdit);

  const [id, setId] = useState('');
  const [modeloMarca, setModeloMarca] = useState('');
  const [patente, setPatente] = useState('');
  const [codigoInterno, setCodigoInterno] = useState('');
  const [fotografia, setFotografia] = useState('');
  const [precioCosto, setPrecioCosto] = useState<number | ''>('');
  const [precioSugerido, setPrecioSugerido] = useState<number | ''>('');
  const [precioCostoHora, setPrecioCostoHora] = useState<number | ''>('');
  const [precioSugeridoHora, setPrecioSugeridoHora] = useState<number | ''>('');
  const [modalidadTarifa, setModalidadTarifa] = useState<RentalModality>('AMBOS');
  const [categoriaEquipo, setCategoriaEquipo] = useState<EquipmentCategory>('VIAL_PESADA');
  const [clasificacion, setClasificacion] = useState<VehicleClassification>('Máquinas');
  const [estado, setEstado] = useState<VehicleStatus>('DISPONIBLE');
  
  // Public web options
  const [publicarEnWeb, setPublicarEnWeb] = useState<boolean>(true);
  const [mostrarPrecioAlquiler, setMostrarPrecioAlquiler] = useState<boolean>(true);
  const [incluyeOperario, setIncluyeOperario] = useState<boolean>(true);
  const [ordenVisibilidad, setOrdenVisibilidad] = useState<number | ''>(1);

  // Complementary attributes
  const [anio, setAnio] = useState<number | ''>('');
  const [horometro, setHorometro] = useState<number | ''>('');
  const [ubicacionActual, setUbicacionActual] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [mostrarEnDashboard, setMostrarEnDashboard] = useState<boolean>(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPresets, setShowPresets] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [optimizationInfo, setOptimizationInfo] = useState<string | null>(null);
  const [r2Error, setR2Error] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    if (vehicleToEdit) {
      const normalizedClasif = normalizeEquipmentClassification(vehicleToEdit.clasificacion, vehicleToEdit.modeloMarca);
      setId(vehicleToEdit.id || '');
      setModeloMarca(vehicleToEdit.modeloMarca || '');
      setAnio(vehicleToEdit.anio ?? '');
      setPatente(vehicleToEdit.patente || '');
      setCodigoInterno(vehicleToEdit.codigoInterno || '');
      setFotografia(vehicleToEdit.fotografia || '');
      setPrecioCosto(vehicleToEdit.precioCosto ?? '');
      setPrecioSugerido(vehicleToEdit.precioSugerido ?? '');
      setPrecioCostoHora(vehicleToEdit.precioCostoHora ?? '');
      setPrecioSugeridoHora(vehicleToEdit.precioSugeridoHora ?? '');
      setModalidadTarifa(vehicleToEdit.modalidadTarifa || 'AMBOS');
      setClasificacion(normalizedClasif);
      setCategoriaEquipo(vehicleToEdit.categoriaEquipo || getCategoryFromClassification(normalizedClasif));
      setEstado(vehicleToEdit.estado || 'DISPONIBLE');
      setPublicarEnWeb(vehicleToEdit.publicarEnWeb ?? true);
      setMostrarPrecioAlquiler(vehicleToEdit.mostrarPrecioAlquiler ?? true);
      setIncluyeOperario(vehicleToEdit.incluyeOperario ?? true);
      setOrdenVisibilidad(vehicleToEdit.ordenVisibilidad ?? (existingCount + 1));
      setHorometro(vehicleToEdit.horometro ?? '');
      setUbicacionActual(vehicleToEdit.ubicacionActual || '');
      setObservaciones(vehicleToEdit.observaciones || '');
      setMostrarEnDashboard(vehicleToEdit.mostrarEnDashboard ?? true);
    } else {
      const nextNum = existingCount + 1;
      const formattedNum = nextNum < 10 ? `00${nextNum}` : nextNum < 100 ? `0${nextNum}` : `${nextNum}`;
      setId(`EQ-${formattedNum}`);
      setModeloMarca('');
      setAnio('');
      setPatente('');
      setCodigoInterno(`LH-MQ-2024-${nextNum < 10 ? `0${nextNum}` : nextNum}`);
      setFotografia('https://images.unsplash.com/photo-1579829366248-204fe8413f31?auto=format&fit=crop&w=800&q=80');
      setPrecioCosto(45000);
      setPrecioSugerido(85000);
      setPrecioCostoHora(6500);
      setPrecioSugeridoHora(13000);
      setModalidadTarifa('AMBOS');
      setCategoriaEquipo('VIAL_PESADA');
      setClasificacion('Máquinas');
      setEstado('DISPONIBLE');
      setPublicarEnWeb(true);
      setOrdenVisibilidad(nextNum);
      setMostrarPrecioAlquiler(true);
      setIncluyeOperario(true);
      setHorometro(0);
      setUbicacionActual('Base Central - Parque de Maquinaria');
      setObservaciones('');
      setMostrarEnDashboard(true);
    }
    setErrors({});
    setR2Error(null);
    setOptimizationInfo(null);
    setShowPresets(false);
  }, [vehicleToEdit, existingCount, isOpen]);

  const handleImageSelected = async (base64OrUrl: string, file?: File) => {
    setR2Error(null);
    setOptimizationInfo(null);

    if (!file && (base64OrUrl.startsWith('http://') || base64OrUrl.startsWith('https://'))) {
      setFotografia(base64OrUrl);
      return;
    }

    const uploadInput: File | string | undefined = file || (base64OrUrl ? base64OrUrl : undefined);
    if (!uploadInput) return;

    setUploadingImage(true);
    try {
      const r2Res = await uploadImageToCloudflareR2(
        uploadInput,
        file?.name || `foto_maquinaria_${Date.now()}.webp`,
        file?.type || 'image/webp',
        {
          maxWidth: 1600,
          maxHeight: 1600,
          quality: 0.82,
          format: 'image/webp'
        }
      );
      if (r2Res.success && r2Res.url) {
        setFotografia(r2Res.url);
        if (r2Res.originalSizeKB && r2Res.optimizedSizeKB) {
          setOptimizationInfo(`Subida a Cloudflare R2 (WebP): ${r2Res.originalSizeKB} KB → ${r2Res.optimizedSizeKB} KB`);
        } else {
          setOptimizationInfo('Fotografía subida a Cloudflare R2 con éxito.');
        }
      } else {
        setR2Error(r2Res.error || 'No se pudo subir la imagen a Cloudflare R2. No se guardó en Supabase.');
      }
    } catch (err: any) {
      setR2Error(err?.message || 'No se pudo subir la imagen a Cloudflare R2. Verificá tu conexión.');
    } finally {
      setUploadingImage(false);
    }
  };

  useClipboardImagePaste({
    enabled: isOpen,
    onImagePasted: (base64OrUrl, file) => {
      handleImageSelected(base64OrUrl, file);
    },
  });

  if (!isOpen) return null;

  const applyMarkup = (percentage: number) => {
    const cost = typeof precioCosto === 'number' ? precioCosto : Number(precioCosto) || 0;
    if (cost > 0) {
      const suggested = Math.round(cost * (1 + percentage / 100));
      setPrecioSugerido(suggested);
    }
    const costH = typeof precioCostoHora === 'number' ? precioCostoHora : Number(precioCostoHora) || 0;
    if (costH > 0) {
      const suggestedH = Math.round(costH * (1 + percentage / 100));
      setPrecioSugeridoHora(suggestedH);
    }
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!id.trim()) newErrors.id = 'El ID es requerido';
    if (!modeloMarca.trim()) newErrors.modeloMarca = 'El Modelo / Marca es requerido';
    if (precioCosto === '' || Number(precioCosto) < 0) newErrors.precioCosto = 'Ingrese un precio de costo válido';
    if (precioSugerido === '' || Number(precioSugerido) < 0) newErrors.precioSugerido = 'Ingrese un precio sugerido válido';
    if (fotografia.trim().startsWith('data:')) {
      newErrors.fotografia = 'La imagen debe subirse a Cloudflare R2 antes de guardar.';
      setR2Error('La imagen actual es base64 local. Subila nuevamente para alojarla en Cloudflare R2.');
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const savedVehicle: Vehicle = {
      id: id.trim(),
      modeloMarca: modeloMarca.trim(),
      anio: anio !== '' && !isNaN(Number(anio)) ? Number(anio) : undefined,
      patente: patente.trim().toUpperCase() || 'S/P',
      codigoInterno: codigoInterno.trim().toUpperCase() || id.trim(),
      fotografia: fotografia.trim() || 'https://images.unsplash.com/photo-1579829366248-204fe8413f31?auto=format&fit=crop&w=800&q=80',
      precioCosto: Number(precioCosto) || 0,
      precioSugerido: Number(precioSugerido) || 0,
      precioCostoHora: Number(precioCostoHora) || undefined,
      precioSugeridoHora: Number(precioSugeridoHora) || undefined,
      modalidadTarifa,
      categoriaEquipo,
      clasificacion,
      estado,
      publicarEnWeb,
      mostrarPrecioAlquiler,
      incluyeOperario,
      ordenVisibilidad: typeof ordenVisibilidad === 'number' ? ordenVisibilidad : (parseInt(String(ordenVisibilidad)) || 1),
      horometro: Number(horometro) || 0,
      ubicacionActual: ubicacionActual.trim() || 'Base Central',
      observaciones: observaciones.trim(),
      fechaAlta: vehicleToEdit ? vehicleToEdit.fechaAlta : new Date().toISOString().slice(0, 10),
      fechaUltimoMantenimiento: vehicleToEdit?.fechaUltimoMantenimiento,
      mostrarEnDashboard,
    };

    onSave(savedVehicle);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 overflow-y-auto">
      <div 
        className="bg-[#16191F] border border-slate-800 w-full max-w-4xl rounded-xl shadow-2xl overflow-hidden flex flex-col my-8 max-h-[90vh]"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/60 text-white relative">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500 text-black flex items-center justify-center font-bold shadow-sm">
              {isEditing ? <Edit3 className="w-5 h-5" /> : <PlusCircle className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                {isEditing ? `Modificar Equipo / Vehículo: ${vehicleToEdit?.id}` : 'Dar de Alta Equipo / Maquinaria'}
              </h2>
              <p className="text-xs text-slate-400 font-medium">
                La Hormiga • Registro de flota, herramientas y equipos con publicación comercial
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-6 flex-1 text-slate-200">
          
          {/* Section 1: Categoría y Clasificación */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-800 text-amber-500">
              <Truck className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">
                1. Categoría y Clasificación Comercial
              </h3>
            </div>

            {/* Categoría Selector */}
            <div>
              <label className="block text-xs font-semibold mb-2 text-slate-300">
                Rubro / Categoría Principal <span className="text-red-500">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                {CATEGORIES.map((cat) => {
                  const isSelected = categoriaEquipo === cat.value;
                  return (
                    <button
                      type="button"
                      key={cat.value}
                      onClick={() => {
                        setCategoriaEquipo(cat.value);
                        if (cat.value === 'VEHICULOS_TERCEROS') {
                          setClasificacion('Vehículos de Terceros');
                        }
                      }}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col justify-between ${
                        isSelected
                          ? 'bg-amber-500/15 border-amber-500 text-amber-300 shadow-sm'
                          : 'bg-[#0F1115] border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-300'
                      }`}
                    >
                      <span className="text-xs font-bold text-white mb-1">{cat.label}</span>
                      <span className="text-[10px] text-slate-400 line-clamp-2">{cat.desc}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* ID */}
              <div>
                <label className="block text-xs font-semibold mb-1 text-slate-300">
                  ID de Registro (Código único) <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 text-xs">#</span>
                  <input
                    type="text"
                    value={id}
                    onChange={(e) => setId(e.target.value)}
                    placeholder="ej: EQ-001, ROT-01"
                    className="w-full pl-7 pr-3 py-2 text-sm rounded-lg border border-slate-800 bg-[#0F1115] text-amber-400 font-bold focus:outline-none focus:border-amber-500 font-mono"
                    required
                  />
                </div>
                {errors.id && <p className="text-xs text-red-400 mt-1">{errors.id}</p>}
              </div>

              {/* MODELO_MARCA */}
              <div>
                <label className="block text-xs font-semibold mb-1 text-slate-300">
                  Modelo y Marca <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={modeloMarca}
                  onChange={(e) => setModeloMarca(e.target.value)}
                  placeholder="ej: Bobcat S570 / DeWalt D25601K"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-800 bg-[#0F1115] text-white focus:outline-none focus:border-amber-500"
                  required
                />
                {errors.modeloMarca && <p className="text-xs text-red-400 mt-1">{errors.modeloMarca}</p>}
              </div>

              {/* AÑO DE FABRICACIÓN / MODELO */}
              <div>
                <label className="block text-xs font-semibold mb-1 text-slate-300 flex items-center justify-between">
                  <span>Año del Vehículo</span>
                  <span className="text-[10px] text-amber-400/80 font-mono">Modelo / Fab.</span>
                </label>
                <input
                  type="number"
                  min="1950"
                  max="2050"
                  value={anio}
                  onChange={(e) => {
                    const val = e.target.value;
                    setAnio(val === '' ? '' : parseInt(val, 10));
                  }}
                  placeholder="ej: 2024"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-800 bg-[#0F1115] text-amber-300 font-bold font-mono focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* PATENTE */}
              <div>
                <label className="block text-xs font-semibold mb-1 text-slate-300">
                  Patente / Nro Serie
                </label>
                <input
                  type="text"
                  value={patente}
                  onChange={(e) => setPatente(e.target.value.toUpperCase())}
                  placeholder="ej: AF 123 CD (o Serie)"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-800 bg-[#0F1115] text-white focus:outline-none focus:border-amber-500 font-mono uppercase"
                />
              </div>

              {/* CODIGO_INTERNO */}
              <div>
                <label className="block text-xs font-semibold mb-1 text-slate-300">
                  Código Interno
                </label>
                <input
                  type="text"
                  value={codigoInterno}
                  onChange={(e) => setCodigoInterno(e.target.value)}
                  placeholder="ej: LH-MQ-2024-03"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-800 bg-[#0F1115] text-white focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              {/* CLASIFICACION */}
              <div>
                <label className="block text-xs font-semibold mb-1 text-slate-300 flex items-center justify-between">
                  <span>Tipo / Clasificación <span className="text-red-500">*</span></span>
                  <span className="text-[10px] text-amber-400 font-mono">7 Categorías Oficiales</span>
                </label>
                <select
                  value={clasificacion}
                  onChange={(e) => {
                    const newClasif = e.target.value as VehicleClassification;
                    setClasificacion(newClasif);
                    setCategoriaEquipo(getCategoryFromClassification(newClasif));
                  }}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-800 bg-[#0F1115] text-amber-300 font-semibold focus:outline-none focus:border-amber-500"
                >
                  {CLASSIFICATIONS.map((c) => (
                    <option key={c} value={c} className="bg-[#15181E] text-white">
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* ESTADO */}
              <div>
                <label className="block text-xs font-semibold mb-1 text-slate-300">
                  Estado Operativo Actual <span className="text-red-500">*</span>
                </label>
                <select
                  value={estado}
                  onChange={(e) => setEstado(e.target.value as VehicleStatus)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-800 bg-[#0F1115] text-amber-400 font-bold focus:outline-none focus:border-amber-500"
                >
                  {STATUSES.map((st) => (
                    <option key={st.value} value={st.value}>
                      {st.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Section 2: Publicación y Alquiler */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-800 text-amber-500">
              <Globe className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">
                2. Configuración para el Sitio Web Comercial y Alquileres
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Publicar en Web */}
              <div className="p-3 bg-[#0F1115] border border-slate-800 rounded-xl flex items-center justify-between">
                <div>
                  <span className="block text-xs font-bold text-white">¿Publicar en la Web?</span>
                  <span className="block text-[10px] text-slate-400">Mostrar en el catálogo público.</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPublicarEnWeb(!publicarEnWeb)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    publicarEnWeb
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}
                >
                  {publicarEnWeb ? 'Sí' : 'No'}
                </button>
              </div>

              {/* Orden de Visibilidad en Web */}
              <div className="p-3 bg-[#0F1115] border border-amber-500/30 rounded-xl flex items-center justify-between shadow-[0_0_15px_rgba(240,200,0,0.05)]">
                <div>
                  <span className="block text-xs font-bold text-amber-400 flex items-center gap-1">
                    <span>Orden en la Web</span>
                  </span>
                  <span className="block text-[10px] text-slate-400">Posición (1 = primero)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setOrdenVisibilidad(prev => Math.max(1, (Number(prev) || 1) - 1))}
                    className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold flex items-center justify-center text-xs border border-slate-700 cursor-pointer"
                    title="Mover hacia arriba"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={ordenVisibilidad}
                    onChange={(e) => setOrdenVisibilidad(e.target.value === '' ? '' : Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-14 px-2 py-1 bg-slate-950 border border-amber-500/40 rounded text-center text-xs font-mono font-bold text-[#F0C800] focus:outline-none focus:border-[#F0C800]"
                  />
                  <button
                    type="button"
                    onClick={() => setOrdenVisibilidad(prev => (Number(prev) || 0) + 1)}
                    className="w-7 h-7 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold flex items-center justify-center text-xs border border-slate-700 cursor-pointer"
                    title="Mover hacia abajo"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Mostrar Precio */}
              <div className="p-3 bg-[#0F1115] border border-slate-800 rounded-xl flex items-center justify-between">
                <div>
                  <span className="block text-xs font-bold text-white">¿Mostrar Tarifa?</span>
                  <span className="block text-[10px] text-slate-400">Ocultar o mostrar precio.</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMostrarPrecioAlquiler(!mostrarPrecioAlquiler)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    mostrarPrecioAlquiler
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}
                >
                  {mostrarPrecioAlquiler ? 'Visible' : 'Consultar'}
                </button>
              </div>

              {/* Incluye Operario */}
              <div className="p-3 bg-[#0F1115] border border-slate-800 rounded-xl flex items-center justify-between">
                <div>
                  <span className="block text-xs font-bold text-white">¿Con Operario?</span>
                  <span className="block text-[10px] text-slate-400">Chofer de nómina.</span>
                </div>
                <button
                  type="button"
                  onClick={() => setIncluyeOperario(!incluyeOperario)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    incluyeOperario
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40'
                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}
                >
                  {incluyeOperario ? 'Con Operario' : 'Sin Operario'}
                </button>
              </div>
            </div>
          </div>

          {/* Section 3: Tarifas y Costos */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-amber-500">
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                <h3 className="text-xs font-bold uppercase tracking-wider">
                  3. Estructura de Costos y Precios de Alquiler (Día / Hora)
                </h3>
              </div>

              {/* Quick markup generator helper */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-slate-400 text-[11px]">Aplicar Margen:</span>
                <button
                  type="button"
                  onClick={() => applyMarkup(50)}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-amber-500 hover:text-black font-semibold text-[11px] text-slate-300 transition cursor-pointer"
                >
                  +50%
                </button>
                <button
                  type="button"
                  onClick={() => applyMarkup(75)}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-amber-500 hover:text-black font-semibold text-[11px] text-slate-300 transition cursor-pointer"
                >
                  +75%
                </button>
                <button
                  type="button"
                  onClick={() => applyMarkup(100)}
                  className="px-2 py-0.5 rounded bg-slate-800 hover:bg-amber-500 hover:text-black font-semibold text-[11px] text-slate-300 transition cursor-pointer"
                >
                  +100%
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-[#0F1115] p-4 rounded-xl border border-slate-800">
              {/* PRECIO COSTO DIARIO */}
              <div>
                <label className="block text-xs font-semibold mb-1 text-slate-300">
                  Precio Costo por DÍA ($) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={precioCosto}
                  onChange={(e) => setPrecioCosto(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="ej: 45000"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-800 bg-[#16191F] text-white focus:outline-none focus:border-amber-500 font-mono"
                  required
                />
                {errors.precioCosto && <p className="text-xs text-red-400 mt-1">{errors.precioCosto}</p>}
              </div>

              {/* PRECIO SUGERIDO DIARIO */}
              <div>
                <label className="block text-xs font-semibold mb-1 text-amber-500">
                  Precio Sugerido por DÍA ($) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={precioSugerido}
                  onChange={(e) => setPrecioSugerido(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="ej: 80000"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-amber-500/40 bg-[#16191F] focus:outline-none focus:border-amber-500 font-bold font-mono text-amber-400"
                  required
                />
                {errors.precioSugerido && <p className="text-xs text-red-400 mt-1">{errors.precioSugerido}</p>}
              </div>

              {/* PRECIO COSTO POR HORA */}
              <div>
                <label className="block text-xs font-semibold mb-1 text-slate-300">
                  Precio Costo por HORA ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={precioCostoHora}
                  onChange={(e) => setPrecioCostoHora(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="ej: 6500"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-800 bg-[#16191F] text-white focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              {/* PRECIO SUGERIDO POR HORA */}
              <div>
                <label className="block text-xs font-semibold mb-1 text-amber-500">
                  Precio Sugerido por HORA ($)
                </label>
                <input
                  type="number"
                  min="0"
                  step="100"
                  value={precioSugeridoHora}
                  onChange={(e) => setPrecioSugeridoHora(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="ej: 13000"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-amber-500/40 bg-[#16191F] focus:outline-none focus:border-amber-500 font-bold font-mono text-amber-400"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Fotografía del Vehículo */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-amber-500">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4" />
                <h3 className="text-xs font-bold uppercase tracking-wider">
                  4. Fotografía de la Unidad
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPresets(!showPresets)}
                className="text-xs font-medium text-amber-500 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{showPresets ? 'Ocultar catálogo de fotos' : 'Ver fotos sugeridas'}</span>
              </button>
            </div>

            {showPresets && (
              <div className="p-3 bg-[#0F1115] border border-slate-800 rounded-xl space-y-2 animate-in fade-in">
                <p className="text-xs font-semibold text-slate-300">
                  Selecciona una foto rápida de maquinaria / equipos:
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {PRESET_MACHINERY_IMAGES.map((img, idx) => (
                    <button
                      type="button"
                      key={idx}
                      onClick={() => setFotografia(img.url)}
                      className="group relative rounded-lg overflow-hidden border border-slate-700 hover:border-amber-500 focus:border-amber-500 transition aspect-video cursor-pointer"
                    >
                      <img
                        src={img.url}
                        alt={img.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition"
                      />
                      <span className="absolute inset-x-0 bottom-0 bg-black/80 text-[10px] text-white p-1 truncate text-center">
                        {img.name}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
              {/* Photo Input with Drag & Drop and Clipboard Paste */}
              <div className="md:col-span-3 space-y-3">
                <ImageClipboardDropzone
                  currentImageUrl={fotografia}
                  onImageChange={(newPhoto, file) => handleImageSelected(newPhoto, file)}
                  onImageRemove={() => {
                    setFotografia('');
                    setR2Error(null);
                    setOptimizationInfo(null);
                  }}
                  label="Fotografía del Equipo o Vehículo"
                  sublabel="Arrastrá la imagen, explorá tus archivos o pegala con Ctrl+V directamente desde el portapapeles (se aloja en Cloudflare R2)"
                  aspectRatio="video"
                  placeholderText="Pegá una captura o foto copiada con Ctrl+V o arrastrala aquí"
                />

                {uploadingImage && (
                  <p className="text-[11px] text-amber-400 animate-pulse font-medium">Optimizando y subiendo fotografía a Cloudflare R2...</p>
                )}
                {r2Error && (
                  <div className="flex items-start justify-between gap-2 text-xs text-rose-200 bg-rose-500/15 border border-rose-500/40 px-3 py-2.5 rounded-xl">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-rose-300">No se pudo subir la imagen a Cloudflare R2</p>
                        <p className="text-[11px] text-rose-200/90 mt-0.5">{r2Error}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setR2Error(null)}
                      className="text-rose-300 hover:text-white p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
                {optimizationInfo && !uploadingImage && !r2Error && (
                  <div className="flex items-center gap-1.5 text-[11px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1.5 rounded-lg">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span>{optimizationInfo}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 5: Datos Complementarios de Operación */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-800 text-amber-500">
              <Clock className="w-4 h-4" />
              <h3 className="text-xs font-bold uppercase tracking-wider">
                5. Ubicación, Horómetro y Observaciones
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold mb-1 text-slate-300">
                  Horómetro Actual (Horas trabajadas)
                </label>
                <input
                  type="number"
                  min="0"
                  value={horometro}
                  onChange={(e) => setHorometro(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="ej: 1450"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-800 bg-[#0F1115] text-white focus:outline-none focus:border-amber-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1 text-slate-300">
                  Ubicación Actual
                </label>
                <input
                  type="text"
                  value={ubicacionActual}
                  onChange={(e) => setUbicacionActual(e.target.value)}
                  placeholder="ej: Base Central / Obra Autopista Sur"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-800 bg-[#0F1115] text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold mb-1 text-slate-300">
                  Observaciones / Accesorios Incluidos
                </label>
                <textarea
                  rows={2}
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="ej: Incluye martillo hidráulico, juego de baldes 30/60cm, VTV al día..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-800 bg-[#0F1115] text-white focus:outline-none focus:border-amber-500"
                />
              </div>

              <div className="sm:col-span-2 pt-2">
                <div className="flex items-center justify-between p-3.5 bg-[#0F1115] border border-slate-800 rounded-xl">
                  <div>
                    <span className="block text-xs font-bold text-white">Mostrar en Paneles de Rendimiento</span>
                    <span className="block text-[11px] text-slate-400">Si está activo, este equipo se incluye en los paneles de seguimiento y rendimientos.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMostrarEnDashboard(!mostrarEnDashboard)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                      mostrarEnDashboard
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {mostrarEnDashboard ? 'Sí (Visible)' : 'No (Oculto)'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Form Actions Footer */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3 sticky bottom-0 bg-[#16191F] py-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-slate-700 text-xs sm:text-sm font-semibold text-slate-300 hover:bg-slate-800 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              id="btn-guardar-vehiculo"
              className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-black font-bold text-xs sm:text-sm shadow-sm transition cursor-pointer flex items-center gap-2"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>{isEditing ? 'Guardar Cambios' : 'Dar de Alta Vehículo'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
