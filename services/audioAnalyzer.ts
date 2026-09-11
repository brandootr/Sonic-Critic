import Meyda from 'meyda';

export interface AudioMetrics {
  maxPeakDb: number;
  rmsDb: number;
  crestFactor: number;
  spectralCentroid: number;
  clippingCount: number;
  silencePercentage: number;
  lowMidHighBalance: {
    low: number; // 0-250 Hz
    mid: number; // 250-4000 Hz
    high: number; // 4000+ Hz
  };
  stereoCorrelation?: number;
}

export const analyzeAudioMetrics = async (audioBuffer: AudioBuffer): Promise<AudioMetrics> => {
  const channelDataL = audioBuffer.getChannelData(0);
  const channelDataR = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : channelDataL;
  const sampleRate = audioBuffer.sampleRate;
  
  let maxPeak = 0;
  let sumSquares = 0;
  let clippingCount = 0;
  let silenceCount = 0;
  
  // Calculate Peak, RMS, Clipping, Silence
  for (let i = 0; i < channelDataL.length; i++) {
    const l = channelDataL[i];
    const r = channelDataR[i];
    
    // Stereo mix down for basic loudness stats
    const mix = (l + r) / 2;
    const absMix = Math.abs(mix);
    
    if (absMix > maxPeak) maxPeak = absMix;
    sumSquares += mix * mix;
    
    if (Math.abs(l) >= 0.999 || Math.abs(r) >= 0.999) {
      clippingCount++;
    }
    
    if (absMix < 0.0001) {
      silenceCount++;
    }
  }
  
  const maxPeakDb = 20 * Math.log10(Math.max(maxPeak, 1e-7));
  const rms = Math.sqrt(sumSquares / channelDataL.length);
  const rmsDb = 20 * Math.log10(Math.max(rms, 1e-7));
  const crestFactor = maxPeakDb - rmsDb; // Peak to average ratio in dB
  
  const silencePercentage = (silenceCount / channelDataL.length) * 100;
  
  // Extract features using Meyda
  // We'll analyze a few random chunks to get an average spectral centroid
  const bufferSize = 4096;
  const chunksToAnalyze = Math.min(50, Math.floor(channelDataL.length / bufferSize));
  let totalCentroid = 0;
  let validChunks = 0;
  
  Meyda.bufferSize = bufferSize;
  
  for (let i = 0; i < chunksToAnalyze; i++) {
    const startIndex = Math.floor(Math.random() * (channelDataL.length - bufferSize));
    const chunk = channelDataL.slice(startIndex, startIndex + bufferSize);
    
    // Only analyze chunks that aren't silent
    if (Math.max(...chunk) > 0.01) {
      const features = Meyda.extract('spectralCentroid', chunk);
      if (features) {
         // Meyda centroid is often related to Nyquist. 
         totalCentroid += (features as number);
         validChunks++;
      }
    }
  }
  
  const averageCentroidNyquist = validChunks > 0 ? totalCentroid / validChunks : 0;
  const spectralCentroid = averageCentroidNyquist * (sampleRate / 2) / (bufferSize / 2); // approximate conversion to Hz
  
  // Very rough approximation of low/mid/high balance using standard RMS of filtered bands
  // In a real app we'd use biquad filters in an OfflineAudioContext, but we can do a simple estimation 
  // using an OfflineAudioContext for a quick pass.
  
  const offlineCtx = new OfflineAudioContext(3, audioBuffer.length, audioBuffer.sampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  
  // Lowpass
  const lowPass = offlineCtx.createBiquadFilter();
  lowPass.type = 'lowpass';
  lowPass.frequency.value = 250;
  
  // Bandpass (Mid)
  const midPass = offlineCtx.createBiquadFilter();
  midPass.type = 'bandpass';
  midPass.frequency.value = 1000;
  midPass.Q.value = 0.5; // roughly 250 to 4000
  
  // Highpass
  const highPass = offlineCtx.createBiquadFilter();
  highPass.type = 'highpass';
  highPass.frequency.value = 4000;
  
  // Splitter
  source.connect(lowPass);
  source.connect(midPass);
  source.connect(highPass);
  
  // We can't analyze this synchronously easily without rendering.
  // We will just return dummy values for the offline rendering to save time for this prototype,
  // or we can render it. Rendering 3 channels is fast offline.
  
  const merger = offlineCtx.createChannelMerger(3);
  lowPass.connect(merger, 0, 0);
  midPass.connect(merger, 0, 1);
  highPass.connect(merger, 0, 2);
  
  merger.connect(offlineCtx.destination);
  source.start(0);
  
  const renderedBuffer = await offlineCtx.startRendering();
  
  const lowData = renderedBuffer.getChannelData(0);
  const midData = renderedBuffer.getChannelData(1);
  const highData = renderedBuffer.getChannelData(2);
  
  const getRms = (data: Float32Array) => {
    let sum = 0;
    for(let i=0; i<data.length; i++) sum += data[i]*data[i];
    return Math.sqrt(sum / data.length);
  }
  
  const lowRms = getRms(lowData);
  const midRms = getRms(midData);
  const highRms = getRms(highData);
  
  const totalRms = lowRms + midRms + highRms || 1; // avoid div by 0
  
  let stereoCorrelation = 1;
  if (audioBuffer.numberOfChannels > 1) {
    let dotProd = 0;
    let lSq = 0;
    let rSq = 0;
    for(let i=0; i<channelDataL.length; i++) {
        dotProd += channelDataL[i] * channelDataR[i];
        lSq += channelDataL[i] * channelDataL[i];
        rSq += channelDataR[i] * channelDataR[i];
    }
    stereoCorrelation = dotProd / (Math.sqrt(lSq) * Math.sqrt(rSq));
  }

  return {
    maxPeakDb,
    rmsDb,
    crestFactor,
    spectralCentroid,
    clippingCount,
    silencePercentage,
    lowMidHighBalance: {
      low: (lowRms / totalRms) * 100,
      mid: (midRms / totalRms) * 100,
      high: (highRms / totalRms) * 100,
    },
    stereoCorrelation
  };
}
