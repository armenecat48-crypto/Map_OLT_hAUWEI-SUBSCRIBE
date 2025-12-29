
import React, { useState, useEffect, useMemo } from 'react';
import { Search, MapPin, Cpu, Info, ShieldCheck, Zap, Activity, MessageSquare, Send, Loader2, AlertTriangle, Filter } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { GoogleGenAI } from "@google/genai";
import { OLTData, ProcessedOLT } from './types';

// Custom Marker Icon for HUAWEI OLT
const oltIcon = new L.Icon({
  iconUrl: 'https://cdn-icons-png.flaticon.com/512/3067/3067451.png',
  iconSize: [36, 36],
  iconAnchor: [18, 36],
  popupAnchor: [0, -36],
});

// Helper component to change map view
function ChangeView({ center, zoom }: { center: [number, number], zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

const App: React.FC = () => {
  const [data, setData] = useState<ProcessedOLT[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedOlt, setSelectedOlt] = useState<ProcessedOLT | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([13.7367, 100.5231]); // Default to Bangkok
  const [mapZoom, setMapZoom] = useState(6);
  const [aiResponse, setAiResponse] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiInput, setAiInput] = useState('');

  // Load and Filter Data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch('ipget_edit.json');
        
        if (!response.ok) {
          throw new Error(`Data file "ipget_edit.json" not found (Status: ${response.status}).`);
        }

        const text = await response.text();
        let raw: OLTData[] = [];
        
        try {
          raw = JSON.parse(text);
          if (!Array.isArray(raw)) raw = [raw as unknown as OLTData];
        } catch (e) {
          // Fallback for NDJSON
          raw = text.split(/\n/)
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .map(line => {
              try { return JSON.parse(line); } catch (err) { return null; }
            })
            .filter((item): item is OLTData => item !== null);
        }

        if (raw.length === 0) {
          throw new Error("The data file is empty or contains invalid format.");
        }

        // Filter: ONLY HUAWEI + MUST HAVE LAT/LONG
        const processed: ProcessedOLT[] = raw
          .filter(item => 
            item && 
            item.enterprise_name?.toUpperCase() === 'HUAWEI' && 
            item.DV_lat != null && 
            item.DV_long != null
          )
          .map((item, idx) => {
            let catIds: string[] = [];
            if (typeof item.cat_ids === 'string') {
              catIds = item.cat_ids.split(/[,;]/).map(id => id.trim()).filter(id => id);
            } else if (typeof item.cat_ids === 'number') {
              catIds = [item.cat_ids.toString()];
            }
            return {
              ...item,
              id: `${item.ip_address || 'node'}-${idx}`,
              catIdList: catIds
            };
          });
        
        setData(processed);
        
        if (processed.length > 0) {
          setMapCenter([processed[0].DV_lat!, processed[0].DV_long!]);
          setMapZoom(12);
        } else {
          setError("No HUAWEI OLT records found with valid coordinates.");
        }
      } catch (err: any) {
        console.error("Fetch Error:", err);
        setError(err.message || "Failed to load OLT infrastructure data.");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const filteredData = useMemo(() => {
    const term = searchTerm.toLowerCase();
    if (!term) return data;
    return data.filter(olt => 
      olt.catIdList.some(id => id.toLowerCase().includes(term)) ||
      olt.site_name?.toLowerCase().includes(term) ||
      olt.ip_address?.toLowerCase().includes(term)
    );
  }, [data, searchTerm]);

  const handleSelectOlt = (olt: ProcessedOLT) => {
    setSelectedOlt(olt);
    if (olt.DV_lat != null && olt.DV_long != null) {
      setMapCenter([olt.DV_lat, olt.DV_long]);
      setMapZoom(16);
    }
  };

  const askGemini = async () => {
    if (!aiInput.trim()) return;
    setIsAiLoading(true);
    setAiResponse('');
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      const stats = {
        totalNodes: data.length,
        totalPonUp: data.reduce((acc, curr) => acc + (curr.pon_up || 0), 0),
        locations: data.map(d => d.site_name).slice(0, 5)
      };

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: aiInput,
        config: {
          systemInstruction: `You are a Network Operations Specialist. 
          Current HUAWEI OLT Stats: ${JSON.stringify(stats)}.
          User is looking at an interactive map. Keep answers technical and data-driven.`
        }
      });

      setAiResponse(response.text || 'Insight generation completed.');
    } catch (error) {
      setAiResponse("AI Assistant currently unavailable. Check your API configuration.");
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-slate-950 font-sans text-slate-200 overflow-hidden">
      {/* Search & Navigation Sidebar */}
      <aside className="w-[400px] flex flex-col border-r border-slate-800 bg-slate-900 shadow-2xl z-[1000]">
        <div className="p-6 border-b border-slate-800 bg-gradient-to-br from-indigo-950/40 to-slate-900">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2.5 bg-indigo-600 rounded-2xl shadow-xl shadow-indigo-500/20">
              <Activity className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-white uppercase leading-none">
                OLT Explorer
              </h1>
              <span className="text-[10px] font-bold text-indigo-400 tracking-widest uppercase">
                HUAWEI Infrastructure
              </span>
            </div>
          </div>
          
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
            <input
              type="text"
              placeholder="Search CAT ID, Site Name, IP..."
              className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl py-3.5 pl-12 pr-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all placeholder:text-slate-600 backdrop-blur-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* Results List Area */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-24 text-slate-600">
              <Loader2 className="w-10 h-10 animate-spin mb-4 text-indigo-500/50" />
              <p className="text-xs font-bold uppercase tracking-widest">Scanning Network...</p>
            </div>
          ) : error ? (
            <div className="p-8 bg-red-950/10 border border-red-900/30 rounded-3xl text-center">
              <AlertTriangle className="w-12 h-12 text-red-500/80 mx-auto mb-4" />
              <h3 className="text-red-400 font-bold mb-2">System Error</h3>
              <p className="text-xs text-red-300/60 leading-relaxed mb-6">{error}</p>
              <button 
                onClick={() => window.location.reload()}
                className="px-6 py-2 bg-red-900/40 hover:bg-red-900/60 text-red-200 text-[10px] font-bold uppercase tracking-widest rounded-full transition-all"
              >
                Retry Connection
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 px-3 mb-2">
                <Filter className="w-3 h-3 text-slate-500" />
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                  {filteredData.length} HUAWEI Nodes Active
                </span>
              </div>
              
              {filteredData.map((olt) => (
                <button
                  key={olt.id}
                  onClick={() => handleSelectOlt(olt)}
                  className={`w-full text-left p-5 rounded-3xl border transition-all duration-300 group relative overflow-hidden ${
                    selectedOlt?.id === olt.id 
                    ? 'bg-indigo-600 border-indigo-500 shadow-2xl shadow-indigo-500/20' 
                    : 'bg-slate-800/40 border-slate-700 hover:border-slate-500 hover:bg-slate-800/80'
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <h3 className={`font-bold text-sm truncate max-w-[200px] ${selectedOlt?.id === olt.id ? 'text-white' : 'text-slate-100'}`}>
                      {olt.site_name || 'Generic Site'}
                    </h3>
                    <div className="px-2 py-0.5 rounded-full bg-slate-900/50 border border-slate-700/50 text-[9px] font-black text-slate-400 uppercase tracking-tighter">
                      Huawei
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-center gap-2 text-[11px]">
                      <ShieldCheck className={`w-3.5 h-3.5 ${selectedOlt?.id === olt.id ? 'text-indigo-200' : 'text-emerald-500'}`} />
                      <span className={`font-mono font-bold ${selectedOlt?.id === olt.id ? 'text-indigo-50' : 'text-slate-400'}`}>
                        {olt.ip_address}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px]">
                      <Zap className={`w-3.5 h-3.5 ${selectedOlt?.id === olt.id ? 'text-indigo-200' : 'text-amber-500'}`} />
                      <span className={selectedOlt?.id === olt.id ? 'text-indigo-50' : 'text-slate-400'}>
                        PON Up: <b>{olt.pon_up}</b>
                      </span>
                    </div>
                  </div>
                </button>
              ))}
              
              {filteredData.length === 0 && (
                <div className="text-center py-16 opacity-40">
                  <Search className="w-12 h-12 mx-auto mb-4 text-slate-700" />
                  <p className="text-xs font-bold uppercase tracking-widest">No matching OLT found</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* AI Insight Bar */}
        <div className="p-6 border-t border-slate-800 bg-slate-900/95 backdrop-blur-xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-indigo-400">
              <MessageSquare className="w-4 h-4" />
              <span className="text-[10px] font-black uppercase tracking-[0.2em]">Network AI</span>
            </div>
            {isAiLoading && <Loader2 className="w-3 h-3 animate-spin text-indigo-500" />}
          </div>
          
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 mb-4 h-24 overflow-y-auto text-[11px] text-slate-400 leading-relaxed scroll-smooth">
            {aiResponse || "Analyzing network topology... ask me about capacity or distribution."}
          </div>
          
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Ask Network AI..."
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && askGemini()}
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
            <button 
              onClick={askGemini}
              disabled={isAiLoading || !aiInput.trim()}
              className="p-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed text-white shadow-lg shadow-indigo-600/20"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Map Explorer Canvas */}
      <main className="flex-1 relative">
        <MapContainer 
          center={mapCenter} 
          zoom={mapZoom} 
          className="h-full w-full"
          zoomControl={false}
        >
          <ChangeView center={mapCenter} zoom={mapZoom} />
          <TileLayer
            attribution='&copy; CARTO'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />
          
          {filteredData.map((olt) => (
            <Marker 
              key={olt.id} 
              position={[olt.DV_lat!, olt.DV_long!]} 
              icon={oltIcon}
              eventHandlers={{
                click: () => handleSelectOlt(olt)
              }}
            >
              <Popup className="custom-popup" closeButton={false}>
                <div className="p-3 min-w-[240px] font-sans">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse shadow-sm shadow-emerald-500/50"></div>
                    <h3 className="font-black text-slate-800 text-sm tracking-tight">{olt.site_name}</h3>
                  </div>
                  
                  <div className="space-y-2 text-[11px] text-slate-600">
                    <div className="flex justify-between border-b border-slate-100 pb-1.5">
                      <span className="font-bold text-slate-400 uppercase text-[9px]">IP Address</span>
                      <span className="font-mono font-black text-indigo-600">{olt.ip_address}</span>
                    </div>
                    <div className="flex justify-between border-b border-slate-100 pb-1.5">
                      <span className="font-bold text-slate-400 uppercase text-[9px]">PON Utilization</span>
                      <span className="font-black">{olt.pon_up} / {olt.pon_port}</span>
                    </div>
                    
                    <div className="mt-3">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5">CAT OFFICE IDs</p>
                      <div className="flex flex-wrap gap-1">
                        {olt.catIdList.length > 0 ? (
                          olt.catIdList.map((id, i) => (
                            <span key={i} className="text-[10px] font-bold bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-lg border border-indigo-100">
                              {id}
                            </span>
                          ))
                        ) : (
                          <span className="italic opacity-50">N/A</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        {/* Global Dashboard Overlay */}
        <div className="absolute top-8 left-1/2 -translate-x-1/2 flex gap-4 z-[1001] pointer-events-none">
          <div className="bg-slate-900/70 backdrop-blur-2xl border border-white/5 rounded-[40px] px-8 py-5 shadow-2xl flex items-center gap-12 pointer-events-auto ring-1 ring-white/10">
            <div className="text-center">
              <span className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Infrastructure</span>
              <span className="text-3xl font-black text-white">{data.length}</span>
            </div>
            <div className="w-px h-10 bg-slate-700/50"></div>
            <div className="text-center">
              <span className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Aggregated PON</span>
              <span className="text-3xl font-black text-emerald-400">
                {data.reduce((acc, curr) => acc + (curr.pon_up || 0), 0)}
              </span>
            </div>
            <div className="w-px h-10 bg-slate-700/50"></div>
            <div className="text-center">
              <span className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Average Power</span>
              <span className="text-3xl font-black text-amber-400">
                {(data.reduce((acc, curr) => acc + (curr.power_consumption_watts || 0), 0) / (data.length || 1)).toFixed(0)}W
              </span>
            </div>
          </div>
        </div>

        {/* Dynamic Detail Panel */}
        {selectedOlt && (
          <div className="absolute bottom-8 right-8 w-96 z-[1001] animate-in fade-in slide-in-from-bottom-12">
            <div className="bg-slate-900/90 backdrop-blur-3xl border border-white/10 rounded-[40px] p-8 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.8)] overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -mr-16 -mt-16"></div>
              
              <div className="flex items-center justify-between mb-8">
                <div className="px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-[10px] font-black text-indigo-400 uppercase tracking-widest">
                  Active Node
                </div>
                <button 
                  onClick={() => setSelectedOlt(null)}
                  className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-all shadow-xl"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <h2 className="text-2xl font-black mb-1 text-white tracking-tight">{selectedOlt.site_name}</h2>
              <p className="text-indigo-400 font-mono text-sm font-bold mb-8 flex items-center gap-2">
                <span className="w-2 h-2 bg-indigo-500 rounded-full shadow-lg shadow-indigo-500/50"></span>
                {selectedOlt.ip_address}
              </p>
              
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-slate-950/40 p-5 rounded-3xl border border-white/5 group hover:border-emerald-500/30 transition-colors">
                  <div className="text-slate-500 text-[10px] uppercase font-black mb-2 tracking-widest">PON Active</div>
                  <div className="text-2xl font-black text-emerald-400">{selectedOlt.pon_up}</div>
                  <div className="text-[10px] text-slate-600 font-bold">of {selectedOlt.pon_port} total</div>
                </div>
                <div className="bg-slate-950/40 p-5 rounded-3xl border border-white/5 group hover:border-indigo-500/30 transition-colors">
                  <div className="text-slate-500 text-[10px] uppercase font-black mb-2 tracking-widest">Power Load</div>
                  <div className="text-2xl font-black text-slate-100">{selectedOlt.power_consumption_watts}<span className="text-xs ml-0.5">W</span></div>
                  <div className="text-[10px] text-slate-600 font-bold uppercase tracking-tighter">{selectedOlt.equ_type_name}</div>
                </div>
              </div>
              
              <div className="space-y-4 pt-6 border-t border-white/5">
                <div className="flex items-start gap-4 text-[11px] text-slate-400">
                  <div className="mt-1 p-1 bg-indigo-500/10 rounded-lg text-indigo-400">
                    <Cpu className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="block font-black text-slate-600 uppercase text-[9px] mb-0.5">Platform Base</span>
                    <span className="font-bold text-slate-200">{selectedOlt.platform_chassis}</span>
                  </div>
                </div>
                <div className="flex items-start gap-4 text-[11px] text-slate-400">
                  <div className="mt-1 p-1 bg-emerald-500/10 rounded-lg text-emerald-400">
                    <MapPin className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="block font-black text-slate-600 uppercase text-[9px] mb-0.5">Control Center</span>
                    <span className="font-bold text-slate-200">{selectedOlt.cat_office_name}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
