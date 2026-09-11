
import React, { useEffect, useRef, useState } from 'react';
import Meyda from 'meyda';
import { analyzeAudioMetrics, AudioMetrics } from '../services/audioAnalyzer';

interface SpectrogramProps {
  audioBuffer: AudioBuffer | null;
  onMetricsAnalyzed?: (metrics: AudioMetrics) => void;
}

const Spectrogram: React.FC<SpectrogramProps> = ({ audioBuffer, onMetricsAnalyzed }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [metrics, setMetrics] = useState<AudioMetrics | null>(null);

  useEffect(() => {
    if (!audioBuffer) return;

    // Run deep analysis
    analyzeAudioMetrics(audioBuffer).then(m => {
      setMetrics(m);
      if (onMetricsAnalyzed) onMetricsAnalyzed(m);
    });

    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    
    // Compute Spectrogram visually
    const data = audioBuffer.getChannelData(0);
    const bufferSize = 1024;
    Meyda.bufferSize = bufferSize;
    
    const step = Math.floor(data.length / width);
    const imageData = ctx.createImageData(width, height);
    const pixels = imageData.data;

    for (let x = 0; x < width; x++) {
      const sliceStart = x * step;
      if (sliceStart + bufferSize > data.length) break;

      const chunk = data.slice(sliceStart, sliceStart + bufferSize);
      
      // Zero pad if needed
      let validChunk = chunk;
      if (chunk.length < bufferSize) {
        validChunk = new Float32Array(bufferSize);
        validChunk.set(chunk);
      }
      
      const features = Meyda.extract('amplitudeSpectrum', validChunk);
      const spectrum = features as unknown as Float32Array;

      if (!spectrum) continue;

      for (let y = 0; y < height; y++) {
        // Map y to a logarithmic or linear frequency bin
        // For visual clarity, standard linear mapping
        const freqIndex = Math.floor((y / height) * (spectrum.length / 2)); 
        const amplitude = spectrum[freqIndex] * 10; // scale up for visibility
        
        const r = Math.min(255, amplitude * 255);
        const g = Math.min(255, (amplitude * 0.8) * 255);
        const b = Math.min(255, (amplitude * 4 + 0.2) * 255);

        const pixelIndex = ((height - 1 - y) * width + x) * 4;
        pixels[pixelIndex] = r;
        pixels[pixelIndex + 1] = g;
        pixels[pixelIndex + 2] = b;
        pixels[pixelIndex + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);

  }, [audioBuffer]);

  return (
    <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 shadow-2xl">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-indigo-400">Audio Analysis & Spectrogram</h3>
        <span className="text-xs text-slate-500 uppercase tracking-widest">Full Frequency Range</span>
      </div>
      
      <div className="relative overflow-hidden rounded-lg bg-black border border-slate-700 mb-4">
        <canvas 
          ref={canvasRef} 
          width={800} 
          height={200} 
          className="w-full h-auto block"
        />
        <div className="absolute top-0 left-0 h-full w-px bg-white/20 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
      </div>
      
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
          <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-700">
            <div className="text-slate-500 mb-1">Max Peak</div>
            <div className={`font-bold ${metrics.maxPeakDb > -0.3 ? 'text-red-400' : 'text-emerald-400'}`}>
              {metrics.maxPeakDb.toFixed(1)} dB
            </div>
          </div>
          <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-700">
            <div className="text-slate-500 mb-1">RMS Avg</div>
            <div className="text-slate-200 font-bold">{metrics.rmsDb.toFixed(1)} dB</div>
          </div>
          <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-700">
            <div className="text-slate-500 mb-1">Crest Factor</div>
            <div className="text-slate-200 font-bold">{metrics.crestFactor.toFixed(1)} dB</div>
          </div>
          <div className="bg-slate-800/50 p-2 rounded-lg border border-slate-700">
            <div className="text-slate-500 mb-1">Stereo Correlation</div>
            <div className={`font-bold ${metrics.stereoCorrelation && metrics.stereoCorrelation < 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {metrics.stereoCorrelation ? metrics.stereoCorrelation.toFixed(2) : 'N/A'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Spectrogram;
