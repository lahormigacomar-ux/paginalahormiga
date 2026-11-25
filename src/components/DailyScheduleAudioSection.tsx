import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Mic,
  Square,
  Upload,
  RefreshCw,
  Check,
  AlertCircle,
  Smartphone,
  QrCode,
  Send,
  Copy,
  Calendar,
  Search,
  Truck,
  Building2,
  Users,
  FileText,
  Trash2,
  Volume2,
  Settings,
  Plus,
  CheckCircle2,
  Clock,
  Wrench,
  UserCheck,
  UserX,
  LayoutGrid,
  Loader2,
  X,
} from 'lucide-react';
import {
  BaileysConnectionStatus,
  DailyScheduleAssignmentItem,
  DailyScheduleEmployeeStatus,
  DailyScheduleRecord,
  DispatchAssignment,
  DispatchBoardState,
  Employee,
  Obra,
  ParteDiario,
  UserSession,
  Vehicle,
  WhatsAppAudioLogRecord,
} from '../types';

interface DailyScheduleAudioSectionProps {
  fleet: Vehicle[];
  employees: Employee[];
  obras: Obra[];
  partesDiarios: ParteDiario[];
  dispatchBoardState?: DispatchBoardState;
  userSession?: UserSession | null;
  onSaveDispatchBoard?: (nextState: DispatchBoardState) => Promise<boolean> | void;
  onCreatePartesBatch?: (newPartes: ParteDiario[]) => Promise<void> | void;
  onNavigateToView?: (view: string) => void;
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const getTodayISO = (): string => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const STATUS_OPTIONS: Array<{
  value: DailyScheduleEmployeeStatus;
  label: string;
  textClass: string;
  bgClass: string;
  borderClass: string;
}> = [
  {
    value: 'EN_OBRA',
    label: 'En Obra',
    textClass: 'text-emerald-300',
    bgClass: 'bg-emerald-950/60',
    borderClass: 'border-emerald-700/60',
  },
  {
    value: 'ROTURA_AVERIA',
    label: 'Rotura / Avería',
    textClass: 'text-orange-300',
    bgClass: 'bg-orange-950/70',
    borderClass: 'border-orange-500/70',
  },
  {
    value: 'TALLER',
    label: 'En Taller',
    textClass: 'text-cyan-300',
    bgClass: 'bg-cyan-950/60',
    borderClass: 'border-cyan-700/60',
  },
  {
    value: 'BASE',
    label: 'En Base / Playón',
    textClass: 'text-blue-300',
    bgClass: 'bg-blue-950/60',
    borderClass: 'border-blue-700/60',
  },
  {
    value: 'EN_FLETE',
    label: 'En Flete / Traslado',
    textClass: 'text-amber-300',
    bgClass: 'bg-amber-950/60',
    borderClass: 'border-amber-700/60',
  },
  {
    value: 'DISPONIBLE',
    label: 'Sin Asignar / Disponible',
    textClass: 'text-yellow-300',
    bgClass: 'bg-yellow-950/50',
    borderClass: 'border-yellow-600/50',
  },
  {
    value: 'FRANCO',
    label: 'Franco / Descanso',
    textClass: 'text-slate-300',
    bgClass: 'bg-slate-800/80',
    borderClass: 'border-slate-700',
  },
  {
    value: 'AUSENTE',
    label: 'Ausente / Falta',
    textClass: 'text-rose-300',
    bgClass: 'bg-rose-950/60',
    borderClass: 'border-rose-700/60',
  },
  {
    value: 'VACACIONES',
    label: 'Licencia / Vacaciones',
    textClass: 'text-purple-300',
    bgClass: 'bg-purple-950/60',
    borderClass: 'border-purple-700/60',
  },
];

export const DailyScheduleAudioSection: React.FC<DailyScheduleAudioSectionProps> = ({
  fleet,
  employees,
  obras,
  partesDiarios,
  dispatchBoardState,
  userSession,
  onSaveDispatchBoard,
  onCreatePartesBatch,
  onNavigateToView,
  onShowToast,
}) => {
  const [selectedDate, setSelectedDate] = useState<string>(() => getTodayISO());
  const [schedule, setSchedule] = useState<DailyScheduleRecord | null>(null);
  const [audioLogs, setAudioLogs] = useState<WhatsAppAudioLogRecord[]>([]);
  const [whatsappSummaryText, setWhatsappSummaryText] = useState<string>('');
  const [isLoadingSchedule, setIsLoadingSchedule] = useState<boolean>(true);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [isSavingSchedule, setIsSavingSchedule] = useState<boolean>(false);

  // Baileys status & modal
  const [baileysStatus, setBaileysStatus] = useState<BaileysConnectionStatus | null>(null);
  const [isBaileysModalOpen, setIsBaileysModalOpen] = useState<boolean>(false);
  const [isBaileysBusy, setIsBaileysBusy] = useState<boolean>(false);
  const [pairingPhoneInput, setPairingPhoneInput] = useState<string>('');
  const [authorizedPhonesInput, setAuthorizedPhonesInput] = useState<string>('');
  const [autoProcessAudios, setAutoProcessAudios] = useState<boolean>(true);
  const [autoProcessTexts, setAutoProcessTexts] = useState<boolean>(false);
  const [autoReplySummary, setAutoReplySummary] = useState<boolean>(true);
  const [targetPhoneForSend, setTargetPhoneForSend] = useState<string>('');
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState<boolean>(false);
  const isBaileysConfigDirtyRef = useRef<boolean>(false);
  const lastScheduleVersionRef = useRef<number | null>(null);

  // Audio recording / upload / text instruction
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [liveSpeechTranscript, setLiveSpeechTranscript] = useState<string>('');
  const [isProcessingAudio, setIsProcessingAudio] = useState<boolean>(false);
  const [quickTextInstruction, setQuickTextInstruction] = useState<string>('');
  const [editingLogId, setEditingLogId] = useState<string | null>(null);
  const [editingLogText, setEditingLogText] = useState<string>('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const speechRecognitionRef = useRef<any>(null);
  const liveSpeechTranscriptRef = useRef<string>('');
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Filters & table editing
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [isCreatingPartes, setIsCreatingPartes] = useState<boolean>(false);
  const [isSyncingBoard, setIsSyncingBoard] = useState<boolean>(false);

  const notify = useCallback(
    (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
      if (onShowToast) {
        onShowToast(msg, type);
      }
    },
    [onShowToast]
  );

  const fetchDailySchedule = useCallback(
    async (dateStr: string, silent: boolean = false, syncDrivers: boolean = false) => {
      if (!silent) {
        setIsLoadingSchedule(true);
        setScheduleError(null);
      }
      try {
        const res = await fetch(
          `/api/daily-schedule/${dateStr}${syncDrivers ? '?sync=1' : ''}`
        );
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'No se pudo cargar la programación desde Supabase.');
        }
        setSchedule(data.schedule);
        setAudioLogs(Array.isArray(data.audioLogs) ? data.audioLogs : []);
        setWhatsappSummaryText(data.whatsappText || '');
        setScheduleError(null);
      } catch (err: any) {
        if (!silent) {
          setScheduleError(err?.message || 'Error consultando Supabase PostgreSQL.');
        }
      } finally {
        if (!silent) {
          setIsLoadingSchedule(false);
        }
      }
    },
    []
  );

  const fetchBaileysStatus = useCallback(
    async (syncConfig: boolean = false) => {
      try {
        const res = await fetch('/api/baileys/status');
        if (!res.ok) return;
        const data: BaileysConnectionStatus = await res.json();
        setBaileysStatus(data);
        if (data.config && syncConfig && !isBaileysConfigDirtyRef.current) {
          setAuthorizedPhonesInput((data.config.authorizedPhones || []).join(', '));
          setAutoProcessAudios(data.config.autoProcessAudios !== false);
          setAutoProcessTexts(Boolean(data.config.autoProcessTexts));
          setAutoReplySummary(data.config.autoReplySummary !== false);
        }
        if (typeof data.scheduleVersion === 'number') {
          if (lastScheduleVersionRef.current === null) {
            lastScheduleVersionRef.current = data.scheduleVersion;
          } else if (data.scheduleVersion !== lastScheduleVersionRef.current) {
            lastScheduleVersionRef.current = data.scheduleVersion;
            fetchDailySchedule(selectedDate, true, false);
          }
        }
      } catch {
        // silent
      }
    },
    [selectedDate, fetchDailySchedule]
  );

