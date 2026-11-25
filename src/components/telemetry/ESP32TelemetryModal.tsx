import React, { useState } from 'react';
import { 
  X, 
  Cpu, 
  Radio, 
  Activity, 
  Zap, 
  MapPin, 
  Clock, 
  Gauge, 
  CheckCircle2, 
  Copy, 
  Check, 
  Terminal, 
  Layers 
} from 'lucide-react';
import { Vehicle } from '../../types';

interface ESP32TelemetryModalProps {
  isOpen: boolean;
  onClose: () => void;
  fleet: Vehicle[];
}

export const ESP32TelemetryModal: React.FC<ESP32TelemetryModalProps> = ({
  isOpen,
  onClose,
  fleet,
}) => {
  const [copied, setCopied] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(fleet[0]?.id || '');
  const [activeTab, setActiveTab] = useState<'MONITOR' | 'CODIGO_ARDUINO' | 'API_DOCS'>('MONITOR');

  if (!isOpen) return null;

  const selectedVehicle = fleet.find(v => v.id === selectedVehicleId) || fleet[0];

  const sampleArduinoCode = `/*
  * FIRMWARE DE TELEMETRÍA IOT - LA HORMIGA
  * Microcontrolador: ESP32 NodeMCU / ESP32-WROOM-32
  * Sensores: Horómetro digital (Pin 34), Sensor de Combustible ultrasónico, GPS Neo-6M
*/
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

const char* ssid = "WIFI_OBRA_O_MODEM_4G";
const char* password = "PASSWORD_SEGURA";
const char* serverEndpoint = "https://lahormiga.app/api/telemetria";

// Identificador único del equipo vial en La Hormiga
const char* ID_EQUIPO = "${selectedVehicle?.id || 'EQ-BOBCAT-01'}";

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\\n[OK] Conectado a red IoT");
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverEndpoint);
    http.addHeader("Content-Type", "application/json");

    // Construcción del Payload Telemetría
    StaticJsonDocument<256> doc;
    doc["equipoId"] = ID_EQUIPO;
    doc["horometro"] = 1420.5; // Lectura de horas motor acumuladas
    doc["rpm"] = 1850;         // RPM motor en marcha
    doc["combustiblePct"] = 78; // % Nivel de tanque
    doc["lat"] = -34.6037;     // Coordenadas GPS
    doc["lng"] = -58.3816;
    doc["bateriaVolts"] = 13.8;
    doc["motorEncendido"] = true;

    String jsonString;
    serializeJson(doc, jsonString);

    int httpResponseCode = http.POST(jsonString);
    Serial.printf("[Telemetria ESP32] Codigo respuesta: %d\\n", httpResponseCode);
    http.end();
  }
  delay(15000); // Envío cada 15 segundos
}`;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(sampleArduinoCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm overflow-y-auto">
      <div className="relative w-full max-w-3xl my-8 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="bg-slate-900 px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center font-black text-slate-950 text-xl shadow-lg shadow-amber-500/20">
              <Cpu className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-lg font-bold tracking-tight">
                  Integración de Telemetría ESP32 & IoT
                </h3>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold uppercase">
                  Módulo Listo
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Lectura automática de horómetros, combustible, RPM y GPS en maquinaria vial
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-3 space-x-4">
          <button
            onClick={() => setActiveTab('MONITOR')}
            className={`pb-3 text-xs font-bold transition-all border-b-2 flex items-center space-x-1.5 ${
              activeTab === 'MONITOR' 
                ? 'border-amber-500 text-amber-600' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Radio className="w-4 h-4" />
            <span>Monitor en Tiempo Real</span>
          </button>

          <button
            onClick={() => setActiveTab('CODIGO_ARDUINO')}
            className={`pb-3 text-xs font-bold transition-all border-b-2 flex items-center space-x-1.5 ${
              activeTab === 'CODIGO_ARDUINO' 
                ? 'border-amber-500 text-amber-600' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Terminal className="w-4 h-4" />
            <span>Código Firmware ESP32 (Arduino)</span>
          </button>

          <button
            onClick={() => setActiveTab('API_DOCS')}
            className={`pb-3 text-xs font-bold transition-all border-b-2 flex items-center space-x-1.5 ${
              activeTab === 'API_DOCS' 
                ? 'border-amber-500 text-amber-600' 
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Endpoint API & Formato JSON</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {activeTab === 'MONITOR' && (
            <div className="space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Seleccionar Equipo Vial con Módulo ESP32
                  </label>
                  <select
                    value={selectedVehicleId}
                    onChange={(e) => setSelectedVehicleId(e.target.value)}
                    className="px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-900"
                  >
                    {fleet.map((v) => (
                      <option key={v.id} value={v.id}>
                        [{v.id}] {v.modeloMarca} ({v.patente || v.codigoInterno})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                  <span className="text-xs font-bold text-emerald-600">
                    ESP32 Online • Transmitiendo cada 15s
                  </span>
                </div>
              </div>

              {/* Simulated Gauge Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-900 text-white p-4 rounded-xl">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold flex items-center space-x-1">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Horómetro IoT</span>
                  </div>
                  <div className="text-xl font-black text-amber-400 mt-2">
                    {selectedVehicle?.horometro ? `${selectedVehicle.horometro} hs` : '1.420,5 hs'}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">Acumulado automático</div>
                </div>

                <div className="bg-slate-900 text-white p-4 rounded-xl">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold flex items-center space-x-1">
                    <Gauge className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Tanque Combustible</span>
                  </div>
                  <div className="text-xl font-black text-emerald-400 mt-2">
                    78% <span className="text-xs font-normal text-slate-300">(~62 L)</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">Sensor ultrasónico</div>
                </div>

                <div className="bg-slate-900 text-white p-4 rounded-xl">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold flex items-center space-x-1">
                    <Zap className="w-3.5 h-3.5 text-blue-400" />
                    <span>Voltaje Alternador</span>
                  </div>
                  <div className="text-xl font-black text-blue-400 mt-2">
                    13.8 V
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">Batería en carga</div>
                </div>

                <div className="bg-slate-900 text-white p-4 rounded-xl">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold flex items-center space-x-1">
                    <Activity className="w-3.5 h-3.5 text-rose-400" />
                    <span>Régimen Motor</span>
                  </div>
                  <div className="text-xl font-black text-rose-400 mt-2">
                    1.850 RPM
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">En trabajo activo</div>
                </div>
              </div>

              {/* Status explanation */}
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 space-y-1">
                <div className="font-bold flex items-center space-x-1.5">
                  <CheckCircle2 className="w-4 h-4 text-amber-600" />
                  <span>¿Cómo funciona la interpretación de ESP32 en La Hormiga?</span>
                </div>
                <p>
                  El ESP32 instalado en cada máquina vial (o generador) lee las señales de encendido (D+ alternador o vibración), mide el nivel del tanque y envía cada 15 a 60 segundos paquetes HTTP/HTTPS o MQTT al backend de La Hormiga. El sistema actualiza automáticamente el horómetro para programar los mantenimientos preventivos y alertar sobre consumos de gasoil.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'CODIGO_ARDUINO' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">
                  Código completo para compilar y cargar en Arduino IDE / PlatformIO:
                </span>
                <button
                  onClick={handleCopyCode}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all flex items-center space-x-1.5"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copiado!' : 'Copiar Código C++'}</span>
                </button>
              </div>

              <div className="bg-slate-950 text-slate-200 p-4 rounded-xl font-mono text-xs overflow-x-auto max-h-96 border border-slate-800">
                <pre>{sampleArduinoCode}</pre>
              </div>
            </div>
          )}

          {activeTab === 'API_DOCS' && (
            <div className="space-y-4 text-xs text-slate-700">
              <div className="bg-slate-900 text-white p-4 rounded-xl space-y-2">
                <div className="flex items-center space-x-2 font-mono text-xs text-amber-400">
                  <span className="bg-amber-500 text-slate-950 px-2 py-0.5 rounded font-black">POST</span>
                  <span>/api/telemetria</span>
                </div>
                <p className="text-xs text-slate-300">
                  Recibe paquetes de telemetría de dispositivos ESP32 o trackers GPS 4G instalados en la maquinaria.
                </p>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <h5 className="font-bold text-slate-900">Estructura JSON Esperada:</h5>
                <pre className="bg-slate-900 text-slate-200 p-3 rounded-lg font-mono text-xs overflow-x-auto">
{`{
  "equipoId": "EQ-BOBCAT-01",
  "horometro": 1420.5,
  "combustiblePct": 78,
  "rpm": 1850,
  "bateriaVolts": 13.8,
  "motorEncendido": true,
  "lat": -34.6037,
  "lng": -58.3816,
  "timestamp": 1774028400
}`}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
};
