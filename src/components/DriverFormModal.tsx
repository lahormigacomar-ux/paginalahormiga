import React, { useState, useEffect } from 'react';
import { Employee, EmployeeStatus, Vehicle } from '../types';
import { 
  EMPLOYEE_CATEGORIES, 
  EMPLOYEE_SECTORS, 
  EMPLOYEE_OBRAS, 
  EMPLOYEE_AVATAR_PRESETS 
} from '../data/initialDrivers';
import { uploadImageToCloudflareR2 } from '../services/api';
import { useClipboardImagePaste } from '../hooks/useClipboardImagePaste';
import { readImageFromClipboard } from '../utils/clipboardImage';
import { 
  X, 
  UserCheck, 
  Upload, 
  HardHat, 
  Phone, 
  Building2, 
  MapPin, 
  Layers, 
  Truck, 
  DollarSign, 
  FileText,
  Check,
  BadgeAlert,
  Sparkles,
  Briefcase,
  Clipboard
} from 'lucide-react';

interface DriverFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (employee: Employee) => void;
  driverToEdit?: Employee | null;
  existingDriversCount: number;
  fleet: Vehicle[];
}

export const DriverFormModal: React.FC<DriverFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  driverToEdit,
  existingDriversCount,
  fleet,
}) => {
  // Required 9 columns
  const [id, setId] = useState('');
  const [codigoEmpleado, setCodigoEmpleado] = useState('');
  const [nombreApellido, setNombreApellido] = useState('');
  const [legajo, setLegajo] = useState('');
  const [categoria, setCategoria] = useState(EMPLOYEE_CATEGORIES[0]);
  const [foto, setFoto] = useState(EMPLOYEE_AVATAR_PRESETS[0]);
  const [sector, setSector] = useState(EMPLOYEE_SECTORS[0]);
  const [obra, setObra] = useState(EMPLOYEE_OBRAS[0]);
  const [estado, setEstado] = useState<EmployeeStatus>('ACTIVO');
  const [mostrarEnAsistencia, setMostrarEnAsistencia] = useState<boolean>(true);

  // Secondary operational fields
  const [dni, setDni] = useState('');
  const [cuit, setCuit] = useState('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [vehiculoAsignadoId, setVehiculoAsignadoId] = useState<string>('');
  const [costoPorDia, setCostoPorDia] = useState<number>(42000);
  const [observaciones, setObservaciones] = useState('');
  const [customSector, setCustomSector] = useState(false);
  const [customObra, setCustomObra] = useState(false);
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const [r2Error, setR2Error] = useState<string | null>(null);
  const [customCategoria, setCustomCategoria] = useState(false);

  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (driverToEdit) {
      setId(driverToEdit.id);
      setCodigoEmpleado(driverToEdit.codigoEmpleado || '');
      setNombreApellido(driverToEdit.nombreApellido || '');
      setLegajo(driverToEdit.legajo || '');
      setCategoria(driverToEdit.categoria || EMPLOYEE_CATEGORIES[0]);
      setFoto(driverToEdit.foto || EMPLOYEE_AVATAR_PRESETS[0]);
      setSector(driverToEdit.sector || EMPLOYEE_SECTORS[0]);
      setObra(driverToEdit.obra || EMPLOYEE_OBRAS[0]);
      setEstado(driverToEdit.estado || 'ACTIVO');
      setMostrarEnAsistencia(driverToEdit.mostrarEnAsistencia !== false);

      setDni(driverToEdit.dni || '');
      setCuit(driverToEdit.cuit || '');
      setTelefono(driverToEdit.telefono || '');
      setEmail(driverToEdit.email || '');
      setVehiculoAsignadoId(driverToEdit.vehiculoAsignadoId || '');
      setCostoPorDia(driverToEdit.costoPorDia || 42000);
      setObservaciones(driverToEdit.observaciones || '');
      setErrors({});
      setR2Error(null);
    } else {
      const nextNum = existingDriversCount + 1;
      const formattedNum = nextNum < 10 ? `00${nextNum}` : nextNum < 100 ? `0${nextNum}` : `${nextNum}`;
      
      setId(`EMP-${formattedNum}`);
      setCodigoEmpleado(`OP-${100 + nextNum}`);
      setNombreApellido('');
      setLegajo(`LEG-${7000 + nextNum * 15}`);
      setCategoria(EMPLOYEE_CATEGORIES[0]);
      setFoto(EMPLOYEE_AVATAR_PRESETS[(nextNum - 1) % EMPLOYEE_AVATAR_PRESETS.length]);
      setSector(EMPLOYEE_SECTORS[0]);
      setObra(EMPLOYEE_OBRAS[0]);
      setEstado('ACTIVO');
      setMostrarEnAsistencia(true);

      setDni('');
      setCuit('');
      setTelefono('');
      setEmail('');
      setVehiculoAsignadoId('');
      setCostoPorDia(42000);
      setObservaciones('');
      setErrors({});
      setR2Error(null);
    }
  }, [driverToEdit, existingDriversCount, isOpen]);

  const uploadDriverFotoToR2 = async (input: File | string, fileName?: string, fileType?: string) => {
    if (typeof input === 'string' && (input.startsWith('http://') || input.startsWith('https://'))) {
      setR2Error(null);
      setFoto(input);
      return;
    }

    setR2Error(null);
    setUploadingFoto(true);
    try {
      const r2Res = await uploadImageToCloudflareR2(
        input,
        fileName || 'avatar.webp',
        fileType || 'image/webp',
        {
          maxWidth: 512,
          maxHeight: 512,
          quality: 0.85,
          format: 'image/webp'
        }
      );
      if (r2Res.success && r2Res.url) {
        setFoto(r2Res.url);
        setErrors(prev => {
          const next = { ...prev };
          delete next.foto;
          return next;
        });
      } else {
        setR2Error(r2Res.error || 'No se pudo subir la fotografía a Cloudflare R2. No se guardó en la base de datos.');
      }
    } catch (err: any) {
      setR2Error(err?.message || 'No se pudo subir la fotografía a Cloudflare R2. Verificá tu conexión.');
    } finally {
      setUploadingFoto(false);
    }
  };

  const handlePasteClipboardImage = async () => {
    const item = await readImageFromClipboard();
    if (item) {
      await uploadDriverFotoToR2(
        item.file || item.base64,
        item.file?.name || `avatar_${Date.now()}.webp`,
        item.file?.type || 'image/webp'
      );
    } else {
      setR2Error('No se detectó ninguna imagen en el portapapeles. Copiá una imagen o captura de pantalla y volvé a intentarlo.');
    }
  };

  useClipboardImagePaste({
    enabled: isOpen,
    onImagePasted: async (base64, file) => {
      await uploadDriverFotoToR2(
        file || base64,
        file?.name || `avatar_${Date.now()}.webp`,
        file?.type || 'image/webp'
      );
    },
  });

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setR2Error('La imagen supera el tamaño máximo permitido (10 MB).');
      return;
    }

    await uploadDriverFotoToR2(file, file.name, file.type);
  };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!id.trim()) newErrors.id = 'El ID es obligatorio.';
    if (!codigoEmpleado.trim()) newErrors.codigoEmpleado = 'El Código de Empleado es obligatorio.';
    if (!nombreApellido.trim()) newErrors.nombreApellido = 'El Nombre y Apellido es obligatorio.';
    if (!legajo.trim()) newErrors.legajo = 'El Legajo es obligatorio.';
    if (!categoria.trim()) newErrors.categoria = 'La Categoría es requerida.';
    if (!sector.trim()) newErrors.sector = 'El Sector es requerido.';
    if (!obra.trim()) newErrors.obra = 'La Obra es requerida.';
    if (!foto.trim()) {
      newErrors.foto = 'La Foto es requerida.';
    } else if (foto.trim().startsWith('data:')) {
      newErrors.foto = 'No se permiten imágenes en base64; debe subirse a Cloudflare R2.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const rawId = id.trim();
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(rawId);
    const preservedId = driverToEdit
      ? driverToEdit.id
      : isUuid
        ? rawId.toLowerCase()
        : rawId.toUpperCase();

    const employeeData: Employee = {
      ...(driverToEdit || {}),
      id: preservedId,
      codigoEmpleado: codigoEmpleado.trim().toUpperCase(),
      nombreApellido: nombreApellido.trim(),
      legajo: legajo.trim().toUpperCase(),
      categoria: categoria.trim(),
      foto: foto.trim(),
      sector: sector.trim(),
      obra: obra.trim(),
      estado,
      mostrarEnAsistencia,
      dni: dni.trim() || undefined,
      cuit: cuit.trim() || undefined,
      telefono: telefono.trim() || undefined,
      email: email.trim() || undefined,
      vehiculoAsignadoId: vehiculoAsignadoId || undefined,
      fechaAlta: driverToEdit?.fechaAlta || new Date().toISOString().slice(0, 10),
      costoPorDia: Number(costoPorDia) || undefined,
      observaciones: observaciones.trim() || undefined,
    };

    onSave(employeeData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
      <div className="bg-[#16191F] border border-slate-800 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl my-8 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-800 flex items-center justify-between bg-[#13161C]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-500">
              <HardHat className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white tracking-tight">
                {driverToEdit ? 'Editar Datos de Empleado' : 'Alta de Nuevo Empleado'}
              </h3>
              <p className="text-xs text-slate-400">
                Registro de columnas obligatorias: ID, Código, Nombre/Apellido, Legajo, Categoría, Foto, Sector, Obra y Estado
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          
          {/* Top Bento Highlight */}
          <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-xl flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-amber-400 font-semibold">
              <Sparkles className="w-4 h-4" />
              <span>Columnas del Registro Oficial de Personal • La Hormiga</span>
            </div>
            <span className="text-[11px] text-slate-400 font-mono">
              9 Columnas Estructuradas
            </span>
          </div>

          {/* Section 1: Identificación y Datos Principales */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-500 flex items-center gap-2">
              <UserCheck className="w-4 h-4" />
              <span>1. Identificación & Legajo</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* ID */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  ID <span className="text-amber-500">*</span>
                </label>
                <input
                  type="text"
                  value={id}
                  onChange={(e) => {
                    if (!driverToEdit) setId(e.target.value);
                  }}
                  disabled={Boolean(driverToEdit)}
                  title={driverToEdit ? 'El ID interno no se modifica al editar para evitar duplicados' : undefined}
                  placeholder="ej. EMP-007"
                  className={`w-full bg-[#0F1115] border rounded-lg px-3.5 py-2 text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-amber-500 ${
                    driverToEdit ? 'opacity-65 cursor-not-allowed' : ''
                  } ${
                    errors.id ? 'border-rose-500' : 'border-slate-800'
                  }`}
                />
                {driverToEdit && (
                  <p className="text-[10px] text-slate-500 mt-1">ID fijo para conservar el vínculo del legajo.</p>
                )}
                {errors.id && <p className="text-[11px] text-rose-500 mt-1">{errors.id}</p>}
              </div>

              {/* CODIGO_EMPLEADO */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  CÓDIGO EMPLEADO <span className="text-amber-500">*</span>
                </label>
                <input
                  type="text"
                  value={codigoEmpleado}
                  onChange={(e) => setCodigoEmpleado(e.target.value)}
                  placeholder="ej. OP-107"
                  className={`w-full bg-[#0F1115] border rounded-lg px-3.5 py-2 text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-amber-500 ${
                    errors.codigoEmpleado ? 'border-rose-500' : 'border-slate-800'
                  }`}
                />
                {errors.codigoEmpleado && (
                  <p className="text-[11px] text-rose-500 mt-1">{errors.codigoEmpleado}</p>
                )}
              </div>

              {/* LEGAJO */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  LEGAJO <span className="text-amber-500">*</span>
                </label>
                <input
                  type="text"
                  value={legajo}
                  onChange={(e) => setLegajo(e.target.value)}
                  placeholder="ej. LEG-8920"
                  className={`w-full bg-[#0F1115] border rounded-lg px-3.5 py-2 text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-amber-500 ${
                    errors.legajo ? 'border-rose-500' : 'border-slate-800'
                  }`}
                />
                {errors.legajo && <p className="text-[11px] text-rose-500 mt-1">{errors.legajo}</p>}
              </div>
            </div>

            {/* NOMBRE_APELLIDO */}
            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                NOMBRE Y APELLIDO <span className="text-amber-500">*</span>
              </label>
              <input
                type="text"
                value={nombreApellido}
                onChange={(e) => setNombreApellido(e.target.value)}
                placeholder="ej. Carlos Benítez"
                className={`w-full bg-[#0F1115] border rounded-lg px-3.5 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 ${
                  errors.nombreApellido ? 'border-rose-500' : 'border-slate-800'
                }`}
              />
              {errors.nombreApellido && (
                <p className="text-[11px] text-rose-500 mt-1">{errors.nombreApellido}</p>
              )}
            </div>
          </div>

          {/* Section 2: Puesto, Sector, Obra y Estado */}
          <div className="space-y-4 pt-2 border-t border-slate-800/80">
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-500 flex items-center gap-2">
              <Briefcase className="w-4 h-4" />
              <span>2. Categoría, Sector, Obra & Estado</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* CATEGORIA */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-300">
                    CATEGORÍA <span className="text-amber-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setCustomCategoria(!customCategoria)}
                    className="text-[11px] text-amber-400 hover:underline cursor-pointer"
                  >
                    {customCategoria ? 'Elegir de lista' : '+ Otra manual'}
                  </button>
                </div>
                {customCategoria ? (
                  <input
                    type="text"
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value)}
                    placeholder="Escriba la categoría personalizada"
                    className="w-full bg-[#0F1115] border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                ) : (
                  <select
                    value={categoria}
                    onChange={(e) => setCategoria(e.target.value)}
                    className="w-full bg-[#0F1115] border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  >
                    {EMPLOYEE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                )}
                {errors.categoria && <p className="text-[11px] text-rose-500 mt-1">{errors.categoria}</p>}
              </div>

              {/* ESTADO */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  ESTADO <span className="text-amber-500">*</span>
                </label>
                <select
                  value={estado}
                  onChange={(e) => setEstado(e.target.value as EmployeeStatus)}
                  className="w-full bg-[#0F1115] border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500 font-semibold"
                >
                  <option value="ACTIVO">ACTIVO (Disponible)</option>
                  <option value="EN_OBRA">EN_OBRA (Asignado)</option>
                  <option value="LICENCIA">LICENCIA (Franco / Médico)</option>
                  <option value="INACTIVO">INACTIVO (Baja)</option>
                </select>
              </div>

              {/* SECTOR */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-300">
                    SECTOR <span className="text-amber-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setCustomSector(!customSector)}
                    className="text-[11px] text-amber-400 hover:underline cursor-pointer"
                  >
                    {customSector ? 'Elegir de lista' : '+ Otro sector'}
                  </button>
                </div>
                {customSector ? (
                  <input
                    type="text"
                    value={sector}
                    onChange={(e) => setSector(e.target.value)}
                    placeholder="Escriba el sector operativo"
                    className="w-full bg-[#0F1115] border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                ) : (
                  <select
                    value={sector}
                    onChange={(e) => setSector(e.target.value)}
                    className="w-full bg-[#0F1115] border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  >
                    {EMPLOYEE_SECTORS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                )}
                {errors.sector && <p className="text-[11px] text-rose-500 mt-1">{errors.sector}</p>}
              </div>

              {/* OBRA */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-300">
                    OBRA / DESTINO <span className="text-amber-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setCustomObra(!customObra)}
                    className="text-[11px] text-amber-400 hover:underline cursor-pointer"
                  >
                    {customObra ? 'Elegir de lista' : '+ Otra obra'}
                  </button>
                </div>
                {customObra ? (
                  <input
                    type="text"
                    value={obra}
                    onChange={(e) => setObra(e.target.value)}
                    placeholder="Nombre o ubicación de la obra"
                    className="w-full bg-[#0F1115] border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  />
                ) : (
                  <select
                    value={obra}
                    onChange={(e) => setObra(e.target.value)}
                    className="w-full bg-[#0F1115] border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
                  >
                    {EMPLOYEE_OBRAS.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                )}
                {errors.obra && <p className="text-[11px] text-rose-500 mt-1">{errors.obra}</p>}
              </div>
            </div>

            {/* Configuración de Control de Asistencia */}
            <div className="p-3.5 bg-[#0F1115] border border-slate-800 rounded-xl flex items-center justify-between gap-4">
              <div>
                <label className="text-xs font-bold text-white flex items-center gap-2 cursor-pointer">
                  <span>¿Mostrar este empleado en el módulo de Entradas y Salidas?</span>
                </label>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Marca esta casilla para incluir al empleado en la planilla diaria de fichadas y control de asistencia.
                </p>
              </div>
              <input
                type="checkbox"
                checked={mostrarEnAsistencia}
                onChange={(e) => setMostrarEnAsistencia(e.target.checked)}
                className="w-5 h-5 rounded bg-slate-800 border-slate-700 text-amber-500 focus:ring-0 cursor-pointer shrink-0"
              />
            </div>
          </div>

          {/* Section 3: Fotografía */}
          <div className="space-y-4 pt-2 border-t border-slate-800/80">
            <h4 className="text-xs font-bold uppercase tracking-wider text-amber-500 flex items-center gap-2">
              <Upload className="w-4 h-4" />
              <span>3. Fotografía del Empleado</span>
            </h4>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 p-4 rounded-xl bg-[#0F1115] border border-slate-800">
              <div className="relative">
                <img
                  src={foto}
                  alt="Preview Foto"
                  className="w-20 h-20 rounded-full object-cover border-2 border-amber-500/80 shadow-md bg-slate-900"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = EMPLOYEE_AVATAR_PRESETS[0];
                  }}
                />
              </div>

              <div className="flex-1 space-y-2.5">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    URL de la Imagen o Cargar Foto (Solo Cloudflare R2) <span className="text-amber-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={foto}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val.trim().startsWith('data:')) {
                        setR2Error('No pegues imágenes base64 en este campo; usá "Subir archivo" o "Pegar Portapapeles" para alojarlas en Cloudflare R2.');
                        return;
                      }
                      setR2Error(null);
                      setFoto(val);
                    }}
                    placeholder="https://..."
                    className="w-full bg-[#16191F] border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold cursor-pointer transition border border-slate-700 inline-flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5 text-amber-500" />
                    <span>{uploadingFoto ? 'Subiendo a R2...' : 'Subir archivo'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      disabled={uploadingFoto}
                      className="hidden"
                    />
                  </label>

                  <button
                    type="button"
                    onClick={handlePasteClipboardImage}
                    disabled={uploadingFoto}
                    className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-50 text-amber-400 border border-amber-500/30 rounded-lg text-xs font-semibold cursor-pointer transition inline-flex items-center gap-1.5"
                    title="Pegar imagen copiada en el portapapeles (Ctrl+V)"
                  >
                    <Clipboard className="w-3.5 h-3.5" />
                    <span>Pegar Portapapeles (Ctrl+V)</span>
                  </button>

                  <div className="flex items-center gap-1 overflow-x-auto py-1">
                    <span className="text-[10px] text-slate-500 mr-1">Predefinidos:</span>
                    {EMPLOYEE_AVATAR_PRESETS.slice(0, 5).map((p, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => {
                          setR2Error(null);
                          setFoto(p);
                        }}
                        className={`w-6 h-6 rounded-full overflow-hidden border-2 transition cursor-pointer ${
                          foto === p ? 'border-amber-500 scale-110' : 'border-transparent opacity-60 hover:opacity-100'
                        }`}
                      >
                        <img src={p} alt="preset" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            {uploadingFoto && (
              <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium flex items-center gap-2 animate-pulse">
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>Optimizando y subiendo fotografía a Cloudflare R2...</span>
              </div>
            )}
            {r2Error && (
              <div className="px-3 py-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-xs flex items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <BadgeAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-rose-300">Error al subir imagen a Cloudflare R2</p>
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
            {errors.foto && <p className="text-[11px] text-rose-500 mt-1">{errors.foto}</p>}
          </div>

          {/* Section 4: Datos Complementarios de Operación */}
          <div className="space-y-4 pt-2 border-t border-slate-800/80">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Truck className="w-4 h-4" />
              <span>4. Datos Operativos & Contacto (Opcionales)</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">DNI</label>
                <input
                  type="text"
                  value={dni}
                  onChange={(e) => setDni(e.target.value)}
                  placeholder="ej. 32.845.120"
                  className="w-full bg-[#0F1115] border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Teléfono / WhatsApp</label>
                <input
                  type="text"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="ej. +54 9 11 4455-8910"
                  className="w-full bg-[#0F1115] border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Costo Jornal / Día ($)</label>
                <input
                  type="number"
                  value={costoPorDia}
                  onChange={(e) => setCostoPorDia(Number(e.target.value))}
                  placeholder="40000"
                  className="w-full bg-[#0F1115] border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Asignación de Máquina / Equipo de la flota */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Vehículo / Equipo de Flota Asignado
              </label>
              <select
                value={vehiculoAsignadoId}
                onChange={(e) => setVehiculoAsignadoId(e.target.value)}
                className="w-full bg-[#0F1115] border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-white focus:outline-none focus:border-amber-500"
              >
                <option value="">-- Sin Vehículo Asignado / Rotativo --</option>
                {fleet.map((v) => (
                  <option key={v.id} value={v.id}>
                    [{v.codigoEquipo}] {v.modeloMarca} ({v.patente}) - {v.estado}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Observaciones</label>
              <textarea
                rows={2}
                value={observaciones}
                onChange={(e) => setObservaciones(e.target.value)}
                placeholder="Anotaciones sobre certificaciones, apto médico o especialidades..."
                className="w-full bg-[#0F1115] border border-slate-800 rounded-lg px-3.5 py-2 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-amber-500 resize-none"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-6 py-2.5 rounded-xl text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black shadow-lg shadow-amber-500/20 transition cursor-pointer flex items-center gap-2"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>{driverToEdit ? 'Guardar Cambios' : 'Registrar Empleado'}</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