  useEffect(() => {
    fetchDailySchedule(selectedDate, false, true);
    fetchBaileysStatus(true);
  }, [selectedDate, fetchDailySchedule, fetchBaileysStatus]);

  // Poll ONLY in-memory Baileys status every 8s when connected/connecting or modal open
  useEffect(() => {
    const isActiveOrModal =
      isBaileysModalOpen || (baileysStatus?.state && baileysStatus.state !== 'DISCONNECTED');
    if (!isActiveOrModal) return;
    const interval = window.setInterval(() => {
      fetchBaileysStatus(false);
    }, 8000);
    return () => window.clearInterval(interval);
  }, [fetchBaileysStatus, isBaileysModalOpen, baileysStatus?.state]);

  // Cleanup microphone timer on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) {
        window.clearInterval(recordingTimerRef.current);
      }
      if (speechRecognitionRef.current) {
        try {
          speechRecognitionRef.current.stop();
        } catch {}
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const handlePersistSchedule = async (nextSchedule: DailyScheduleRecord, rowIdToHighlight?: string) => {
    if (rowIdToHighlight) {
      setSavingRowId(rowIdToHighlight);
    } else {
      setIsSavingSchedule(true);
    }
    try {
      const res = await fetch(`/api/daily-schedule/${selectedDate}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...nextSchedule,
          updatedBy: userSession?.nombre || userSession?.username || 'Administrador',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Supabase rechazó el guardado de la programación.');
      }
      setSchedule(data.schedule);
      setWhatsappSummaryText(data.whatsappText || '');
      return true;
    } catch (err: any) {
      notify(err?.message || 'No se pudo guardar en Supabase PostgreSQL.', 'error');
      return false;
    } finally {
      setSavingRowId(null);
      setIsSavingSchedule(false);
    }
  };

  const handleUpdateItemField = async (
    itemId: string,
    patch: Partial<DailyScheduleAssignmentItem>
  ) => {
    if (!schedule) return;
    const nextItems = schedule.items.map((item) => {
      if (item.id !== itemId) return item;
      const updated: DailyScheduleAssignmentItem = {
        ...item,
        ...patch,
        updatedAt: new Date().toISOString(),
      };
      return updated;
    });
    const nextSchedule: DailyScheduleRecord = {
      ...schedule,
      items: nextItems,
    };
    setSchedule(nextSchedule);
    await handlePersistSchedule(nextSchedule, itemId);
  };

  const handleVehicleChangeForRow = async (item: DailyScheduleAssignmentItem, vehicleId: string) => {
    if (!vehicleId) {
      await handleUpdateItemField(item.id, {
        vehicleId: '',
        vehicleCode: '',
        vehicleName: '',
        origenAsignacion: 'MANUAL',
      });
      return;
    }
    const found = fleet.find((v) => (v.id || v.codigoInterno) === vehicleId);
    const code = found ? (found.codigoInterno || found.codigoEquipo || found.patente || '') : '';
    const name = found ? (found.modeloMarca || '') : '';
    await handleUpdateItemField(item.id, {
      vehicleId,
      vehicleCode: code,
      vehicleName: name,
      estado: item.estado === 'DISPONIBLE' ? 'EN_OBRA' : item.estado,
      origenAsignacion: 'MANUAL',
    });
  };

  const handleObraChangeForRow = async (item: DailyScheduleAssignmentItem, selectedVal: string) => {
    if (!selectedVal) {
      await handleUpdateItemField(item.id, {
        obraId: '',
        obraName: '',
        origenAsignacion: 'MANUAL',
      });
      return;
    }
    if (selectedVal === '__TALLER__') {
      await handleUpdateItemField(item.id, {
        obraId: '',
        obraName: 'Taller / Mantenimiento',
        estado: 'TALLER',
        origenAsignacion: 'MANUAL',
      });
      return;
    }
    if (selectedVal === '__BASE__') {
      await handleUpdateItemField(item.id, {
        obraId: '',
        obraName: 'Base Central / Playón',
        estado: 'BASE',
        origenAsignacion: 'MANUAL',
      });
      return;
    }
    const found = obras.find((o) => (o.id || o.numero) === selectedVal);
    if (found) {
      await handleUpdateItemField(item.id, {
        obraId: String(found.id || found.numero || ''),
        obraName: String(found.nombreObra || ''),
        ubicacion: String(found.ubicacion || item.ubicacion || ''),
        estado: item.estado === 'DISPONIBLE' ? 'EN_OBRA' : item.estado,
        origenAsignacion: 'MANUAL',
      });
    } else {
      await handleUpdateItemField(item.id, {
        obraId: '',
        obraName: selectedVal,
        estado: item.estado === 'DISPONIBLE' ? 'EN_OBRA' : item.estado,
        origenAsignacion: 'MANUAL',
      });
    }
  };

  // Start / Stop live microphone recording (with parallel Web Speech API es-AR transcription)
  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      recordedChunksRef.current = [];
      liveSpeechTranscriptRef.current = '';
      setLiveSpeechTranscript('');

      // Start browser SpeechRecognition in parallel if supported
      const SpeechRec =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRec) {
        try {
          const recognition = new SpeechRec();
          recognition.lang = 'es-AR';
          recognition.continuous = true;
          recognition.interimResults = true;
          recognition.onresult = (event: any) => {
            let finalStr = '';
            for (let i = 0; i < event.results.length; i++) {
              finalStr += event.results[i][0].transcript + ' ';
            }
            const cleaned = finalStr.trim();
            liveSpeechTranscriptRef.current = cleaned;
            setLiveSpeechTranscript(cleaned);
          };
          recognition.start();
          speechRecognitionRef.current = recognition;
        } catch {
          speechRecognitionRef.current = null;
        }
      }

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          recordedChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (speechRecognitionRef.current) {
          try {
            speechRecognitionRef.current.stop();
          } catch {}
          speechRecognitionRef.current = null;
        }
        if (recordingTimerRef.current) {
          window.clearInterval(recordingTimerRef.current);
          recordingTimerRef.current = null;
        }
        setIsRecording(false);
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        if (blob.size < 500 && !liveSpeechTranscriptRef.current) {
          notify('El audio grabado es demasiado corto.', 'error');
          return;
        }
        await sendAudioBlobForProcessing(
          blob,
          mimeType,
          'WEB_MIC',
          liveSpeechTranscriptRef.current || undefined
        );
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((s) => s + 1);
      }, 1000);
    } catch (err: any) {
      notify(
        'No se pudo acceder al micrófono. Verificá los permisos del navegador o subí el archivo de audio de WhatsApp.',
        'error'
      );
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const sendAudioBlobForProcessing = async (
    blob: Blob,
    mimeType: string,
    origen: 'WEB_MIC' | 'WEB_UPLOAD',
    capturedTranscript?: string
  ) => {
    setIsProcessingAudio(true);
    try {
      const base64DataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('No se pudo leer el archivo de audio.'));
        reader.readAsDataURL(blob);
      });

      const res = await fetch('/api/daily-schedule/process-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha: selectedDate,
          origen,
          audioBase64: base64DataUrl,
          mimeType,
          textInstruction: capturedTranscript,
          senderName: userSession?.nombre || userSession?.username || 'Coordinador Web',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error al procesar el audio.');
      }

      setSchedule(data.schedule);
      setAudioLogs((prev) => [data.audioLog, ...prev.filter((l) => l.id !== data.audioLog.id)]);
      setWhatsappSummaryText(data.whatsappText || '');
      setLiveSpeechTranscript('');
      notify(
        data.audioLog.detectedCount > 0
          ? `Audio procesado y guardado en Supabase: ${data.audioLog.detectedCount} asignación(es) detectada(s).`
          : 'Audio guardado en la bandeja de Supabase.',
        'success'
      );
    } catch (err: any) {
      notify(err?.message || 'Error al procesar el audio de programación.', 'error');
    } finally {
      setIsProcessingAudio(false);
    }
  };

  const handleReprocessAudioLog = async (logId: string, customText?: string) => {
    setIsProcessingAudio(true);
    try {
      const res = await fetch(`/api/daily-schedule/reprocess-log/${logId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha: selectedDate,
          textInstruction: customText,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo actualizar el registro de audio en Supabase.');
      }
      setSchedule(data.schedule);
      setAudioLogs((prev) => [data.audioLog, ...prev.filter((l) => l.id !== data.audioLog.id)]);
      setWhatsappSummaryText(data.whatsappText || '');
      setEditingLogId(null);
      setEditingLogText('');
      notify(
        `Audio aplicado al esquema en Supabase (${data.audioLog.detectedCount} empleado(s) actualizado(s)).`,
        'success'
      );
    } catch (err: any) {
      notify(err?.message || 'Error aplicando instrucción del audio.', 'error');
    } finally {
      setIsProcessingAudio(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const mime = file.type || (file.name.endsWith('.ogg') || file.name.endsWith('.opus') ? 'audio/ogg' : 'audio/mp3');
    await sendAudioBlobForProcessing(file, mime, 'WEB_UPLOAD');
  };

  const handleProcessTextInstruction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickTextInstruction.trim()) return;
    setIsProcessingAudio(true);
    try {
      const res = await fetch('/api/daily-schedule/process-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fecha: selectedDate,
          origen: 'TEXTO',
          textInstruction: quickTextInstruction.trim(),
          senderName: userSession?.nombre || userSession?.username || 'Coordinador Web',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error procesando la instrucción.');
      }
      setSchedule(data.schedule);
      setAudioLogs((prev) => [data.audioLog, ...prev.filter((l) => l.id !== data.audioLog.id)]);
      setWhatsappSummaryText(data.whatsappText || '');
      setQuickTextInstruction('');
      notify(
        `Instrucción aplicada y guardada en Supabase (${data.audioLog.detectedCount} empleados actualizados).`,
        'success'
      );
    } catch (err: any) {
      notify(err?.message || 'Error al procesar la instrucción.', 'error');
    } finally {
      setIsProcessingAudio(false);
    }
  };

  const handleDeleteAudioLog = async (logId: string) => {
    try {
      const res = await fetch(`/api/daily-schedule/audio-log/${logId}`, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || 'No se pudo eliminar el audio en Supabase.');
      }
      setAudioLogs((prev) => prev.filter((l) => l.id !== logId));
      notify('Registro de audio eliminado de Supabase.', 'info');
    } catch (err: any) {
      notify(err?.message || 'Error eliminando registro de audio.', 'error');
    }
  };

  // Baileys connection controls
  const handleConnectBaileys = async (resetSession: boolean = false) => {
    setIsBaileysBusy(true);
    try {
      const res = await fetch('/api/baileys/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resetSession,
          pairingPhone: pairingPhoneInput.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Error iniciando WhatsApp Baileys.');
      }
      setBaileysStatus(data);
      notify(
        resetSession
          ? 'Generando nueva sesión de WhatsApp Baileys...'
          : 'Conectando con WhatsApp Baileys...',
        'info'
      );
      setTimeout(() => fetchBaileysStatus(), 2000);
    } catch (err: any) {
      notify(err?.message || 'Error al conectar WhatsApp Baileys.', 'error');
    } finally {
      setIsBaileysBusy(false);
    }
  };

  const handleDisconnectBaileys = async () => {
    setIsBaileysBusy(true);
    try {
      const res = await fetch('/api/baileys/disconnect', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo desconectar.');
      }
      setBaileysStatus(data);
      notify('Sesión de WhatsApp Baileys desconectada.', 'info');
    } catch (err: any) {
      notify(err?.message || 'Error desconectando WhatsApp Baileys.', 'error');
    } finally {
      setIsBaileysBusy(false);
    }
  };

  const handleSaveBaileysConfig = async () => {
    setIsBaileysBusy(true);
    try {
      const phones = authorizedPhonesInput
        .split(/[,\n;]/)
        .map((p) => p.replace(/\D/g, '').trim())
        .filter(Boolean);

      const res = await fetch('/api/baileys/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorizedPhones: phones,
          autoProcessAudios,
          autoProcessTexts,
          autoReplySummary,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo guardar la configuración en Supabase.');
      }
      isBaileysConfigDirtyRef.current = false;
      setBaileysStatus(data);
      if (data.config) {
        setAuthorizedPhonesInput((data.config.authorizedPhones || []).join(', '));
        setAutoProcessAudios(data.config.autoProcessAudios !== false);
        setAutoProcessTexts(Boolean(data.config.autoProcessTexts));
        setAutoReplySummary(data.config.autoReplySummary !== false);
      }
      notify('Configuración de WhatsApp Baileys guardada en Supabase PostgreSQL.', 'success');
    } catch (err: any) {
      notify(err?.message || 'Error guardando configuración de Baileys.', 'error');
    } finally {
      setIsBaileysBusy(false);
    }
  };

  const handleSendScheduleViaBaileys = async () => {
    if (!targetPhoneForSend.trim() || !whatsappSummaryText.trim()) {
      notify('Ingresá un número de teléfono de WhatsApp para enviar el esquema.', 'error');
      return;
    }
    setIsSendingWhatsApp(true);
    try {
      const res = await fetch('/api/baileys/send-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: targetPhoneForSend.trim(),
          text: whatsappSummaryText,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'No se pudo enviar por Baileys.');
      }
      notify(`Esquema enviado por WhatsApp Baileys a ${targetPhoneForSend}.`, 'success');
    } catch (err: any) {
      notify(err?.message || 'Error enviando mensaje por WhatsApp.', 'error');
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  // Sync confirmed schedule to Dispatch Board (Pizarra de Ubicación) in Supabase
  const handleSyncToDispatchBoard = async () => {
    if (!schedule || !onSaveDispatchBoard || !dispatchBoardState) return;
    setIsSyncingBoard(true);
    try {
      const nowIso = new Date().toISOString();
      const newAssignments: DispatchAssignment[] = [];

      for (const item of schedule.items) {
        if (!['EN_OBRA', 'ROTURA_AVERIA', 'TALLER', 'BASE', 'EN_FLETE'].includes(item.estado)) continue;

        let locationType: 'OBRA' | 'LUGAR' = 'OBRA';
        let locationId = item.obraId || '';

        if (item.estado === 'TALLER' || item.obraName?.toLowerCase().includes('taller')) {
          locationType = 'LUGAR';
          locationId = 'place-taller';
        } else if (item.estado === 'BASE' || item.obraName?.toLowerCase().includes('base')) {
          locationType = 'LUGAR';
          locationId = 'place-base-central';
        } else if (!locationId && obras.length > 0) {
          const matchedObra = obras.find(
            (o) =>
              (o.nombreObra || '').toLowerCase() === (item.obraName || '').toLowerCase()
          );
          if (matchedObra) {
            locationId = String(matchedObra.id || matchedObra.numero || '');
          }
        }

        if (!locationId) {
          locationType = 'LUGAR';
          locationId = 'place-base-central';
        }

        newAssignments.push({
          id: `ASG-SCHED-${schedule.fecha}-${item.employeeId}`,
          locationType,
          locationId,
          employeeId: item.employeeId,
          vehicleId: item.vehicleId || undefined,
          nota: [item.roturaDetalle ? `⚠️ ${item.roturaDetalle}` : '', item.tarea, item.observaciones]
            .filter(Boolean)
            .join(' · ') || undefined,
          turno: 'MAÑANA',
          horaInicioTramo: (item.horario || '08:00').slice(0, 5),
          estadoOperativo:
            item.estado === 'ROTURA_AVERIA' || item.roturaDetalle
              ? 'CON_ROTURA'
              : item.estado === 'EN_FLETE'
              ? 'EN_FLETE'
              : 'OPERATIVO',
          assignedAt: nowIso,
          updatedAt: nowIso,
          assignedBy: userSession?.nombre || 'Programación por Audio',
        });
      }

      const nextBoard: DispatchBoardState = {
        ...dispatchBoardState,
        assignments: newAssignments,
        updatedAt: nowIso,
      };

      await Promise.resolve(onSaveDispatchBoard(nextBoard));
      await handlePersistSchedule({
        ...schedule,
        estado: 'CONFIRMADA',
        syncedToDispatchBoard: true,
      });
      notify(
        `Pizarra de Ubicación sincronizada en Supabase con ${newAssignments.length} asignación(es) del esquema.`,
        'success'
      );
    } catch (err: any) {
      notify(err?.message || 'Error sincronizando con la Pizarra de Ubicación.', 'error');
    } finally {
      setIsSyncingBoard(false);
    }
  };

  // Pre-create Partes Diarios in Supabase for assigned employees
  const handleGeneratePartesDiarios = async () => {
    if (!schedule || !onCreatePartesBatch) return;
    const assignedItems = schedule.items.filter(
      (it) => ['EN_OBRA', 'EN_FLETE'].includes(it.estado) && (it.vehicleId || it.obraName)
    );
    if (assignedItems.length === 0) {
      notify('No hay empleados asignados a obra o equipo para generar Partes Diarios.', 'error');
      return;
    }

    setIsCreatingPartes(true);
    try {
      const existingNums = partesDiarios
        .map((p) => parseInt(String(p.numParte || '0').replace(/\D/g, ''), 10))
        .filter((n) => !isNaN(n) && n > 0);
      let nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 8001;

      const toCreate: ParteDiario[] = [];
      const updatedItems = [...schedule.items];

      for (const item of assignedItems) {
        // Avoid duplicating if already created for this employee + date
        const alreadyExists = partesDiarios.some(
          (p) =>
            p.fecha === schedule.fecha &&
            (p.nombreApellido?.toLowerCase() === item.employeeName.toLowerCase() ||
              (item.parteDiarioId && p.id === item.parteDiarioId))
        );
        if (alreadyExists) continue;

        const parteId = `PD-AUD-${schedule.fecha}-${item.employeeId}-${Date.now().toString().slice(-4)}`;
        const newParte: ParteDiario = {
          id: parteId,
          fecha: schedule.fecha,
          numParte: String(nextNum++),
          codigoEquipo: item.vehicleCode || item.vehicleId || 'S/E',
          marcaModelo: item.vehicleName || 'Sin equipo asignado',
          nombreApellido: item.employeeName,
          codigoEmpleado: item.employeeCode || '',
          obra: item.obraName || 'Obra Asignada',
          codigoObra: item.obraId || '',
          ubicacion: item.ubicacion || '',
          horaInicioMañana: '08:00',
          horaFinMañana: '12:00',
          horaInicioTarde: '13:00',
          horaFinTarde: '17:00',
          horasTrabajadas: 8,
          hsCantidad: 8,
          viajesCantidad: 0,
          odomKilom: 0,
          servMant: item.estado === 'EN_FLETE' ? 'TRASLADO DE MAQUINA' : 'ALQUILER',
          tipo: 'HORAS',
          detalleTipo: item.tarea || 'Programado por Audio',
          novedades: item.observaciones || `Pre-creado desde Programación por Audio (${schedule.fecha})`,
          autorizado: 'NO CONTROLADO',
          firma: 'No firmado',
        };
        toCreate.push(newParte);

        const rowIdx = updatedItems.findIndex((r) => r.id === item.id);
        if (rowIdx !== -1) {
          updatedItems[rowIdx] = {
            ...updatedItems[rowIdx],
            parteDiarioId: parteId,
          };
        }
      }

      if (toCreate.length === 0) {
        notify('Todos los empleados asignados en esta fecha ya tienen su Parte Diario creado.', 'info');
        setIsCreatingPartes(false);
        return;
      }

      await Promise.resolve(onCreatePartesBatch([...partesDiarios, ...toCreate]));
      await handlePersistSchedule({
        ...schedule,
        estado: 'CONFIRMADA',
        items: updatedItems,
      });
      notify(
        `Se pre-crearon ${toCreate.length} Parte(s) Diario(s) en Supabase PostgreSQL.`,
        'success'
      );
    } catch (err: any) {
      notify(err?.message || 'Error creando Partes Diarios en Supabase.', 'error');
    } finally {
      setIsCreatingPartes(false);
    }
  };

  // Metrics & filtered employee rows
  const stats = useMemo(() => {
    const items = schedule?.items || [];
    const total = items.length;
    const enObra = items.filter((i) => i.estado === 'EN_OBRA' || i.estado === 'EN_FLETE').length;
    const roturas = items.filter((i) => i.estado === 'ROTURA_AVERIA' || Boolean(i.roturaDetalle)).length;
    const enTallerBase = items.filter((i) => i.estado === 'TALLER' || i.estado === 'BASE').length;
    const disponibles = items.filter((i) => i.estado === 'DISPONIBLE').length;
    const ausentesFrancos = items.filter((i) =>
      ['FRANCO', 'AUSENTE', 'VACACIONES'].includes(i.estado)
    ).length;
    return { total, enObra, roturas, enTallerBase, disponibles, ausentesFrancos };
  }, [schedule]);

  const filteredItems = useMemo(() => {
    const items = schedule?.items || [];
    return items.filter((item) => {
      if (statusFilter === 'ASSIGNED' && !['EN_OBRA', 'EN_FLETE'].includes(item.estado)) return false;
      if (statusFilter === 'ROTURAS' && item.estado !== 'ROTURA_AVERIA' && !item.roturaDetalle) return false;
      if (statusFilter === 'TALLER_BASE' && !['TALLER', 'BASE'].includes(item.estado)) return false;
      if (statusFilter === 'DISPONIBLE' && item.estado !== 'DISPONIBLE') return false;
      if (statusFilter === 'ABSENT' && !['FRANCO', 'AUSENTE', 'VACACIONES'].includes(item.estado))
        return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const hay = [
          item.employeeName,
          item.employeeCode,
          item.vehicleCode,
          item.vehicleName,
          item.obraName,
          item.tarea,
          item.roturaDetalle,
          item.observaciones,
          ...(item.historialMovimientos || []).map((m) => m.detalle),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [schedule, statusFilter, searchQuery]);

  // Vehicles already assigned today (to show subtle warning if double-assigned)
  const vehicleAssignmentCountMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const item of schedule?.items || []) {
      if (!item.vehicleId || ['DISPONIBLE', 'FRANCO', 'AUSENTE', 'VACACIONES'].includes(item.estado)) {
        continue;
      }
      const list = map.get(item.vehicleId) || [];
      list.push(item.employeeName);
      map.set(item.vehicleId, list);
    }
    return map;
  }, [schedule]);

  return (
    <div className="space-y-4 pb-10">
      {/* ===================================================================== */}
      {/* TOP BAR: Date Picker + Baileys Connection Status + Primary Actions    */}
      {/* ===================================================================== */}
      <div className="bg-[#16191F] border border-slate-800 rounded-xl p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-lg font-bold text-white tracking-tight">
              Programación del Día por Audio · Esquema de Empleados y Equipos
            </h2>
            <span className="text-xs text-slate-400">
              · Persistencia en Supabase PostgreSQL
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Mandá un audio al WhatsApp conectado con Baileys (o grabalo acá) y el sistema arma qué hace cada empleado, con qué máquina y en qué obra.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Date Selector */}
          <div className="flex items-center gap-2 bg-[#111318] border border-slate-700/80 rounded-lg px-3 py-1.5">
            <Calendar className="w-4 h-4 text-[#F0C800]" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value || getTodayISO())}
              className="bg-transparent text-xs font-mono font-semibold text-white focus:outline-none tabular-nums"
            />
          </div>

          {/* Baileys Connection Trigger Button */}
          <button
            onClick={() => {
              fetchBaileysStatus(!isBaileysConfigDirtyRef.current);
              setIsBaileysModalOpen(true);
            }}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold border transition flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 ${
              baileysStatus?.state === 'CONNECTED'
                ? 'bg-emerald-950/70 border-emerald-600/60 text-emerald-200 hover:bg-emerald-900/70'
                : baileysStatus?.state === 'QR_READY'
                ? 'bg-amber-950/70 border-amber-500/60 text-amber-200 hover:bg-amber-900/70'
                : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span>
              {baileysStatus?.state === 'CONNECTED'
                ? `WhatsApp Baileys Activo (${baileysStatus.connectedPhone || 'Vinculado'})`
                : baileysStatus?.state === 'QR_READY'
                ? 'WhatsApp Baileys: Escanear QR'
                : 'Vincular WhatsApp (Baileys)'}
            </span>
          </button>

          {/* Refresh from Supabase */}
          <button
            onClick={() => fetchDailySchedule(selectedDate, false, true)}
            disabled={isLoadingSchedule}
            className="px-3 py-2 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            title="Recargar programación desde Supabase"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSchedule ? 'animate-spin' : ''}`} />
            <span>Actualizar</span>
          </button>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* KPI STRIP: ¿Qué pasa hoy con cada empleado?                           */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <button
          onClick={() => setStatusFilter('ALL')}
          className={`text-left p-3.5 rounded-xl border transition cursor-pointer ${
            statusFilter === 'ALL'
              ? 'bg-slate-800/90 border-[#F0C800]'
              : 'bg-[#16191F] border-slate-800 hover:border-slate-700'
          }`}
        >
          <div className="text-xs text-slate-400 font-medium">Total Nómina</div>
          <div className="mt-1 text-2xl font-bold text-white font-mono tabular-nums">
            {stats.total}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400">Ver toda la nómina</div>
        </button>

        <button
          onClick={() => setStatusFilter('ASSIGNED')}
          className={`text-left p-3.5 rounded-xl border transition cursor-pointer ${
            statusFilter === 'ASSIGNED'
              ? 'bg-emerald-950/60 border-emerald-500'
              : 'bg-[#16191F] border-slate-800 hover:border-emerald-800/60'
          }`}
        >
          <div className="text-xs text-emerald-300 font-medium">En Obra / Flete</div>
          <div className="mt-1 text-2xl font-bold text-emerald-300 font-mono tabular-nums">
            {stats.enObra}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400">Con destino activo</div>
        </button>

        <button
          onClick={() => setStatusFilter('ROTURAS')}
          className={`text-left p-3.5 rounded-xl border transition cursor-pointer ${
            statusFilter === 'ROTURAS'
              ? 'bg-orange-950/70 border-orange-500'
              : 'bg-[#16191F] border-slate-800 hover:border-orange-700/60'
          }`}
        >
          <div className="text-xs text-orange-300 font-medium">Roturas / Averías</div>
          <div className="mt-1 text-2xl font-bold text-orange-300 font-mono tabular-nums">
            {stats.roturas}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400">Equipos con falla hoy</div>
        </button>

        <button
          onClick={() => setStatusFilter('TALLER_BASE')}
          className={`text-left p-3.5 rounded-xl border transition cursor-pointer ${
            statusFilter === 'TALLER_BASE'
              ? 'bg-cyan-950/60 border-cyan-500'
              : 'bg-[#16191F] border-slate-800 hover:border-cyan-800/60'
          }`}
        >
          <div className="text-xs text-cyan-300 font-medium">Taller / Base</div>
          <div className="mt-1 text-2xl font-bold text-cyan-300 font-mono tabular-nums">
            {stats.enTallerBase}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400">Mantenimiento o playón</div>
        </button>

        <button
          onClick={() => setStatusFilter('DISPONIBLE')}
          className={`text-left p-3.5 rounded-xl border transition cursor-pointer ${
            statusFilter === 'DISPONIBLE'
              ? 'bg-amber-950/60 border-amber-400'
              : 'bg-[#16191F] border-slate-800 hover:border-amber-700/60'
          }`}
        >
          <div className="text-xs text-amber-300 font-medium">Sin Asignar / Salió</div>
          <div className="mt-1 text-2xl font-bold text-amber-300 font-mono tabular-nums">
            {stats.disponibles}
          </div>
          <div className="mt-0.5 text-[11px] text-amber-200/80">
            {stats.disponibles === 0 ? 'Todos asignados' : 'Disponibles o se fueron'}
          </div>
        </button>

        <button
          onClick={() => setStatusFilter('ABSENT')}
          className={`text-left p-3.5 rounded-xl border transition cursor-pointer ${
            statusFilter === 'ABSENT'
              ? 'bg-rose-950/60 border-rose-500'
              : 'bg-[#16191F] border-slate-800 hover:border-rose-800/60'
          }`}
        >
          <div className="text-xs text-rose-300 font-medium">Francos / Ausentes</div>
          <div className="mt-1 text-2xl font-bold text-rose-300 font-mono tabular-nums">
            {stats.ausentesFrancos}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-400">Descanso o licencia</div>
        </button>
      </div>

      {/* ===================================================================== */}
      {/* AUDIO INPUT & WHATSAPP INBOX BAR                                      */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left 7 cols: Voice Dictation, File Upload & Quick Text Instruction */}
        <div className="lg:col-span-7 bg-[#16191F] border border-slate-800 rounded-xl p-4 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-white">
                Cargar o Dictar Audio de Programación ({selectedDate})
              </h3>
              <p className="text-xs text-slate-400">
                Nombrá a cada empleado, qué máquina agarra y a qué obra o tarea va. Podés mandar varios audios en el día para ir completando o cambiando el esquema.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {!isRecording ? (
              <button
                onClick={handleStartRecording}
                disabled={isProcessingAudio}
                className="px-4 py-2.5 rounded-lg bg-[#F0C800] hover:bg-[#eab308] text-slate-950 font-bold text-xs flex items-center gap-2 transition cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <Mic className="w-4 h-4" />
                <span>Grabar Audio con Micrófono</span>
              </button>
            ) : (
              <button
                onClick={handleStopRecording}
                className="px-4 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-2 transition cursor-pointer whitespace-nowrap shrink-0"
              >
                <Square className="w-4 h-4 fill-current" />
                <span className="font-mono tabular-nums">
                  Detener y Procesar ({Math.floor(recordingSeconds / 60)}:
                  {String(recordingSeconds % 60).padStart(2, '0')})
                </span>
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,.ogg,.opus,.mp3,.m4a,.wav,.webm"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessingAudio || isRecording}
              className="px-3.5 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs flex items-center gap-2 transition cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Upload className="w-4 h-4 text-amber-400" />
              <span>Subir Audio de WhatsApp (.ogg / .mp3)</span>
            </button>

            {isProcessingAudio && (
              <div className="flex items-center gap-2 text-xs text-amber-300 font-medium px-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Transcribiendo audio y cruzando empleados/equipos en Supabase...</span>
              </div>
            )}
          </div>

          {isRecording && liveSpeechTranscript && (
            <div className="p-2.5 rounded-lg bg-[#111318] border border-amber-500/40 text-xs text-amber-200">
              <span className="font-bold text-amber-400">Transcripción en vivo: </span>
              "{liveSpeechTranscript}"
            </div>
          )}

          {/* Quick Dictation Text Input */}
          <form onSubmit={handleProcessTextInstruction} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={quickTextInstruction}
              onChange={(e) => setQuickTextInstruction(e.target.value)}
              disabled={isProcessingAudio}
              placeholder='O escribí rápido: "Seba con la Ranger y Francisco con la Zoomlion a Obra Centro, Javi queda en Taller..."'
              className="flex-1 bg-[#111318] border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#F0C800]"
            />
            <button
              type="submit"
              disabled={isProcessingAudio || !quickTextInstruction.trim()}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 text-xs font-semibold transition cursor-pointer disabled:opacity-40 whitespace-nowrap shrink-0"
            >
              Aplicar al Esquema
            </button>
          </form>
        </div>

        {/* Right 5 cols: Incoming Audios Inbox from Baileys & Web */}
        <div className="lg:col-span-5 bg-[#16191F] border border-slate-800 rounded-xl p-4 flex flex-col justify-between space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-white">
                Bandeja de Audios Recibidos ({audioLogs.length})
              </h3>
              <p className="text-xs text-slate-400">
                Audios recibidos por WhatsApp Baileys o grabados en esta fecha
              </p>
            </div>
            <button
              onClick={() => setIsBaileysModalOpen(true)}
              className="text-xs text-[#F0C800] hover:underline font-semibold cursor-pointer whitespace-nowrap"
            >
              Configurar Baileys
            </button>
          </div>

          {audioLogs.length === 0 ? (
            <div className="py-6 text-center border border-dashed border-slate-800 rounded-lg px-4">
              <Volume2 className="w-6 h-6 text-slate-500 mx-auto mb-1.5" />
              <p className="text-xs text-slate-400">
                Todavía no hay audios registrados para el {selectedDate}.
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Mandá una nota de voz al WhatsApp vinculado con Baileys o usá el botón Grabar Audio.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {audioLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-2.5 rounded-lg bg-[#111318] border border-slate-800 flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <div className="flex items-center gap-1.5 text-slate-300 font-medium truncate">
                      <span className="font-mono text-slate-400 tabular-nums">{log.hora}</span>
                      <span>·</span>
                      <span className="text-white font-semibold truncate">
                        {log.senderName || log.senderPhone || 'Audio'}
                      </span>
                      <span>·</span>
                      <span
                        className={`font-mono tabular-nums ${
                          log.detectedCount > 0 ? 'text-emerald-400' : 'text-amber-300'
                        }`}
                      >
                        {log.detectedCount > 0 ? `${log.detectedCount} asig.` : 'Sin aplicar'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {log.audioUrl && (
                        <button
                          onClick={() => handleReprocessAudioLog(log.id)}
                          disabled={isProcessingAudio}
                          className="text-[11px] text-cyan-300 hover:underline font-medium cursor-pointer disabled:opacity-40"
                          title="Reintentar transcripción automática con Gemini IA usando el audio guardado en R2"
                        >
                          Reintentar IA
                        </button>
                      )}
                      <button
                        onClick={() => {
                          if (editingLogId === log.id) {
                            setEditingLogId(null);
                            setEditingLogText('');
                          } else {
                            setEditingLogId(log.id);
                            setEditingLogText(
                              log.transcripcion &&
                                !log.transcripcion.startsWith('Audio recibido y guardado')
                                ? log.transcripcion
                                : ''
                            );
                          }
                        }}
                        className="text-[11px] text-amber-300 hover:underline font-medium cursor-pointer"
                      >
                        {editingLogId === log.id ? 'Cancelar' : 'Editar / Aplicar'}
                      </button>
                      <button
                        onClick={() => handleDeleteAudioLog(log.id)}
                        className="text-slate-500 hover:text-rose-400 transition cursor-pointer"
                        title="Eliminar registro de audio"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-slate-300 italic line-clamp-2">
                    "{log.transcripcion}"
                  </p>

                  {log.audioUrl && (
                    <audio
                      controls
                      src={log.audioUrl}
                      className="h-7 w-full mt-0.5"
                      preload="none"
                    />
                  )}

                  {editingLogId === log.id && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (editingLogText.trim()) {
                          handleReprocessAudioLog(log.id, editingLogText);
                        }
                      }}
                      className="flex gap-1.5 pt-1"
                    >
                      <input
                        type="text"
                        value={editingLogText}
                        onChange={(e) => setEditingLogText(e.target.value)}
                        placeholder="Escribí lo que dice este audio (ej: neftali esta con la kobelco en obra roca)..."
                        className="flex-1 bg-[#16191F] border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#F0C800]"
                      />
                      <button
                        type="submit"
                        disabled={isProcessingAudio || !editingLogText.trim()}
                        className="px-2.5 py-1 rounded bg-[#F0C800] text-slate-950 font-bold text-xs cursor-pointer disabled:opacity-40 whitespace-nowrap"
                      >
                        Aplicar
                      </button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ===================================================================== */}
      {/* MAIN MATRIX: ¿QUÉ PASA CON CADA EMPLEADO?                             */}
      {/* ===================================================================== */}
      <div className="bg-[#16191F] border border-slate-800 rounded-xl overflow-hidden">
        {/* Matrix Header & Actions */}
        <div className="p-4 border-b border-slate-800 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-sm font-bold text-white">
              Esquema Completo por Empleado ({filteredItems.length} de {stats.total})
            </h3>
            {schedule?.resumenOperativo && (
              <span className="text-xs text-slate-400">
                · {schedule.resumenOperativo}
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search input */}
            <div className="relative min-w-[220px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar empleado, máquina, obra o tarea..."
                className="w-full bg-[#111318] border border-slate-700/80 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#F0C800]"
              />
            </div>

            {/* Copy for WhatsApp */}
            <button
              onClick={() => {
                if (!whatsappSummaryText) return;
                navigator.clipboard.writeText(whatsappSummaryText);
                notify('Esquema del día copiado listo para pegar en WhatsApp.', 'success');
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap shrink-0"
            >
              <Copy className="w-3.5 h-3.5 text-amber-400" />
              <span>Copiar Parte WhatsApp</span>
            </button>

            {/* Sync to Dispatch Board */}
            {onSaveDispatchBoard && dispatchBoardState && (
              <button
                onClick={handleSyncToDispatchBoard}
                disabled={isSyncingBoard || isLoadingSchedule}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-800/60 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {isSyncingBoard ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <LayoutGrid className="w-3.5 h-3.5" />
                )}
                <span>Volcar a Pizarra Ubicación</span>
              </button>
            )}

            {/* Pre-create Partes Diarios */}
            {onCreatePartesBatch && (
              <button
                onClick={handleGeneratePartesDiarios}
                disabled={isCreatingPartes || isLoadingSchedule}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {isCreatingPartes ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <FileText className="w-3.5 h-3.5" />
                )}
                <span>Pre-crear Partes Diarios</span>
              </button>
            )}
          </div>
        </div>

        {/* Error or Loading State */}
        {scheduleError ? (
          <div className="p-8 text-center space-y-2">
            <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
            <p className="text-sm font-bold text-rose-300">{scheduleError}</p>
            <button
              onClick={() => fetchDailySchedule(selectedDate)}
              className="px-4 py-2 rounded-lg bg-slate-800 text-xs font-semibold text-white hover:bg-slate-700 transition cursor-pointer"
            >
              Reintentar conexión con Supabase
            </button>
          </div>
        ) : isLoadingSchedule ? (
          <div className="p-10 text-center space-y-2">
            <Loader2 className="w-7 h-7 text-[#F0C800] animate-spin mx-auto" />
            <p className="text-xs text-slate-400">
              Recuperando esquema de empleados y equipos desde Supabase PostgreSQL...
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#111318] border-b border-slate-800 text-[11px] font-semibold text-slate-400">
                  <th className="py-2.5 px-3">Empleado / Chofer</th>
                  <th className="py-2.5 px-3">Estado Hoy</th>
                  <th className="py-2.5 px-3">Máquina / Equipo Asignado</th>
                  <th className="py-2.5 px-3">Obra / Lugar de Destino</th>
                  <th className="py-2.5 px-3">Horario</th>
                  <th className="py-2.5 px-3">Tarea / Instrucción del Día</th>
                  <th className="py-2.5 px-3 text-right">Origen / Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/70 text-xs">
                {filteredItems.map((item) => {
                  const statusMeta =
                    STATUS_OPTIONS.find((s) => s.value === item.estado) || STATUS_OPTIONS[4];
                  const isUnassigned = item.estado === 'DISPONIBLE';
                  const duplicateVehicleUsers =
                    item.vehicleId && (vehicleAssignmentCountMap.get(item.vehicleId)?.length || 0) > 1
                      ? vehicleAssignmentCountMap
                          .get(item.vehicleId)
                          ?.filter((n) => n !== item.employeeName)
                      : null;

                  return (
                    <tr
                      key={item.id}
                      className={`transition-colors ${
                        isUnassigned
                          ? 'bg-amber-950/10 hover:bg-amber-950/20'
                          : 'hover:bg-slate-800/40'
                      }`}
                    >
                      {/* 1. Empleado + Historial de Movimientos ("Se fue" / Traslados / Roturas) */}
                      <td className="py-2.5 px-3 align-middle min-w-[210px]">
                        <div className="font-bold text-white">{item.employeeName}</div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                          {item.employeeCode && (
                            <span className="font-mono tabular-nums">Leg. {item.employeeCode}</span>
                          )}
                          {item.origenAsignacion === 'AUDIO_WHATSAPP' && (
                            <span className="text-emerald-400">· Audio WhatsApp</span>
                          )}
                          {item.origenAsignacion === 'AUDIO_WEB' && (
                            <span className="text-amber-300">· Audio Web</span>
                          )}
                        </div>
                        {item.historialMovimientos && item.historialMovimientos.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            {item.historialMovimientos
                              .filter((m) => m.tipo === 'SE_FUE_TRASLADO' || m.tipo === 'SALIDA' || m.tipo === 'ROTURA')
                              .slice(-2)
                              .map((mov) => (
                                <div
                                  key={mov.id}
                                  className={`text-[10px] leading-tight ${
                                    mov.tipo === 'ROTURA'
                                      ? 'text-orange-300 font-medium'
                                      : 'text-amber-300/90'
                                  }`}
                                >
                                  <span className="font-mono tabular-nums">{mov.hora}</span> · {mov.detalle}
                                </div>
                              ))}
                          </div>
                        )}
                      </td>

                      {/* 2. Estado Hoy */}
                      <td className="py-2.5 px-3 align-middle">
                        <select
                          value={item.estado}
                          onChange={(e) =>
                            handleUpdateItemField(item.id, {
                              estado: e.target.value as DailyScheduleEmployeeStatus,
                              origenAsignacion: 'MANUAL',
                            })
                          }
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border focus:outline-none cursor-pointer ${statusMeta.bgClass} ${statusMeta.textClass} ${statusMeta.borderClass}`}
                        >
                          {STATUS_OPTIONS.map((opt) => (
                            <option
                              key={opt.value}
                              value={opt.value}
                              className="bg-[#16191F] text-white"
                            >
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* 3. Máquina / Equipo */}
                      <td className="py-2.5 px-3 align-middle min-w-[220px]">
                        <select
                          value={item.vehicleId || ''}
                          onChange={(e) => handleVehicleChangeForRow(item, e.target.value)}
                          className="w-full bg-[#111318] border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#F0C800]"
                        >
                          <option value="">— Sin máquina / A pie —</option>
                          {fleet.map((v) => {
                            const vId = String(v.id || v.codigoInterno || '');
                            const code = v.codigoInterno || v.codigoEquipo || v.patente || '';
                            return (
                              <option key={vId} value={vId}>
                                {code ? `[${code}] ` : ''}
                                {v.modeloMarca}
                                {v.patente ? ` (${v.patente})` : ''}
                              </option>
                            );
                          })}
                        </select>
                        {duplicateVehicleUsers && duplicateVehicleUsers.length > 0 && (
                          <div className="mt-1 text-[10px] text-amber-300">
                            También asignada a: {duplicateVehicleUsers.join(', ')}
                          </div>
                        )}
                      </td>

                      {/* 4. Obra / Destino */}
                      <td className="py-2.5 px-3 align-middle min-w-[220px]">
                        <div className="flex flex-col gap-1">
                          <select
                            value={
                              item.obraId
                                ? item.obraId
                                : item.obraName === 'Taller / Mantenimiento'
                                ? '__TALLER__'
                                : item.obraName === 'Base Central / Playón'
                                ? '__BASE__'
                                : ''
                            }
                            onChange={(e) => handleObraChangeForRow(item, e.target.value)}
                            className="w-full bg-[#111318] border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#F0C800]"
                          >
                            <option value="">— Seleccionar Obra o Lugar —</option>
                            <option value="__TALLER__">🔧 Taller / Mantenimiento</option>
                            <option value="__BASE__">🏭 Base Central / Playón</option>
                            {obras.map((o) => {
                              const oId = String(o.id || o.numero || '');
                              const clientLabel = o.clienteNombre || o.pertenece || '';
                              return (
                                <option key={oId} value={oId}>
                                  {o.nombreObra}
                                  {clientLabel ? ` · ${clientLabel}` : ''}
                                </option>
                              );
                            })}
                          </select>
                          {!item.obraId &&
                            item.obraName &&
                            item.obraName !== 'Taller / Mantenimiento' &&
                            item.obraName !== 'Base Central / Playón' && (
                              <input
                                type="text"
                                value={item.obraName}
                                onChange={(e) =>
                                  handleUpdateItemField(item.id, { obraName: e.target.value })
                                }
                                placeholder="Destino personalizado..."
                                className="bg-[#111318] border border-amber-700/60 rounded px-2 py-1 text-[11px] text-amber-200 focus:outline-none"
                              />
                            )}
                        </div>
                      </td>

                      {/* 5. Horario */}
                      <td className="py-2.5 px-3 align-middle w-32">
                        <input
                          type="text"
                          defaultValue={item.horario || '08:00 a 18:00'}
                          key={`hor-${item.id}-${item.updatedAt}`}
                          onBlur={(e) => {
                            if (e.target.value !== (item.horario || '08:00 a 18:00')) {
                              handleUpdateItemField(item.id, { horario: e.target.value });
                            }
                          }}
                          className="w-full bg-[#111318] border border-slate-700/80 rounded-lg px-2 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-[#F0C800] tabular-nums"
                        />
                      </td>

                      {/* 6. Tarea / Rotura / Observaciones */}
                      <td className="py-2.5 px-3 align-middle min-w-[240px]">
                        <div className="space-y-1">
                          <input
                            type="text"
                            defaultValue={item.tarea || ''}
                            key={`tar-${item.id}-${item.updatedAt}`}
                            placeholder="Escribí tarea o instrucción..."
                            onBlur={(e) => {
                              if (e.target.value !== (item.tarea || '')) {
                                handleUpdateItemField(item.id, { tarea: e.target.value });
                              }
                            }}
                            className="w-full bg-[#111318] border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#F0C800]"
                          />
                          {(item.estado === 'ROTURA_AVERIA' || item.roturaDetalle) && (
                            <div className="flex items-center gap-1.5 bg-orange-950/60 border border-orange-500/50 rounded px-2 py-1">
                              <Wrench className="w-3 h-3 text-orange-300 shrink-0" />
                              <input
                                type="text"
                                defaultValue={item.roturaDetalle || ''}
                                key={`rot-${item.id}-${item.updatedAt}`}
                                placeholder="Detalle de rotura / falla..."
                                onBlur={(e) => {
                                  if (e.target.value !== (item.roturaDetalle || '')) {
                                    handleUpdateItemField(item.id, { roturaDetalle: e.target.value });
                                  }
                                }}
                                className="w-full bg-transparent text-[11px] text-orange-200 placeholder-orange-400/60 focus:outline-none"
                              />
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 7. Acciones de Fila */}
                      <td className="py-2.5 px-3 align-middle text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          {savingRowId === item.id && (
                            <Loader2 className="w-3.5 h-3.5 text-[#F0C800] animate-spin" />
                          )}
                          {item.parteDiarioId && (
                            <span
                              className="text-[11px] text-emerald-400 font-medium"
                              title="Parte Diario pre-creado en Supabase"
                            >
                              Parte OK
                            </span>
                          )}
                          <button
                            onClick={() => {
                              const msg = `Hola ${item.employeeName}, tu programación del día (${selectedDate}):\n• Estado: ${statusMeta.label}\n${
                                item.vehicleName || item.vehicleCode
                                  ? `• Equipo: ${[item.vehicleCode, item.vehicleName].filter(Boolean).join(' - ')}\n`
                                  : ''
                              }${item.obraName ? `• Destino: ${item.obraName}\n` : ''}${
                                item.horario ? `• Horario: ${item.horario}\n` : ''
                              }${item.tarea ? `• Tarea: ${item.tarea}` : ''}`;
                              navigator.clipboard.writeText(msg);
                              notify(`Orden individual de ${item.employeeName} copiada.`, 'info');
                            }}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
                            title="Copiar orden individual para mandar al empleado"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* MODAL: VINCULACIÓN Y CONFIGURACIÓN DE WHATSAPP BAILEYS                */}
      {/* ===================================================================== */}
      {isBaileysModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#16191F] border border-slate-700 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <h3 className="text-base font-bold text-white">
                  Conexión WhatsApp con Baileys · Recepción Automática de Audios
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Vinculá el número receptor. Cuando mandes un audio de WhatsApp a ese número, Baileys lo lee, Gemini lo transcribe y arma la tabla de empleados y máquinas en Supabase.
                </p>
              </div>
              <button
                onClick={() => setIsBaileysModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Connection Status & QR Code Box */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center bg-[#111318] border border-slate-800 rounded-xl p-4">
              <div className="space-y-3">
                <div className="text-xs text-slate-400">
                  Estado actual:{' '}
                  <span
                    className={`font-bold ${
                      baileysStatus?.state === 'CONNECTED'
                        ? 'text-emerald-400'
                        : baileysStatus?.state === 'QR_READY'
                        ? 'text-amber-300'
                        : 'text-slate-300'
                    }`}
                  >
                    {baileysStatus?.state === 'CONNECTED'
                      ? `CONECTADO (+${baileysStatus.connectedPhone || ''})`
                      : baileysStatus?.state === 'QR_READY'
                      ? 'LISTO PARA ESCANEAR QR'
                      : baileysStatus?.state === 'CONNECTING'
                      ? 'CONECTANDO...'
                      : 'DESCONECTADO'}
                  </span>
                </div>

                {baileysStatus?.connectedName && (
                  <div className="text-xs text-slate-300">
                    Cuenta vinculada: <span className="font-semibold text-white">{baileysStatus.connectedName}</span>
                  </div>
                )}

                {baileysStatus?.pairingCode && (
                  <div className="p-2.5 rounded-lg bg-amber-950/60 border border-amber-500/50">
                    <div className="text-[11px] text-amber-300">Código de Vinculación WhatsApp:</div>
                    <div className="text-lg font-mono font-bold text-white tracking-widest tabular-nums">
                      {baileysStatus.pairingCode}
                    </div>
                  </div>
                )}

                {baileysStatus?.lastError && (
                  <div className="text-xs text-rose-400">{baileysStatus.lastError}</div>
                )}

                <div className="space-y-2 pt-1">
                  <label className="block text-[11px] text-slate-400">
                    Opcional: Vincular por código numérico (ingresá teléfono con código de país, ej: 5493884123456)
                  </label>
                  <input
                    type="text"
                    value={pairingPhoneInput}
                    onChange={(e) => setPairingPhoneInput(e.target.value)}
                    placeholder="Ej: 5493884123456 (dejar vacío para usar QR)"
                    className="w-full bg-[#16191F] border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                  />
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  {baileysStatus?.state !== 'CONNECTED' ? (
                    <button
                      onClick={() => handleConnectBaileys(true)}
                      disabled={isBaileysBusy}
                      className="px-3.5 py-2 rounded-lg bg-[#F0C800] hover:bg-[#eab308] text-slate-950 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                    >
                      <QrCode className="w-4 h-4" />
                      <span>Generar QR / Vincular</span>
                    </button>
                  ) : (
                    <button
                      onClick={handleDisconnectBaileys}
                      disabled={isBaileysBusy}
                      className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition cursor-pointer disabled:opacity-50"
                    >
                      Cerrar Sesión WhatsApp
                    </button>
                  )}

                  <button
                    onClick={() => fetchBaileysStatus(false)}
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer"
                  >
                    Refrescar Estado
                  </button>
                </div>
              </div>

              {/* QR Display Box */}
              <div className="flex flex-col items-center justify-center p-3 bg-[#16191F] border border-slate-800 rounded-xl min-h-[220px]">
                {baileysStatus?.state === 'CONNECTED' ? (
                  <div className="text-center space-y-2 p-4">
                    <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
                    <div className="text-sm font-bold text-white">WhatsApp Vinculado</div>
                    <p className="text-xs text-slate-400">
                      Cualquier audio que mandes a este número desde los teléfonos autorizados armará automáticamente el esquema del día.
                    </p>
                  </div>
                ) : baileysStatus?.qrDataUrl ? (
                  <div className="text-center space-y-2">
                    <img
                      src={baileysStatus.qrDataUrl}
                      alt="Código QR WhatsApp Baileys"
                      referrerPolicy="no-referrer"
                      className="w-48 h-48 rounded-lg mx-auto border border-slate-700 bg-white p-1.5"
                    />
                    <p className="text-[11px] text-slate-400">
                      Abrí WhatsApp en el teléfono ➔ Dispositivos vinculados ➔ Vincular un dispositivo
                    </p>
                  </div>
                ) : (
                  <div className="text-center space-y-2 p-4">
                    <QrCode className="w-10 h-10 text-slate-600 mx-auto" />
                    <p className="text-xs text-slate-400">
                      Hacé clic en "Generar QR / Vincular" para mostrar el código QR en pantalla.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Authorized Senders & Rules (saved in Supabase system_settings) */}
            <div className="space-y-3 bg-[#111318] border border-slate-800 rounded-xl p-4">
              <h4 className="text-xs font-bold text-white">
                Reglas de Lectura de Audios (Persistidas en Supabase)
              </h4>

              <div>
                <label className="block text-xs text-slate-300 mb-1">
                  Números autorizados a mandar audios de programación (separados por coma, vacío = acepta del propio número o encargados)
                </label>
                <input
                  type="text"
                  value={authorizedPhonesInput}
                  onChange={(e) => {
                    isBaileysConfigDirtyRef.current = true;
                    setAuthorizedPhonesInput(e.target.value);
                  }}
                  placeholder="Ej: 5493884123456, 5493885987654"
                  className="w-full bg-[#16191F] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoProcessAudios}
                    onChange={(e) => {
                      isBaileysConfigDirtyRef.current = true;
                      setAutoProcessAudios(e.target.checked);
                    }}
                    className="rounded border-slate-600"
                  />
                  <span>Procesar audios entrantes automáticamente</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoReplySummary}
                    onChange={(e) => {
                      isBaileysConfigDirtyRef.current = true;
                      setAutoReplySummary(e.target.checked);
                    }}
                    className="rounded border-slate-600"
                  />
                  <span>Responder por WhatsApp con el esquema armado</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoProcessTexts}
                    onChange={(e) => {
                      isBaileysConfigDirtyRef.current = true;
                      setAutoProcessTexts(e.target.checked);
                    }}
                    className="rounded border-slate-600"
                  />
                  <span>Procesar también mensajes de texto directo</span>
                </label>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleSaveBaileysConfig}
                  disabled={isBaileysBusy}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition cursor-pointer disabled:opacity-50"
                >
                  Guardar Configuración en Supabase
                </button>
              </div>
            </div>

            {/* Direct WhatsApp Send of Today's Schedule */}
            {baileysStatus?.state === 'CONNECTED' && (
              <div className="space-y-2 bg-[#111318] border border-slate-800 rounded-xl p-4">
                <h4 className="text-xs font-bold text-white">
                  Enviar Esquema del Día ({selectedDate}) por WhatsApp Baileys
                </h4>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={targetPhoneForSend}
                    onChange={(e) => setTargetPhoneForSend(e.target.value)}
                    placeholder="Número destino (ej: 5493884123456)"
                    className="flex-1 bg-[#16191F] border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono"
                  />
                  <button
                    onClick={handleSendScheduleViaBaileys}
                    disabled={isSendingWhatsApp}
                    className="px-4 py-2 rounded-lg bg-[#F0C800] hover:bg-[#eab308] text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{isSendingWhatsApp ? 'Enviando...' : 'Enviar Parte por WhatsApp'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
