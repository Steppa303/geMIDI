





import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { type MidiNote, TrackType, type DrumMapping, type CcAutomationEvent } from '../types';
import { MAX_BARS } from '../constants'; // Added MAX_BARS import

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error("API_KEY environment variable not set for Gemini.");
  // alert("Gemini API Key is not configured. Please set the API_KEY environment variable.");
  // In a real app, you might want to disable AI features or show a persistent error.
}

const ai = new GoogleGenAI({ apiKey: API_KEY! }); // Non-null assertion, error handled above.
const model = ai.models;
const genAIModel = 'gemini-2.5-flash';

const cleanJsonString = (responseText: string): string => {
  let jsonStr = responseText.trim();
  
  // 1. Extract from markdown code fences if present
  const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
  const match = jsonStr.match(fenceRegex);
  if (match && match[2]) {
    jsonStr = match[2].trim();
  }

  // 2. Remove multi-line /* ... */ comments
  jsonStr = jsonStr.replace(/\/\*[\s\S]*?\*\//g, '');

  // 3. Remove single-line // comments
  jsonStr = jsonStr.split('\n').map(line => line.replace(/\s*\/\/[^\n\r]*$/, '').trim()).filter(Boolean).join('\n');

  // 4. Remove trailing commas in objects and arrays to prevent parsing errors
  jsonStr = jsonStr.replace(/,\s*([}\]])/g, '$1');

  return jsonStr;
}


const parseGeminiResponse = (responseText: string): MidiNote[] => {
  const jsonStr = cleanJsonString(responseText);

  try {
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) {
      return parsed.filter(p =>
        p && 
        typeof p === 'object' &&
        typeof p.note === 'number' && isFinite(p.note) && p.note >= 0 && p.note <= 127 &&
        typeof p.velocity === 'number' && isFinite(p.velocity) && p.velocity >=0 && p.velocity <= 127 &&
        typeof p.time === 'number' && isFinite(p.time) && p.time >= 0 &&
        typeof p.duration === 'number' && isFinite(p.duration) && p.duration > 0
      ).map(p => ({
        note: Math.round(p.note),
        velocity: Math.round(p.velocity),
        time: Math.round(p.time * 4) / 4, // Quantize time to the nearest 16th note
        duration: p.duration, // Keep original duration for articulation
      })) as MidiNote[];
    }
    throw new Error("Parsed JSON is not an array of MIDI notes.");
  } catch (e) {
    console.error("Failed to parse JSON response from Gemini:", e, "Cleaned response attempt:", jsonStr, "Original response:", responseText);
    throw new Error(`Failed to parse AI response. Expected JSON array of MIDI notes. ${ (e as Error).message }`);
  }
};

const parseCcAutomationResponse = (responseText: string): CcAutomationEvent[] => {
  const jsonStr = cleanJsonString(responseText);

  try {
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) {
      return parsed.filter(p =>
        p &&
        typeof p === 'object' &&
        typeof p.time === 'number' && isFinite(p.time) && p.time >= 0 &&
        typeof p.value === 'number' && isFinite(p.value) && p.value >= 0 && p.value <= 127
      ).map(p => ({
        time: Math.round(p.time * 4) / 4, // Quantize time to the nearest 16th note
        value: Math.round(p.value), // Ensure CC value is an integer
      })) as CcAutomationEvent[];
    }
    throw new Error("Parsed JSON is not an array of CC automation events.");
  } catch (e) {
    console.error("Failed to parse CC automation JSON response from Gemini:", e, "Cleaned response attempt:", jsonStr, "Original response:", responseText);
    throw new Error(`Failed to parse AI response for CC automation. Expected JSON array of CC events. ${ (e as Error).message }`);
  }
};


