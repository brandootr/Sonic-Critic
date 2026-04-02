
import React, { useEffect, useRef } from 'react';

interface SpectrogramProps {
  audioBuffer: AudioBuffer | null;
}

const Spectrogram: React.FC<SpectrogramProps> = ({ audioBuffer }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!audioBuffer || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    
    const data = audioBuffer.getChannelData(0);
    const fftSize = 1024;
    const step = Math.floor(data.length / width);

    const imageData = ctx.createImageData(width, height);
    const pixels = imageData.data;

    // Pre-calculate color constants
    for (let x = 0; x < width; x++) {
      const sliceStart = x * step;
      if (sliceStart + fftSize > data.length) break;

      for (let y = 0; y < height; y++) {
        const freqIndex = Math.floor((y / height) * (fftSize / 2));
        // Direct access instead of slice()
        const amplitude = Math.abs(data[sliceStart + freqIndex]) * 255;
        
        const r = Math.min(255, amplitude * 2);
        const g = Math.min(255, amplitude * 1.2);
        const b = Math.min(255, amplitude * 4 + 50);

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
        <h3 className="text-lg font-semibold text-indigo-400">Audio Spectrogram</h3>
        <span className="text-xs text-slate-500 uppercase tracking-widest">Full Frequency Range</span>
      </div>
      <div className="relative overflow-hidden rounded-lg bg-black border border-slate-700">
        <canvas 
          ref={canvasRef} 
          width={1200} 
          height={300} 
          className="w-full h-auto block"
        />
        <div className="absolute top-0 left-0 h-full w-px bg-white/20 pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none" />
      </div>
      <div className="flex justify-between mt-2 text-[10px] text-slate-500 font-mono">
        <span>0:00</span>
        <span>Track Duration</span>
      </div>
    </div>
  );
};

export default Spectrogram;
