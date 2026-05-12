import { GoogleGenAI, Type, Chat, ThinkingLevel } from "@google/genai";
import { CritiqueResult, SessionPrediction } from "../types";

const USER_VST_LIBRARY = `
4Front Piano x64.vst, Amorph_FX.vst3, Amorph_Instrument.vst3, Amorph_MIDI.vst3, Attracktive.vst3, Bertom_DenoiserClassic.vst3, DelaySon.vst3, Orra Tone Zone.vst3, Prism.vst3, Proteus.vst3, TAL-Chorus-LX.vst3, Vastaus.vst3, ACE Bridge 2.vst3, ACE Bridge ARA.vst3, ACE Bridge.vst3, Amped - Block Letter.vst3, Amped - Fluff 2C.vst3, Amped - Humble.vst3, Amped - Roots.vst3, Amped - Volcano.vst3, amplistortion2_64bits.vst3, ANIMATE.vst3, Auburn Sounds Panagement 2-64.vst3, BASSROOM.vst3, BFDPlayer.vst3, Boogex.vst3, bx_blackdist2.vst3, bx_bluechorus2.vst3, bx_boom.vst3, bx_cleansweep V2.vst3, bx_distorange.vst3, bx_greenscreamer.vst3, bx_masterdesk Classic.vst3, bx_megasingle.vst3, bx_metal2.vst3, bx_meter.vst3, bx_opto Pedal.vst3, bx_rockrack V3 Player.vst3, bx_shredspread.vst3, bx_solo.vst3, bx_subfilter.vst3, bx_subsynth.vst3, bx_tuner.vst3, bx_yellowdrive.vst3, Clear.vst3, CUBE.vst3, elysia niveau filter.vst3, Emissary.vst3, FASTERMASTER.vst3, FUSER.vst3, Kontakt 7.vst3, Kontakt 8.vst3, LEVELS.vst3, LIMITER.vst3, LoudMax.vst3, MIXROOM.vst3, MLDrums.vst3, MT-PowerDrumKit.vst3, NadIR.vst3, NAM Universal.vst3, PanCake 2.vst3, PlaceIt.vst3, Puncher2Lite.vst3, REFERENCE.vst3, REFSEND.vst3, RESO.vst3, RRS EQ560 Free VST3_64.vst3, ShapeIt.vst3, smartEQ3.vst3, SOL.vst3, SongEngine_x64.vst3, SPL Free Ranger.vst3, STL Ignite - AmpHub.vst3, T-De-Esser 2.vst3, TDR Nova.vst3, VG-SPARKLE2.vst3, WaveShell1-VST3 16.0_x64.vst3, Youlean Loudness Meter 2.vst3, ProEQ.vst3, Room Reverb.vst3, Compressor.vst3, Limiter.vst3
`;

const TRACK_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    type: { type: Type.STRING, enum: ["audio", "fx", "bus"] },
    inserts: { 
      type: Type.ARRAY, 
      items: { 
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          settings: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["name", "settings"]
      } 
    },
    sends: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          target: { type: Type.STRING },
          level: { type: Type.NUMBER }
        }
      }
    },
    sidechain: {
      type: Type.OBJECT,
      properties: {
        source: { type: Type.STRING },
        target: { type: Type.STRING }
      }
    }
  },
  required: ["name", "type", "inserts"]
};

const PREDICTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    predictedTracks: {
      type: Type.ARRAY,
      items: TRACK_SCHEMA
    },
    masterBus: {
      type: Type.OBJECT,
      properties: {
        inserts: { 
          type: Type.ARRAY, 
          items: { 
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              settings: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["name", "settings"]
          } 
        }
      },
      required: ["inserts"]
    },
    confidence: { type: Type.NUMBER },
    reasoning: { type: Type.STRING }
  },
  required: ["predictedTracks", "masterBus", "confidence", "reasoning"]
};

const BASE_SYSTEM_INSTRUCTION = `You are a world-class mixing and mastering engineer with deep expertise in PreSonus Studio One. 
Provide a professional, technical, and constructive critique of the production quality.

The user has the following VST plugins installed:
${USER_VST_LIBRARY}

Prioritize recommending their existing tools over buying new ones. 

Additionally, you MUST generate a technical "sessionBlueprint". This blueprint describes how to reconstruct the project in Studio One.
- Audio Track: Typically one track for the provided audio file.
- FX Tracks: Suggested parallel processing (e.g., Reverb Bus, Parallel Compression).
- Inserts: Specific plugins from the user's library.
- For EACH insert, provide a "settings" array of strings which are specific parameter values (e.g., "Threshold: -15dB", "Ratio: 4:1", "Mix: 100%").
- Sidechaining: Define if a track should trigger another (e.g., Kick SC to Bass).
- Master Bus: The chain for the final mixdown.`;