export const generateMidiPattern = async (
  userPrompt: string,
  trackType: TrackType,
  bars: number,
  drumMapping?: DrumMapping,
  masterContext?: string // Added masterContext parameter
): Promise<MidiNote[]> => {
  if (!API_KEY) throw new Error("Gemini API Key is not configured.");

  let systemInstruction = `You are an expert MIDI pattern generator.
Your output MUST be ONLY a valid JSON array of MIDI note objects.
The JSON array should represent a musically coherent MIDI pattern of ${bars} bar(s) length (4/4 time signature, ${bars*4} total beats).

Each element in the JSON array MUST be a distinct JSON object representing a single MIDI note.
Each MIDI note object MUST strictly contain the following four properties and no others:
1.  "note": An integer MIDI note number (0-127).
2.  "velocity": An integer MIDI velocity (0-127, typically 60-120).
3.  "time": A float representing the start time in beats from the beginning of the pattern (e.g., 0.0, 0.25, 0.5). Must be non-negative and less than ${bars*4}.
4.  "duration": A float representing the duration in beats (e.g., 0.25 for a 16th note, 1.0 for a quarter note). Must be a positive value.

Example of a single note object:
{"note": 60, "velocity": 100, "time": 0.0, "duration": 0.5}

Example of a valid JSON array containing two note objects:
[
  {"note": 60, "velocity": 100, "time": 0.0, "duration": 0.5},
  {"note": 62, "velocity": 90, "time": 0.5, "duration": 0.25}
]

IMPORTANT RULES:
- The entire output MUST be a single JSON array.
- All property keys must be enclosed in double quotes (e.g., "note", NOT note or 'note').
- DO NOT include any comments (e.g., // comment or /* ... */), narrative text, or any characters outside this JSON array structure.
- DO NOT include trailing commas.
- Ensure all JSON objects within the array are separated by commas.
- Ensure the JSON is well-formed and can be directly parsed.
- Notes should be quantized to 16th notes or simpler rhythms unless the user prompt specifies otherwise.
- Times and durations should be precise, finite numbers. Time must be >= 0. Duration must be > 0.
- The total length of the pattern is ${bars*4} beats. Do not generate notes or events beyond this total duration. Note start times + durations should ideally not exceed ${bars*4}.
`;

  if (trackType === TrackType.DRUM) {
    systemInstruction += "\nThis is for a DRUM track. Use common drum sounds.\n";
    if (drumMapping) {
      systemInstruction += "Use the following Roland TR-8S style MIDI note mappings where appropriate:\n";
      systemInstruction += Object.entries(drumMapping)
        .map(([key, value]) => `- ${key}: ${value}`)
        .join("\n");
      systemInstruction += "\nPrioritize these mapped sounds for the drum beat.\n";
    }
    systemInstruction += `\n**Crucially, for DRUM patterns, meticulously analyze the user's prompt for any specific rhythmic instructions, such as "snare on beats 2 and 4", "kick on every quarter note", "hi-hats on offbeats", or requests for specific instruments at specific times (e.g., "snare in offbeat of first and fourth bar"). Ensure these explicit instructions are accurately reflected in the generated MIDI pattern.**\n`;
  } else {
    systemInstruction += "\nThis is for a SYNTH track (e.g., bassline, melody, chords).\n";
  }

  let fullPromptContents = userPrompt;
  if (masterContext && masterContext.trim() !== "") {
    fullPromptContents = `Overall musical context: "${masterContext}"\n\nSpecific request for this track: "${userPrompt}"`;
  }


  try {
    const response: GenerateContentResponse = await model.generateContent({
      model: genAIModel,
      contents: fullPromptContents, // Use the potentially augmented prompt
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        // Omit thinkingConfig to use default (enabled) for higher quality.
      }
    });
    
    return parseGeminiResponse(response.text);

  } catch (error) {
    console.error("Error calling Gemini API for generation:", error);
    if (error instanceof Error && error.message.includes('API key not valid')) {
         throw new Error("Invalid Gemini API Key. Please check your configuration.");
    }
    throw new Error(`AI pattern generation failed. ${ (error as Error).message }`);
  }
};


export const modifyMidiPattern = async (
  userRequestPrompt: string,
  existingPattern: MidiNote[],
  trackType: TrackType,
  currentBars: number,
  masterContext?: string,
  drumMapping?: DrumMapping
): Promise<MidiNote[]> => {
  if (!API_KEY) throw new Error("Gemini API Key is not configured.");

  const existingPatternJson = JSON.stringify(existingPattern, null, 2);

  const commonJsonRules = `
Your output MUST be ONLY a valid JSON array of MIDI note objects for the complete, modified ${currentBars}-bar pattern.
The final pattern should be musically coherent.

Each element in the JSON array MUST be a distinct JSON object representing a single MIDI note.
Each MIDI note object MUST strictly contain the following four properties and no others:
1.  "note": An integer MIDI note number (0-127).
2.  "velocity": An integer MIDI velocity (0-127).
3.  "time": A float representing the start time in beats from the beginning of the pattern (e.g., 0.0, 0.25, 0.5). Must be non-negative and less than ${currentBars*4}.
4.  "duration": A float representing the duration in beats (e.g., 0.25 for a 16th note, 1.0 for a quarter note). Must be a positive value.

Example of a single note object:
{"note": 60, "velocity": 100, "time": 0.0, "duration": 0.5}

IMPORTANT RULES:
- The entire output MUST be a single JSON array.
- All property keys must be enclosed in double quotes (e.g., "note", NOT note or 'note').
- DO NOT include any comments (e.g., // comment or /* ... */), narrative text, or any characters outside this JSON array structure.
- DO NOT include trailing commas.
- Ensure all JSON objects within the array are separated by commas.
- Ensure the JSON is well-formed and can be directly parsed.
- Notes should be quantized to 16th notes or simpler rhythms unless specified.
- Times and durations should be precise, finite numbers. Time must be >= 0. Duration must be > 0.
- The total length of the pattern is ${currentBars*4} beats. Do not generate notes or events beyond this total duration. Note start times + durations should ideally not exceed ${currentBars*4}.
`;

  let systemInstruction = `You are an expert MIDI pattern transformer. Your task is to modify a given MIDI pattern based on a user's text request.

**Your process must be:**
1.  **Analyze the \`EXISTING_PATTERN\`**: You will receive a pattern in JSON format. Understand its notes, timing, and structure.
2.  **Analyze the \`USER_REQUEST\`**: Understand the user's goal. Are they asking to change rhythm, pitch, duration, or remove/add specific notes?
3.  **TRANSFORM the pattern**: Based on the request, you must create a NEW, complete pattern that is a direct transformation of the original.

**CRITICAL RULE: DO NOT MERGE. TRANSFORM.**
Your output should be a REPLACEMENT for the original pattern, not an addition to it.

-   **Example of CORRECT transformation**: If the request is "make the notes longer", you must take the existing notes and increase their 'duration' values. The output should have the same number of notes, just with longer durations.
-   **Example of INCORRECT merging**: If the request is "make the notes longer", DO NOT simply add new long notes while keeping the original short notes. This is wrong. You must modify the original notes.
-   **Example of CORRECT transformation**: If the request is "remove half the notes", you must analyze the original pattern and create a new pattern containing only a selection of the original notes.
-   **Example of INCORRECT merging**: If the request is "remove half the notes", DO NOT just return the original pattern unchanged.

The final output MUST be the complete, modified pattern for all ${currentBars} bars.
${commonJsonRules}`;
    
  let fullPromptToGemini = `USER_REQUEST: "${userRequestPrompt}"

EXISTING_PATTERN:
\`\`\`json
${existingPatternJson}
\`\`\`

Now, following all rules, transform the EXISTING_PATTERN based on the USER_REQUEST and provide the complete, new, modified pattern as your ONLY output.`;

  if (masterContext && masterContext.trim() !== "") {
    fullPromptToGemini = `Overall musical context: "${masterContext}"\n\n${fullPromptToGemini}`;
  }


  if (trackType === TrackType.DRUM) {
    systemInstruction += "\nThis is for a DRUM track.\n";
    if (drumMapping) {
      systemInstruction += "Use the following Roland TR-8S style MIDI note mappings where appropriate:\n";
      systemInstruction += Object.entries(drumMapping)
        .map(([key, value]) => `- ${key}: ${value}`)
        .join("\n");
      systemInstruction += "\nPrioritize these mapped sounds for the drum beat.\n";
    }
    systemInstruction += `\n**When modifying DRUM patterns based on a user prompt, meticulously analyze the prompt for specific rhythmic instructions or instrument changes. Apply these modifications to the existing pattern structure accurately.**\n`;
  } else { // SYNTH
    systemInstruction += "\nThis is for a SYNTH track.\n";
    systemInstruction += `\n**When modifying SYNTH patterns based on a user prompt, focus on aspects like melody, harmony, rhythm, and articulation as suggested by the prompt.**\n`;
  }
  
  try {
    const response: GenerateContentResponse = await model.generateContent({
      model: genAIModel,
      contents: fullPromptToGemini,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
      }
    });

    return parseGeminiResponse(response.text);

  } catch (error) {
    console.error(`Error calling Gemini API for modification:`, error);
    if (error instanceof Error && error.message.includes('API key not valid')) {
         throw new Error("Invalid Gemini API Key. Please check your configuration.");
    }
    throw new Error(`AI pattern modification failed. ${ (error as Error).message }`);
  }
};