const CRITIQUE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    overallScore: { type: Type.NUMBER, description: "Overall score out of 100" },
    summary: { type: Type.STRING },
    tonalBalance: { type: Type.STRING },
    dynamics: { type: Type.STRING },
    stereoImage: { type: Type.STRING },
    timestampedFeedback: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          time: { type: Type.STRING, description: "Timestamp like 0:30" },
          issue: { type: Type.STRING },
          suggestion: { type: Type.STRING },
          studioOneTip: { type: Type.STRING, description: "Specific tip for Studio One users" }
        },
        required: ["time", "issue", "suggestion", "studioOneTip"]
      }
    },
    libraryPluginSuggestions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          pluginName: { type: Type.STRING },
          application: { type: Type.STRING }
        },
        required: ["pluginName", "application"]
      }
    },
    sessionBlueprint: {
      type: Type.OBJECT,
      properties: {
        tracks: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              type: { type: Type.STRING, enum: ["audio", "fx", "bus"] },
              inserts: { 
                type: Type.ARRAY, 
                items: { 
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    settings: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Specific knob/fader settings for this plugin" }
                  },
                  required: ["name", "settings"]
                } 
              },
              sends: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    target: { type: Type.STRING },
                    level: { type: Type.NUMBER }
                  }
                }
              },
              sidechain: {
                type: Type.OBJECT,
                properties: {
                  source: { type: Type.STRING },
                  target: { type: Type.STRING }
                }
              }
            },
            required: ["name", "type", "inserts"]
          }
        },
        masterBus: {
          type: Type.OBJECT,
          properties: {
            inserts: { 
              type: Type.ARRAY, 
              items: { 
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  settings: { type: Type.ARRAY, items: { type: Type.STRING } }
                },
                required: ["name", "settings"]
              } 
            }
          },
          required: ["inserts"]
        }
      },
      required: ["tracks", "masterBus"]
    },
    generalSuggestions: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    },
    comparisonSummary: { type: Type.STRING },
    scoreChange: { type: Type.NUMBER }
  },
  required: ["overallScore", "summary", "tonalBalance", "dynamics", "stereoImage", "timestampedFeedback", "generalSuggestions", "libraryPluginSuggestions", "sessionBlueprint"]
};

/**
 * Utility for exponential backoff retries
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const status = err?.status || (err?.message?.includes('500') ? 500 : 0);
      
      if (status === 500 || status === 429 || err?.message?.includes('INTERNAL')) {
        const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API Key is missing. Please ensure a key is selected.");
  return new GoogleGenAI({ apiKey });
};

export const analyzeAudio = async (base64Audio: string, mimeType: string, previousCritique?: CritiqueResult, songXmlContent?: string, focusPrompt?: string): Promise<CritiqueResult> => {
  return withRetry(async () => {
    const ai = getAIClient();

    let prompt = "Analyze this track's mixing and mastering. Generate a full SessionBlueprint for Studio One. For each plugin listed in 'inserts', give detailed suggested settings.";
    let systemInstruction = BASE_SYSTEM_INSTRUCTION;

    if (songXmlContent) {
      systemInstruction += `\n\nHere is the Studio One song.xml content for technical context (track names, routing, plugins used):\n${songXmlContent}`;
    }

    if (previousCritique) {
      systemInstruction += `\nPrevious Score: ${previousCritique.overallScore}. Compare this new version.`;
      prompt = "Compare this revision and update the SessionBlueprint based on remaining issues. Provide specific parameter settings for each plugin.";
      if (focusPrompt) {
        prompt += `\n\nUSER'S FOCUS FOR THIS REVISION: "${focusPrompt}"\nEnsure you specifically address this focus area in your critique and suggestions.`;
      }
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { data: base64Audio, mimeType: mimeType } },
          { text: prompt }
        ],
      },
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: CRITIQUE_SCHEMA,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
      }
    });

    try {
      const text = response.text || '{}';
      return JSON.parse(text) as CritiqueResult;
    } catch (error) {
      console.error("Failed to parse Gemini response:", error);
      throw new Error("The AI provided an invalid response format.");
    }
  });
};

export const predictSessionConfiguration = async (base64Audio: string, mimeType: string, critique: CritiqueResult): Promise<SessionPrediction> => {
  return withRetry(async () => {
    const ai = getAIClient();

    const systemInstruction = `You are a world-class mixing engineer. 
    Based on the audio provided and the critique already performed, predict the current Studio One session configuration.
    Identify which plugins from the user's library are LIKELY already being used and how they are set.
    
    User Library:
    ${USER_VST_LIBRARY}
    
    Critique Context:
    Score: ${critique.overallScore}
    Summary: ${critique.summary}
    Tonal Balance: ${critique.tonalBalance}
    Dynamics: ${critique.dynamics}`;

    const prompt = "Analyze the audio and predict the current track layout, plugin inserts, and master bus chain. Be as accurate as possible based on the sonic characteristics.";

    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: {
        parts: [
          { inlineData: { data: base64Audio, mimeType: mimeType } },
          { text: prompt }
        ],
      },
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: PREDICTION_SCHEMA,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
      }
    });

    try {
      const text = response.text || '{}';
      return JSON.parse(text) as SessionPrediction;
    } catch (error) {
      console.error("Failed to parse prediction response:", error);
      throw new Error("The AI provided an invalid prediction format.");
    }
  });
};

export const createChatSession = (critique: CritiqueResult): Chat => {
  const ai = getAIClient();
  return ai.chats.create({
    model: 'gemini-3-flash-preview',
    config: {
      systemInstruction: `You are a world-class mixing engineer. User library: ${USER_VST_LIBRARY}.
      Context: Score ${critique.overallScore}, Summary: ${critique.summary}. 
      You are also aware of the SessionBlueprint you generated for their Studio One project.`,
    },
  });
};