export const generateCcAutomation = async (
  userPrompt: string,
  ccNumber: number,
  bars: number
): Promise<CcAutomationEvent[]> => {
  if (!API_KEY) throw new Error("Gemini API Key is not configured.");

  const systemInstruction = `You are an expert MIDI CC automation generator.
Your output MUST be ONLY a valid JSON array of CC automation event objects.
The JSON array should represent a musically coherent CC automation for MIDI CC# ${ccNumber} over ${bars} bar(s) (4/4 time signature, ${bars * 4} total beats).

Each element in the JSON array MUST be a distinct JSON object representing a single CC event.
Each CC event object MUST strictly contain the following two properties and no others:
1.  "time": A float representing the time in beats from the beginning of the automation (e.g., 0.0, 0.25, 0.5). Must be non-negative and less than ${bars * 4}.
2.  "value": An integer MIDI CC value (0-127).

Example of a single CC event object:
{"time": 0.0, "value": 64}

Example of a valid JSON array containing two CC event objects:
[
  {"time": 0.0, "value": 0},
  {"time": 1.0, "value": 127}
]

IMPORTANT RULES:
- The entire output MUST be a single JSON array.
- All property keys must be enclosed in double quotes (e.g., "time", NOT time or 'time').
- DO NOT include any comments (e.g., // comment or /* ... */), narrative text, or any characters outside this JSON array structure.
- DO NOT include trailing commas.
- Ensure all JSON objects within the array are separated by commas.
- Ensure the JSON is well-formed and can be directly parsed.
- Times should be precise, finite numbers. Time must be >= 0.
- Values must be integers between 0 and 127.
- The automation is for MIDI CC number ${ccNumber}.
- The total length of the automation is ${bars * 4} beats. Do not generate events with time >= ${bars * 4}.
- Generate a reasonable number of events to represent the automation. For smooth ramps, a few points might be enough. For complex LFOs, more points will be needed.
- Events should ideally be sorted by time, but this is not strictly enforced by the parser.
`;

  try {
    const response: GenerateContentResponse = await model.generateContent({
      model: genAIModel,
      contents: userPrompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
      }
    });

    return parseCcAutomationResponse(response.text);

  } catch (error) {
    console.error("Error calling Gemini API for CC automation generation:", error);
    if (error instanceof Error && error.message.includes('API key not valid')) {
      throw new Error("Invalid Gemini API Key. Please check your configuration.");
    }
    throw new Error(`AI CC automation generation failed. ${ (error as Error).message }`);
  }
};