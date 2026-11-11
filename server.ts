import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import http from 'http';
import https from 'https';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '60mb' }));

// CORS & Cloud Headers
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Ensure asset storage directories exist
const EXPORTS_DIR = path.resolve(__dirname, 'public/exports');
const UPLOADS_DIR = path.resolve(__dirname, 'public/uploads');
const AUDIO_DIR = path.resolve(__dirname, 'public/assets/audio');
const DIALOGUE_AUDIO_DIR = path.resolve(AUDIO_DIR, 'dialogue');
const MUSIC_AUDIO_DIR = path.resolve(AUDIO_DIR, 'music');
const SFX_AUDIO_DIR = path.resolve(AUDIO_DIR, 'sfx');

[EXPORTS_DIR, UPLOADS_DIR, AUDIO_DIR, DIALOGUE_AUDIO_DIR, MUSIC_AUDIO_DIR, SFX_AUDIO_DIR].forEach((dir) => {
  fs.mkdirSync(dir, { recursive: true });
});

// Static asset handlers with explicit 404 fallbacks to prevent serving index.html on missing assets
app.use('/exports', express.static(EXPORTS_DIR), (req: Request, res: Response) => {
  res.status(404).type('application/json').json({ error: `Export file not found: ${req.path}` });
});
app.use('/uploads', express.static(UPLOADS_DIR), (req: Request, res: Response) => {
  res.status(404).type('application/json').json({ error: `Uploaded file not found: ${req.path}` });
});
app.use('/assets/audio', express.static(AUDIO_DIR), (req: Request, res: Response) => {
  res.status(404).type('application/json').json({ error: `Audio asset not found: ${req.path}` });
});

// Lightweight rate limiting
const rateBuckets = new Map<string, { count: number; resetAt: number }>();
const rateLimit = (maxRequests = 60, windowMs = 60_000) => (req: Request, res: Response, next: any) => {
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  let bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) bucket = { count: 0, resetAt: now + windowMs };
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  if (bucket.count > maxRequests) return res.status(429).json({ error: 'Rate limit exceeded. Please try again later.' });
  next();
};

app.use('/api/ai', rateLimit(60));
app.use('/api/generate', rateLimit(80));
app.use('/api/jobs', rateLimit(180));
app.use('/api/render', rateLimit(120));

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const VEO_MODEL = process.env.VEO_MODEL || 'gemini-omni-1.2-flash';

// Initialize Google GenAI client (Server-side only)
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key.trim() === '' || key === 'MY_GEMINI_API_KEY') {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'mb-ai-film-studio-cloud',
        },
      },
    });
  }
  return aiClient;
}

function parseGeminiJson<T = any>(rawText: string | undefined): T {
  if (!rawText) return {} as T;
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(cleaned);
}

const DATA_DIR = path.resolve(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const JOBS_FILE = path.resolve(DATA_DIR, 'jobs.json');

// Persistent Server Job Storage
interface ServerJob {
  jobId: string;
  filmProjectId: string;
  type: string;
  targetId: string;
  title: string;
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  createdAt: number;
  completedAt?: number;
  error?: string;
  retryCount: number;
  videoUrl?: string;
  downloadUrl?: string;
  provider?: string;
  prompt?: string;
  duration?: number;
  aspectRatio?: string;
  referenceImage?: string;
  characterReferences?: string[];
  visualContinuity?: any;
  characters?: any[];
  locations?: any[];
  fileSize?: number;
  resolution?: string;
}

const serverJobQueue: Map<string, ServerJob> = new Map();

function loadJobQueue() {
  try {
    if (fs.existsSync(JOBS_FILE)) {
      const raw = fs.readFileSync(JOBS_FILE, 'utf-8');
      const list = JSON.parse(raw);
      if (Array.isArray(list)) {
        for (const j of list) {
          if (j.status === 'processing') {
            j.status = 'failed';
            j.error = 'Job interrupted by server restart. Click Retry to re-run generation.';
          }
          serverJobQueue.set(j.jobId, j);
        }
        console.log(`[Job Manager] Restored ${serverJobQueue.size} jobs from disk.`);
      }
    }
  } catch (err) {
    console.error('Failed to load jobs from disk:', err);
  }
}

function saveJobQueue() {
  try {
    const list = Array.from(serverJobQueue.values());
    fs.writeFileSync(JOBS_FILE, JSON.stringify(list, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save jobs to disk:', err);
  }
}

// Restore persistent jobs on startup
loadJobQueue();

// API Health check
app.get('/api/health', (_req: Request, res: Response) => {
  let ffmpegVersion = 'unavailable';
  try {
    ffmpegVersion = execSync('ffmpeg -version').toString().split('\n')[0];
  } catch {}

  res.json({
    status: 'online',
    app: 'M-b AI Film Studio',
    version: '3.0.0',
    geminiConfigured: Boolean(getAI()),
    activeModel: GEMINI_MODEL,
    activeVeoModel: VEO_MODEL,
    ffmpegInstalled: ffmpegVersion.includes('ffmpeg version'),
    ffmpegVersion,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Diagnostic Endpoint: Probes Google GenAI SDK, authentication, model catalog, and video capabilities
 */
app.get('/api/diagnostics/api-capabilities', async (_req: Request, res: Response) => {
  const ai = getAI();
  const apiKey = process.env.GEMINI_API_KEY || '';
  const keyDiagnostics = {
    configured: Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY'),
    length: apiKey.length,
    prefix: apiKey ? apiKey.slice(0, 8) + '...' : 'none',
  };

  if (!ai) {
    return res.json({
      keyDiagnostics,
      error: 'GoogleGenAI client not initialized (GEMINI_API_KEY missing or empty).',
    });
  }

  const results: any = {
    keyDiagnostics,
    sdkVersion: '2.32.0',
    modelsListed: [] as string[],
    videoModels: [] as string[],
    listModelsError: null as any,
    omniFlashProbe: null as any,
    veoProbe: null as any,
  };

  // 1. Probe Model Catalog via ai.models.list()
  try {
    const listResult = await ai.models.list();
    const allModels: string[] = [];
    for await (const m of listResult) {
      if (m?.name) allModels.push(m.name);
    }
    results.modelsListed = allModels;
    results.videoModels = allModels.filter((n: string) =>
      n.toLowerCase().includes('video') ||
      n.toLowerCase().includes('veo') ||
      n.toLowerCase().includes('omni')
    );
  } catch (err: any) {
    results.listModelsError = {
      status: err.status || err.statusCode,
      message: err.message,
      errorDetails: err.errorDetails || err.details || null,
    };
  }

  // 2. Direct Probe of gemini-omni-1.2-flash model metadata
  try {
    const m = await ai.models.get({ model: 'models/gemini-omni-1.2-flash' });
    results.omniFlashProbe = { found: true, name: m?.name, displayName: m?.displayName };
  } catch (err: any) {
    results.omniFlashProbe = {
      found: false,
      status: err.status || err.statusCode,
      message: err.message,
    };
  }

  // 3. Direct Probe of Veo model metadata
  try {
    const v = await ai.models.get({ model: 'models/veo-2.0-generate-001' });
    results.veoProbe = { found: true, name: v?.name, displayName: v?.displayName };
  } catch (err: any) {
    results.veoProbe = {
      found: false,
      status: err.status || err.statusCode,
      message: err.message,
    };
  }

  return res.json(results);
});

/**
 * Streaming proxy endpoint to bypass Google Cloud 403 Forbidden on client
 */
app.get('/api/video/proxy', (req: Request, res: Response) => {
  const uri = req.query.uri as string;
  if (!uri) {
    return res.status(400).send('Missing video uri parameter.');
  }

  const apiKey = process.env.GEMINI_API_KEY;
  try {
    const targetUrl = new URL(uri);
    if (apiKey && !targetUrl.searchParams.has('key') && targetUrl.hostname.includes('googleapis.com')) {
      targetUrl.searchParams.set('key', apiKey);
    }

    const client = targetUrl.protocol === 'https:' ? https : http;
    const proxyReq = client.get(targetUrl.toString(), (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 200, {
        'Content-Type': proxyRes.headers['content-type'] || 'video/mp4',
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      });
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error('Video proxy error:', err);
      if (!res.headersSent) res.status(502).send('Error proxying video stream.');
    });
  } catch (err: any) {
    res.status(400).send('Invalid URI');
  }
});

/**
 * AI Screenplay Breakdown Endpoint
 */
app.post('/api/ai/breakdown', async (req: Request, res: Response) => {
  try {
    const { screenplay, targetDurationSeconds, genre, title, provider } = req.body;

    if (typeof screenplay !== 'string' || !screenplay.trim()) {
      return res.status(400).json({ error: 'Screenplay text is required' });
    }
    if (screenplay.length > 100_000) {
      return res.status(413).json({ error: 'Screenplay exceeds the 100,000 character limit.' });
    }
    if (!Number.isFinite(targetDurationSeconds) || targetDurationSeconds < 4 || targetDurationSeconds > 7200) {
      return res.status(400).json({ error: 'targetDurationSeconds must be between 4 and 7200 seconds.' });
    }

    const ai = getAI();
    if (!ai) {
      return res.json({
        source: 'algorithmic_fallback',
        message: 'No GEMINI_API_KEY configured; utilizing built-in cinema breakdown engine.',
      });
    }

    const prompt = `You are a legendary Hollywood cinema director and Master Film Editor.
Analyze the following screenplay and plan a cinematic film breakdown strictly targeting ${targetDurationSeconds} seconds total film duration.

Target Film Duration: ${targetDurationSeconds} seconds.
Selected Video Provider: ${provider || 'Google Veo 3'}.
Genre: ${genre || 'Cinematic Drama'}.
Title: ${title || 'Untitled'}.

Screenplay Content:
${screenplay.slice(0, 8000)}

Requirements:
1. Divide the story into 1-3 Acts.
2. Divide Acts into Scenes with precise target durations in seconds (sum of scenes must equal approx ${targetDurationSeconds}s).
3. Divide each Scene into distinct Shots.
4. Calculate duration for every shot in seconds.
5. Provide camera movement, angle, mood, and visual continuity tags.
6. Return structured JSON matching the schema.`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            logline: { type: Type.STRING },
            genre: { type: Type.STRING },
            targetDurationSeconds: { type: Type.NUMBER },
            acts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  actNumber: { type: Type.INTEGER },
                  title: { type: Type.STRING },
                  summary: { type: Type.STRING },
                  targetDuration: { type: Type.NUMBER },
                },
              },
            },
            scenes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  sceneNumber: { type: Type.INTEGER },
                  heading: { type: Type.STRING },
                  location: { type: Type.STRING },
                  timeOfDay: { type: Type.STRING },
                  mood: { type: Type.STRING },
                  targetDuration: { type: Type.NUMBER },
                  shots: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        shotNumber: { type: Type.INTEGER },
                        shotType: { type: Type.STRING },
                        cameraMovement: { type: Type.STRING },
                        angle: { type: Type.STRING },
                        description: { type: Type.STRING },
                        duration: { type: Type.NUMBER },
                        screenDirection: { type: Type.STRING },
                        lightingKey: { type: Type.STRING },
                        colorPalette: { type: Type.STRING },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    const parsedJson = parseGeminiJson(response.text);
    return res.json({ source: 'gemini', data: parsedJson });
  } catch (error: any) {
    console.error('Gemini breakdown error:', error);
    return res.status(500).json({ error: error?.message || 'Failed to process AI breakdown' });
  }
});

/**
 * AI Continuity Audit Endpoint
 */
app.post('/api/ai/continuity-audit', async (req: Request, res: Response) => {
  try {
    const { shots } = req.body;
    if (!shots || !Array.isArray(shots) || shots.length === 0) {
      return res.status(400).json({ error: 'Shots array required' });
    }

    const ai = getAI();
    if (!ai) return res.json({ source: 'client_fallback' });

    const summaryShots = shots.map((s: any) => ({
      shotNumber: s.shotNumber,
      shotType: s.shotType,
      camera: s.cameraMovement,
      direction: s.visualContinuity?.screenDirection,
      lighting: s.visualContinuity?.lightingKey,
      timeOfDay: s.visualContinuity?.timeOfDay,
      desc: s.description,
    }));

    const prompt = `You are an elite Hollywood Script Supervisor and Continuity Director.
Analyze this sequence of shots for visual and temporal continuity:
${JSON.stringify(summaryShots, null, 2)}
Audit for:
1. 180-degree rule / Screen direction flips.
2. Time-of-day / lighting consistency jumps within same location.
3. Prop and costume continuity errors.
4. Jump cuts.
Provide issues with severity ('high', 'medium', 'low') and concrete recommended director fixes.`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            overallContinuityScore: { type: Type.INTEGER },
            executiveSummary: { type: Type.STRING },
            issues: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  shotNumberA: { type: Type.INTEGER },
                  shotNumberB: { type: Type.INTEGER },
                  issueType: { type: Type.STRING },
                  severity: { type: Type.STRING },
                  description: { type: Type.STRING },
                  recommendation: { type: Type.STRING },
                },
              },
            },
          },
        },
      },
    });

    return res.json({ source: 'gemini', data: parseGeminiJson(response.text) });
  } catch (error: any) {
    console.error('Continuity audit error:', error);
    return res.status(500).json({ error: error?.message || 'Continuity audit failed' });
  }
});

/**
 * AI Director Advice Endpoint
 */
app.post('/api/ai/director-advice', async (req: Request, res: Response) => {
  try {
    const { targetDuration, assembledDuration, scenesCount, shotsCount, genre } = req.body;
    const ai = getAI();
    if (!ai) {
      return res.json({
        advice: `Timeline is ${Math.abs(targetDuration - assembledDuration).toFixed(1)}s ${assembledDuration < targetDuration ? 'under' : 'over'} target. Consider pacing adjustments.`,
      });
    }

    const delta = Math.round((assembledDuration - targetDuration) * 10) / 10;
    const prompt = `You are a veteran Film Director and Head of Post-Production.
Target Duration: ${targetDuration}s, Assembled: ${assembledDuration}s, Delta: ${delta}s, Scenes: ${scenesCount}, Shots: ${shotsCount}, Genre: ${genre}.
Advise on balancing the duration without sacrificing narrative stakes. Provide 3 specific bullet points.`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
    });

    return res.json({ advice: response.text });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * Asynchronous Worker for Real AI Video Generation
 * Supports Google Gemini Omni Flash (gemini-omni-1.2-flash) and Google Veo 3.1 (veo-3.1 / veo-2.0-generate-001).
 * Never produces fake videos, stock videos, or placeholder motion plates.
 */
async function triggerVideoGenerationWorker(job: ServerJob) {
  job.status = 'processing';
  job.progress = 10;
  saveJobQueue();

  const clipId = job.targetId;
  const prompt = job.prompt || '';
  const duration = job.duration || 6;
  const aspectRatio = job.aspectRatio || '16:9';
  const selectedProvider = job.provider || 'gemini-omni';
  const targetSeconds = Math.min(15, Math.max(3, Math.round(duration)));
  const chosenAspect = aspectRatio === '9:16' ? '9:16' : '16:9';

  const ai = getAI();
  if (!ai) {
    job.status = 'failed';
    job.progress = 0;
    job.error = 'No GEMINI_API_KEY configured. Please configure a valid Gemini API key in Settings > Secrets or upload genuine video footage for this shot.';
    saveJobQueue();
    return;
  }

  // Enrich prompt with character physical descriptions, wardrobe, and scene continuity
  const continuity = job.visualContinuity || {};
  const charactersList = job.characters || [];
  const charDetails = job.characterReferences?.length
    ? charactersList
        .filter((c: any) => job.characterReferences?.includes(c.characterId || c.name))
        .map((c: any) => `${c.name} (${c.physicalDescription || ''}, wearing ${c.wardrobe || ''})`)
        .join('; ')
    : '';

  const enrichedPromptParts = [
    prompt,
    continuity.lighting ? `Lighting: ${continuity.lighting}` : '',
    continuity.colorPalette ? `Color Palette: ${continuity.colorPalette}` : '',
    continuity.characterClothing?.length ? `Wardrobe: ${continuity.characterClothing.join(', ')}` : '',
    charDetails ? `Characters: ${charDetails}` : '',
  ].filter(Boolean);

  const enrichedPrompt = enrichedPromptParts.join('. ');

  try {
    console.log(`[Video Generator] Initiating AI video generation for clip ${clipId} with provider: ${selectedProvider}...`);

    let generatedVideoBuffer: Buffer | null = null;
    let generatedVideoUri: string | null = null;

    // Use official Google Video Generation model on Gemini Developer API (gemini-omni-1.2-flash)
    // which serves as the official model alias for Veo and Omni Flash under @google/genai Interactions API.
    // If process.env.VERTEX_PROJECT_ID is explicitly configured, Vertex Veo pipeline can be attempted.
    if ((selectedProvider === 'veo3' || selectedProvider === 'veo2') && process.env.VERTEX_PROJECT_ID && typeof (ai.models as any)?.generateVideos === 'function') {
      const veoModel = selectedProvider === 'veo2' ? 'veo-2.0-generate-001' : (process.env.VEO_MODEL || 'veo-3.1');
      job.progress = 25;
      saveJobQueue();

      const operation = await (ai.models as any).generateVideos({
        model: veoModel,
        prompt: enrichedPrompt,
        config: {
          durationSeconds: targetSeconds,
          aspectRatio: chosenAspect,
          personGeneration: 'ALLOW_ADULT',
        },
      });

      let currentOp = operation;
      let pollAttempts = 0;
      const maxPollAttempts = 60;

      while (!currentOp.done && pollAttempts < maxPollAttempts) {
        await new Promise((r) => setTimeout(r, 6000));
        pollAttempts++;
        currentOp = await (ai.operations as any).get(currentOp);
        job.progress = Math.min(92, 25 + Math.round((pollAttempts / maxPollAttempts) * 65));
        saveJobQueue();
      }

      const vids = currentOp.result?.generatedVideos || [];
      if (vids.length > 0 && vids[0].video?.uri) {
        generatedVideoUri = vids[0].video.uri;
      } else {
        throw new Error('Veo video generation completed without video assets.');
      }
    } else {
      // Official Google Video Generation model on Gemini API: gemini-omni-1.2-flash
      // (The official model alias for Veo, Veo lite, and Gemini Omni Flash under @google/genai Interactions API)
      job.progress = 25;
      saveJobQueue();

      let interactionInput: any;
      if (job.referenceImage && job.referenceImage.includes('base64,')) {
        const parts = job.referenceImage.split('base64,');
        const mimeMatch = job.referenceImage.match(/data:([^;]+);/);
        const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
        const cleanBase64 = parts[1];

        interactionInput = [
          {
            type: 'image',
            mime_type: mimeType,
            data: cleanBase64,
          },
          {
            type: 'text',
            text: enrichedPrompt,
          },
        ];
      } else {
        interactionInput = enrichedPrompt;
      }

      const interaction = await ai.interactions.create(
        {
          model: 'gemini-omni-1.2-flash',
          input: interactionInput,
          background: false,
          store: true,
          stream: false,
          response_format: {
            type: 'video',
            aspect_ratio: chosenAspect,
            duration: `${targetSeconds}s`,
            resolution: '720p',
          },
        },
        { timeout: 300000 }
      );

      job.progress = 85;
      saveJobQueue();

      const outputVideo = (interaction as any).output_video;
      if (outputVideo?.data) {
        generatedVideoBuffer = Buffer.from(outputVideo.data, 'base64');
      } else if (outputVideo?.uri) {
        generatedVideoUri = outputVideo.uri;
      } else {
        throw new Error('Google video generation returned no video output.');
      }
    }

    // Save and verify the generated video asset
    const safeId = (clipId || `clip_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    const outFilename = `ai_${selectedProvider}_${safeId}_${Date.now()}.mp4`;
    const outPath = path.resolve(UPLOADS_DIR, outFilename);

    if (generatedVideoBuffer) {
      fs.writeFileSync(outPath, generatedVideoBuffer);
    } else if (generatedVideoUri) {
      const downloadTarget = generatedVideoUri.includes('googleapis.com') && process.env.GEMINI_API_KEY
        ? `${generatedVideoUri}${generatedVideoUri.includes('?') ? '&' : '?'}key=${process.env.GEMINI_API_KEY}`
        : generatedVideoUri;
      execSync(`curl -sL --max-time 120 "${downloadTarget}" -o "${outPath}"`);
    }

    // Verify file exists, size > 0, and validate with ffprobe
    if (!fs.existsSync(outPath) || fs.statSync(outPath).size === 0) {
      throw new Error('Generated video could not be saved to disk (0 bytes).');
    }

    const probeCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,duration -of json "${outPath}"`;
    const probeRes = JSON.parse(execSync(probeCmd).toString());
    const stream = probeRes.streams?.[0];

    if (!stream || !stream.codec_name) {
      throw new Error('Generated video asset failed container and codec validation.');
    }

    job.status = 'completed';
    job.progress = 100;
    job.completedAt = Date.now();
    job.videoUrl = `/uploads/${outFilename}`;
    job.fileSize = fs.statSync(outPath).size;
    job.duration = parseFloat(stream.duration || `${targetSeconds}`);
    job.resolution = `${stream.width}x${stream.height}`;
    delete job.error;
    saveJobQueue();
    console.log(`[Video Generator] Real AI video verified and saved for clip ${clipId}: ${job.videoUrl}`);
  } catch (err: any) {
    const errorMsg = err?.message || 'Video generation failed';
    let cleanMessage = errorMsg;
    try {
      if (typeof errorMsg === 'string' && errorMsg.includes('{')) {
        const jsonStart = errorMsg.indexOf('{');
        const parsed = JSON.parse(errorMsg.slice(jsonStart));
        if (parsed?.error?.message) {
          cleanMessage = parsed.error.message;
        }
      }
    } catch {}

    console.log(`[Video Generator] Cloud generation failed for clip ${clipId}: ${cleanMessage.slice(0, 120)}`);
    job.status = 'failed';
    job.progress = 0;
    job.error = `AI Video Generation (${selectedProvider}) paused: ${cleanMessage}. Video generation requires a paid Gemini API key with billing enabled. You can upload custom MP4 footage for this shot or retry with an authorized key.`;
    delete job.videoUrl;
    saveJobQueue();
  }
}

/**
 * Real Video Generation Endpoint:
 * Triggers official Gemini Omni Flash / Veo 3.1 background generation without fake fallbacks.
 */
app.post('/api/generate/video', async (req: Request, res: Response) => {
  try {
    const {
      clipId,
      prompt,
      duration,
      aspectRatio,
      filmProjectId,
      provider,
      referenceImage,
      characterReferences,
      visualContinuity,
      characters,
      locations,
    } = req.body;

    if (!clipId || !prompt) {
      return res.status(400).json({ error: 'clipId and prompt are required.' });
    }

    const selectedProvider = provider || 'gemini-omni';
    const jobId = `job_${clipId}_${Date.now()}`;
    const serverJob: ServerJob = {
      jobId,
      filmProjectId: filmProjectId || 'default',
      type: 'generate_clip',
      targetId: clipId,
      provider: selectedProvider,
      title: `Generate Clip #${clipId} (${selectedProvider})`,
      status: 'queued',
      progress: 5,
      createdAt: Date.now(),
      retryCount: 0,
      prompt,
      duration: duration || 6,
      aspectRatio: aspectRatio || '16:9',
      referenceImage,
      characterReferences,
      visualContinuity,
      characters,
      locations,
    };

    serverJobQueue.set(jobId, serverJob);
    saveJobQueue();

    // Asynchronous background generation worker
    setTimeout(() => {
      triggerVideoGenerationWorker(serverJob);
    }, 50);

    return res.status(202).json({
      message: 'Video generation job started',
      jobId,
      status: 'queued',
      provider: selectedProvider,
    });
  } catch (err: any) {
    console.error('Video generation error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
});

/**
 * VIDEO FOOTAGE UPLOAD ENDPOINT
 * Allows users to upload their own MP4/WebM/MOV footage for any clip on the timeline.
 */
app.post('/api/upload/video', async (req: Request, res: Response) => {
  try {
    const { clipId, filename } = req.body;
    const base64Data = req.body.base64Data || req.body.videoData;
    if (!base64Data) {
      return res.status(400).json({ error: 'base64Data or videoData is required' });
    }

    const cleanBase64 = base64Data.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    const safeClipId = (clipId || `clip_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    const outPath = path.resolve(UPLOADS_DIR, `${safeClipId}.mp4`);

    fs.writeFileSync(outPath, buffer);

    let duration = 5;
    let width = 1920;
    let height = 1080;
    try {
      const probeOutput = execSync(`ffprobe -v quiet -print_format json -show_format -show_streams "${outPath}"`).toString();
      const probeData = JSON.parse(probeOutput);
      duration = parseFloat(probeData.format?.duration || '5');
      const videoStream = probeData.streams?.find((s: any) => s.codec_type === 'video');
      if (videoStream) {
        width = videoStream.width || 1920;
        height = videoStream.height || 1080;
      }
    } catch (probeErr) {
      console.warn('ffprobe error:', probeErr);
    }

    const videoUrl = `/uploads/${safeClipId}.mp4`;
    return res.json({
      status: 'uploaded',
      clipId: safeClipId,
      videoUrl,
      duration: Math.round(duration * 10) / 10,
      width,
      height,
    });
  } catch (err: any) {
    console.error('Upload error:', err);
    return res.status(500).json({ error: err.message || 'Video upload failed' });
  }
});

/**
 * SYNTHESIZE DIALOGUE SPEECH (TTS via FFmpeg / Flite)
 */
app.post('/api/audio/dialogue/generate', async (req: Request, res: Response) => {
  try {
    const { dialogueId, text, character, voiceStyle } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required for dialogue synthesis.' });
    }

    const safeId = (dialogueId || `dlg_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    const outPath = path.resolve(DIALOGUE_AUDIO_DIR, `${safeId}.wav`);

    const isFemale = /sarah|elena|maya|eva|woman|girl|dr\. vance/i.test(character || '') || voiceStyle === 'female';
    const voice = isFemale ? 'slt' : 'kal';
    const cleanText = text.replace(/['"\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);

    execSync(`ffmpeg -y -f lavfi -i "flite=text='${cleanText}':voice=${voice}" -ar 44100 -ac 2 "${outPath}"`);

    let duration = 3.0;
    try {
      const probeOutput = execSync(`ffprobe -v quiet -print_format json -show_format "${outPath}"`).toString();
      const probeData = JSON.parse(probeOutput);
      duration = parseFloat(probeData.format?.duration || '3.0');
    } catch {}

    const audioUrl = `/assets/audio/dialogue/${safeId}.wav`;
    return res.json({
      status: 'generated',
      dialogueId: safeId,
      audioUrl,
      duration: Math.round(duration * 10) / 10,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Dialogue synthesis failed' });
  }
});

/**
 * AUDIO ASSETS CATALOG
 */
app.get('/api/audio/assets', (_req: Request, res: Response) => {
  res.json({
    music: [
      { id: 'mus_ambient', title: 'Space Ambient Drone', audioUrl: '/assets/audio/music/ambient_drone.mp3', bpm: 72 },
      { id: 'mus_cyber', title: 'Cyberpunk Synth Pulse', audioUrl: '/assets/audio/music/cyberpunk_synth.mp3', bpm: 120 },
      { id: 'mus_orchestral', title: 'Orchestral Suspense Tremor', audioUrl: '/assets/audio/music/orchestral_tension.mp3', bpm: 84 },
    ],
    sfx: [
      { id: 'sfx_engine', name: 'Spaceship Engine Hum', audioUrl: '/assets/audio/sfx/engine_hum.mp3' },
      { id: 'sfx_door', name: 'Pneumatic Door Whoosh', audioUrl: '/assets/audio/sfx/door_whoosh.mp3' },
      { id: 'sfx_beeps', name: 'Digital Telemetry Chirps', audioUrl: '/assets/audio/sfx/telemetry_beeps.mp3' },
      { id: 'sfx_impact', name: 'Deep Cinematic Impact', audioUrl: '/assets/audio/sfx/impact.mp3' },
    ],
  });
});

/**
 * CINEMA MOTION PLATE GENERATOR
 * Renders an actual 1080p video clip with cinematic title, metadata, and camera dolly simulation using FFmpeg.
 */
app.post('/api/generate/motion-plate', async (req: Request, res: Response) => {
  try {
    const { clipId, prompt, duration = 5, sceneHeading, shotType, cameraMovement } = req.body;
    const safeId = (clipId || `clip_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    const outPath = path.resolve(UPLOADS_DIR, `plate_${safeId}.mp4`);
    const dur = Math.min(60, Math.max(1, parseFloat(duration) || 5));

    const cleanHeading = (sceneHeading || 'CINEMA SCENE').replace(/['"\\]/g, ' ').toUpperCase();
    const cleanShot = (shotType || 'CINEMATIC SHOT').replace(/['"\\]/g, ' ').toUpperCase();
    const cleanMove = (cameraMovement || 'DOLLY').replace(/['"\\]/g, ' ').toUpperCase();
    const cleanPrompt = (prompt || '').replace(/['"\\]/g, ' ').slice(0, 100);

    const cmd = `ffmpeg -y -f lavfi -i "color=c=0x070c18:s=1920x1080:d=${dur}" ` +
      `-vf "drawtext=text='${cleanHeading}':fontcolor=0x38bdf8:fontsize=36:x=90:y=120,` +
      `drawtext=text='${cleanShot}  •  ${cleanMove}':fontcolor=white:fontsize=52:x=90:y=180,` +
      `drawtext=text='${cleanPrompt}':fontcolor=0x94a3b8:fontsize=28:x=90:y=260" ` +
      `-r 24 -c:v libx264 -preset fast -pix_fmt yuv420p "${outPath}"`;

    execSync(cmd);
    const videoUrl = `/uploads/plate_${safeId}.mp4`;
    return res.json({
      status: 'completed',
      clipId: safeId,
      videoUrl,
      duration: dur,
      isMotionPlate: true,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Motion plate generation failed' });
  }
});

/**
 * Job Queue Endpoints
 */
app.get('/api/jobs', (_req: Request, res: Response) => {
  res.json(Array.from(serverJobQueue.values()));
});

app.get('/api/jobs/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const job = serverJobQueue.get(id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
});

app.post('/api/jobs/:id/cancel', (req: Request, res: Response) => {
  const { id } = req.params;
  const job = serverJobQueue.get(id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status === 'completed') {
    return res.status(400).json({ error: 'Cannot cancel an already completed job.' });
  }
  job.status = 'cancelled';
  job.error = 'Job cancelled by user.';
  saveJobQueue();
  res.json(job);
});

app.post('/api/jobs/:id/retry', (req: Request, res: Response) => {
  const { id } = req.params;
  const job = serverJobQueue.get(id);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  job.status = 'queued';
  job.progress = 5;
  job.retryCount += 1;
  delete job.error;
  delete job.completedAt;
  saveJobQueue();

  if (job.type === 'generate_clip') {
    setTimeout(() => {
      triggerVideoGenerationWorker(job);
    }, 50);
  }
  res.json(job);
});

/**
 * REAL MP4 MASTER RENDERING ENGINE (FFmpeg)
 * Assembles video clips, synthesizes dialogue, mixes background music and foley SFX,
 * and renders a verified, downloadable H.264/AAC MP4 master film.
 */
app.post('/api/render/mp4', async (req: Request, res: Response) => {
  try {
    const { project, settings } = req.body;
    if (!project || !Array.isArray(project.clips) || project.clips.length === 0) {
      return res.status(400).json({ error: 'Project with at least 1 video clip is required.' });
    }

    const renderJobId = `render_${Date.now()}`;
    const sanitizedTitle = (project.title || 'film').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    const finalMp4Name = `${sanitizedTitle}_master_${Date.now()}.mp4`;
    const finalMp4Path = path.resolve(EXPORTS_DIR, finalMp4Name);

    const targetWidth = settings?.resolution === '4K Cinema' ? 3840 : settings?.resolution === '720p' ? 1280 : 1920;
    const targetHeight = settings?.resolution === '4K Cinema' ? 2160 : settings?.resolution === '720p' ? 720 : 1080;
    const fps = settings?.fps || project.fps || 24;

    const renderJob: ServerJob = {
      jobId: renderJobId,
      filmProjectId: project.id,
      type: 'render_export',
      targetId: finalMp4Name,
      title: `Render MP4: ${project.title}`,
      status: 'processing',
      progress: 5,
      createdAt: Date.now(),
      retryCount: 0,
    };
    serverJobQueue.set(renderJobId, renderJob);
    saveJobQueue();

    // Asynchronous FFmpeg Rendering Worker
    (async () => {
      const tempDir = path.resolve('/tmp', `film_render_${renderJobId}`);
      fs.mkdirSync(tempDir, { recursive: true });

      try {
        const clips = project.clips;
        const clipVideoPaths: string[] = [];

        // 1. Process and normalize each clip video (verifying real video files)
        for (let i = 0; i < clips.length; i++) {
          const clip = clips[i];
          const clipDuration = Math.max(0.5, clip.duration || 4);
          const clipOut = path.resolve(tempDir, `norm_clip_${i}.mp4`);

          let sourceFile: string | null = null;
          if (clip.videoUrl) {
            if (clip.videoUrl.startsWith('/uploads/') || clip.videoUrl.startsWith('/exports/')) {
              const localCandidate = path.resolve(__dirname, 'public', clip.videoUrl.replace(/^\//, ''));
              if (fs.existsSync(localCandidate)) {
                sourceFile = localCandidate;
              }
            } else if (clip.videoUrl.startsWith('http')) {
              try {
                const downloaded = path.resolve(tempDir, `dl_clip_${i}.mp4`);
                execSync(`curl -sL --max-time 15 "${clip.videoUrl}" -o "${downloaded}"`);
                if (fs.existsSync(downloaded) && fs.statSync(downloaded).size > 1000) {
                  sourceFile = downloaded;
                }
              } catch (dlErr) {
                console.warn('Clip download failed:', dlErr);
              }
            }
          }

          if (!sourceFile) {
            throw new Error(`Clip #${clip.clipId} has no verified video footage on disk. All timeline clips must be genuine AI-generated videos or uploaded footage before rendering.`);
          }

          execSync(`ffmpeg -y -i "${sourceFile}" -t ${clipDuration} -vf "scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2,setsar=1" -r ${fps} -c:v libx264 -preset fast -pix_fmt yuv420p -an "${clipOut}"`);
          clipVideoPaths.push(clipOut);
          renderJob.progress = Math.min(50, 10 + Math.round((i / clips.length) * 40));
          saveJobQueue();
        }

        // 2. Concat normalized video clips
        const concatListPath = path.resolve(tempDir, 'concat_list.txt');
        fs.writeFileSync(concatListPath, clipVideoPaths.map((p) => `file '${p}'`).join('\n'));
        const assembledVideoPath = path.resolve(tempDir, 'assembled_video.mp4');
        execSync(`ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${assembledVideoPath}"`);
        renderJob.progress = 60;

        // 3. Audio synthesis & mixing
        const totalDuration = project.actualAssembledDuration || clips.reduce((acc: number, c: any) => acc + c.duration, 0);
        const dialogues = project.dialogueTracks || [];

        // Synthesize any dialogue audio that hasn't been generated yet
        const dialogueAudioInputs: { file: string; delayMs: number }[] = [];
        for (let j = 0; j < dialogues.length; j++) {
          const dlg = dialogues[j];
          let dlgWav = path.resolve(DIALOGUE_AUDIO_DIR, `${dlg.id}.wav`);
          if (!fs.existsSync(dlgWav)) {
            const isFemale = /sarah|elena|maya|eva|woman/i.test(dlg.character || '');
            const cleanText = (dlg.text || 'Dialogue').replace(/['"\\]/g, ' ');
            execSync(`ffmpeg -y -f lavfi -i "flite=text='${cleanText}':voice=${isFemale ? 'slt' : 'kal'}" -ar 44100 -ac 2 "${dlgWav}"`);
          }
          if (fs.existsSync(dlgWav)) {
            dialogueAudioInputs.push({ file: dlgWav, delayMs: Math.round(dlg.startTime * 1000) });
          }
        }
        renderJob.progress = 75;

        // Base music track
        const defaultMusic = path.resolve(MUSIC_AUDIO_DIR, 'ambient_drone.mp3');
        const musicLevel = (settings?.audioMix?.musicLevel ?? 70) / 100;
        const dlgLevel = (settings?.audioMix?.dialogueLevel ?? 90) / 100;

        let audioFilter = '';
        const ffmpegAudioArgs: string[] = [];
        let inputIdx = 1;

        if (fs.existsSync(defaultMusic)) {
          ffmpegAudioArgs.push('-stream_loop', '-1', '-i', defaultMusic);
          audioFilter += `[${inputIdx}:a]atrim=0:${totalDuration},volume=${musicLevel}[mus];`;
          inputIdx++;
        }

        const dlgTags: string[] = [];
        for (let k = 0; k < dialogueAudioInputs.length; k++) {
          const item = dialogueAudioInputs[k];
          ffmpegAudioArgs.push('-i', item.file);
          audioFilter += `[${inputIdx}:a]adelay=${item.delayMs}|${item.delayMs},volume=${dlgLevel}[dlg${k}];`;
          dlgTags.push(`[dlg${k}]`);
          inputIdx++;
        }

        // Mix Foley Sound Effects (SFX)
        const sfxItems = project.sfxTracks || [];
        const sfxLevel = (settings?.audioMix?.sfxLevel ?? 80) / 100;
        const sfxTags: string[] = [];
        for (let s = 0; s < sfxItems.length; s++) {
          const item = sfxItems[s];
          let sfxCandidate: string | null = null;
          if (item.audioUrl) {
            const cand = path.resolve(__dirname, 'public', item.audioUrl.replace(/^\//, ''));
            if (fs.existsSync(cand)) sfxCandidate = cand;
          }
          if (!sfxCandidate && fs.existsSync(SFX_AUDIO_DIR)) {
            const sfxFiles = fs.readdirSync(SFX_AUDIO_DIR);
            if (sfxFiles.length > 0) {
              sfxCandidate = path.resolve(SFX_AUDIO_DIR, sfxFiles[s % sfxFiles.length]);
            }
          }
          if (sfxCandidate && fs.existsSync(sfxCandidate)) {
            ffmpegAudioArgs.push('-i', sfxCandidate);
            const delayMs = Math.round((item.startTime || 0) * 1000);
            audioFilter += `[${inputIdx}:a]adelay=${delayMs}|${delayMs},volume=${sfxLevel}[sfx${s}];`;
            sfxTags.push(`[sfx${s}]`);
            inputIdx++;
          }
        }

        let mixInputs = 0;
        let mixString = '';
        if (fs.existsSync(defaultMusic)) {
          mixString += '[mus]';
          mixInputs++;
        }
        dlgTags.forEach((tag) => {
          mixString += tag;
          mixInputs++;
        });
        sfxTags.forEach((tag) => {
          mixString += tag;
          mixInputs++;
        });

        if (mixInputs > 0) {
          audioFilter += `${mixString}amix=inputs=${mixInputs}:duration=first:dropout_transition=2[aout]`;
        }

        renderJob.progress = 85;

        // 4. Final Encode to MP4 Master
        let finalCmd = `ffmpeg -y -i "${assembledVideoPath}" ${ffmpegAudioArgs.map((a) => `"${a}"`).join(' ')} `;
        if (mixInputs > 0) {
          finalCmd += `-filter_complex "${audioFilter}" -map 0:v -map "[aout]" `;
        } else {
          finalCmd += `-f lavfi -i anullsrc=channel_layout=stereo:sample_rate=44100 -map 0:v -map 1:a `;
        }
        finalCmd += `-c:v libx264 -preset fast -pix_fmt yuv420p -c:a aac -b:a 192k -shortest "${finalMp4Path}"`;

        execSync(finalCmd);
        renderJob.progress = 95;

        // 5. Verify the generated MP4 file exists and has size > 0
        if (!fs.existsSync(finalMp4Path)) {
          throw new Error('Render output MP4 file was not generated.');
        }

        const stats = fs.statSync(finalMp4Path);
        if (stats.size === 0) {
          throw new Error('Rendered MP4 file is empty (0 bytes).');
        }

        let probedDuration = totalDuration;
        try {
          const probe = execSync(`ffprobe -v quiet -print_format json -show_format -show_streams "${finalMp4Path}"`).toString();
          const probeData = JSON.parse(probe);
          probedDuration = parseFloat(probeData.format?.duration || String(totalDuration));
        } catch (probeErr) {
          console.warn('ffprobe error:', probeErr);
        }

        renderJob.status = 'completed';
        renderJob.progress = 100;
        renderJob.completedAt = Date.now();
        renderJob.videoUrl = `/exports/${finalMp4Name}`;
        renderJob.downloadUrl = `/api/exports/${finalMp4Name}`;
        renderJob.fileSize = stats.size;
        renderJob.duration = Math.round(probedDuration * 10) / 10;
        renderJob.resolution = `${targetWidth}x${targetHeight}`;
        saveJobQueue();

        try {
          fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {}
      } catch (renderErr: any) {
        console.error('Render error:', renderErr);
        renderJob.status = 'failed';
        renderJob.error = renderErr.message || 'Render failed';
        saveJobQueue();
      }
    })();

    res.status(202).json({
      message: 'MP4 master rendering job started',
      jobId: renderJobId,
      status: 'processing',
      finalMp4Name,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Rendering failed' });
  }
});

/**
 * MP4 VALIDATION ENDPOINT
 * Validates container format, video/audio streams, duration, and frame decodability with ffprobe/ffmpeg.
 */
app.get('/api/exports/:filename/validate', (req: Request, res: Response) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.resolve(EXPORTS_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      valid: false,
      error: `Export file does not exist on disk: ${filename}`,
    });
  }

  const stats = fs.statSync(filePath);
  if (stats.size === 0) {
    return res.status(422).json({
      valid: false,
      error: 'Rendered MP4 file is empty (0 bytes).',
    });
  }

  try {
    const probeOutput = execSync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`
    ).toString();
    const probeData = JSON.parse(probeOutput);

    const formatName = probeData.format?.format_name || '';
    const isValidContainer = formatName.includes('mp4') || formatName.includes('mov');
    if (!isValidContainer) {
      return res.status(422).json({
        valid: false,
        error: `Invalid container format (${formatName}). Expected standard MP4 container.`,
      });
    }

    const streams = probeData.streams || [];
    const videoStream = streams.find((s: any) => s.codec_type === 'video');
    const audioStream = streams.find((s: any) => s.codec_type === 'audio');

    if (!videoStream) {
      return res.status(422).json({
        valid: false,
        error: 'No video stream found in the rendered MP4.',
      });
    }

    const validVideoCodecs = ['h264', 'hevc', 'vp9', 'av1', 'mpeg4'];
    if (!validVideoCodecs.includes(videoStream.codec_name?.toLowerCase())) {
      return res.status(422).json({
        valid: false,
        error: `Unexpected video codec: ${videoStream.codec_name}. Expected H.264 / AVC.`,
      });
    }

    // Verify video frame decodability by decoding the first frame
    try {
      execSync(`ffmpeg -v error -i "${filePath}" -vframes 1 -f null -`, { timeout: 5000 });
    } catch (decodeErr: any) {
      return res.status(422).json({
        valid: false,
        error: `Video stream failed decode verification: ${decodeErr.message}`,
      });
    }

    const duration = parseFloat(probeData.format?.duration || '0');

    return res.json({
      valid: true,
      filename,
      fileSize: stats.size,
      duration: Math.round(duration * 100) / 100,
      resolution: `${videoStream.width}x${videoStream.height}`,
      videoCodec: videoStream.codec_name,
      hasAudio: Boolean(audioStream),
      audioCodec: audioStream?.codec_name || 'none',
      audioChannels: audioStream?.channels || 0,
      sampleRate: audioStream?.sample_rate || '44100',
      playable: true,
    });
  } catch (err: any) {
    return res.status(500).json({
      valid: false,
      error: `MP4 probe validation failed: ${err.message}`,
    });
  }
});

/**
 * FILE DOWNLOAD ENDPOINT
 * Directly serves verified MP4 masters with strict Content-Type and Content-Disposition.
 * NEVER returns HTML under any condition.
 */
app.get('/api/exports/:filename', (req: Request, res: Response) => {
  const filename = path.basename(req.params.filename);
  if (!filename.toLowerCase().endsWith('.mp4')) {
    return res.status(400).type('application/json').json({ error: 'Only .mp4 master downloads are supported.' });
  }

  const filePath = path.resolve(EXPORTS_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).type('application/json').json({ error: 'Export file not found on disk.' });
  }

  const stats = fs.statSync(filePath);
  if (stats.size === 0) {
    return res.status(422).type('application/json').json({ error: 'Export file is empty (0 bytes).' });
  }

  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', stats.size);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  // Support range requests for smooth seeking and partial chunk downloads
  const range = req.headers.range;
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
    const chunksize = end - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stats.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    fs.createReadStream(filePath).pipe(res);
  }
});

/**
 * Video Rendering & Assembly Export Endpoint
 * Gukumira fake footage: Niba hari clip idakora, ntabwo irema video y'impimbano.
 */
app.post('/api/render', async (req: Request, res: Response) => {
  const { project, settings } = req.body;
  if (!project || !Array.isArray(project.clips)) {
    return res.status(400).json({ error: 'Valid project and clips array required.' });
  }

  const clips = project.clips;

  // 1. Validation: Genzura ko clips zose zarakozwe koko mbere yo gusohora film
  const ungeneratedClips = clips.filter((c: any) => 
    c.generationStatus !== 'completed' || 
    !c.videoUrl || 
    c.videoUrl.startsWith('procedural://')
  );

  if (ungeneratedClips.length > 0) {
    return res.status(400).json({
      status: 'validation_error',
      error: `Ntushobora gusohora filime: Hari clips ${ungeneratedClips.length} zitarakorwa na video AI. Nta fake video yemerewe gusohoka.`,
      pendingClipIds: ungeneratedClips.map((c: any) => c.clipId),
    });
  }

  // 2. Tanga Editing Metadata Packages (EDL, SRT, FCPXML)
  const fps = Number.isFinite(project.fps) && project.fps > 0 ? project.fps : 24;

  let edlContent = `TITLE: ${project.title.toUpperCase()}\nFCM: NON-DROP FRAME\n\n`;
  clips.forEach((clip: any, idx: number) => {
    const editNum = String(idx + 1).padStart(3, '0');
    edlContent += `${editNum}  AX       V     C        00:00:00:00 ${clip.timecode || '00:00:00:00'} ${clip.timecode || '00:00:00:00'} ${clip.timecode || '00:00:00:00'}\n`;
    edlContent += `* FROM CLIP NAME: ${clip.clipId}.mp4\n\n`;
  });

  let srtContent = '';
  (project.dialogueTracks || []).forEach((dlg: any, idx: number) => {
    const formatSrtTime = (s: number) => {
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = Math.floor(s % 60);
      const ms = Math.floor((s % 1) * 1000);
      const p = (n: number, z = 2) => String(n).padStart(z, '0');
      return `${p(h)}:${p(m)}:${p(sec)},${String(ms).padStart(3, '0')}`;
    };
    srtContent += `${idx + 1}\n${formatSrtTime(dlg.startTime)} --> ${formatSrtTime(dlg.startTime + dlg.duration)}\n${dlg.character}: ${dlg.text}\n\n`;
  });

  const fcpxml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
  <resources>
    <format id="r1" name="FFVideoFormat${settings?.resolution || '1080p'}" frameDuration="100/${fps * 100}s" width="1920" height="1080"/>
  </resources>
  <library>
    <event name="${project.title}">
      <project name="${project.title} - Master">
        <sequence format="r1" duration="${Math.round(project.actualAssembledDuration * fps)}/${fps}s">
          <spine>
            ${clips.map((c: any) => `<clip name="${c.clipId}" duration="${Math.round(c.duration * fps)}/${fps}s" start="0s"/>`).join('\n            ')}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>`;

  res.json({
    status: 'package_ready',
    message: 'Editing package na timeline byemejwe neza. Clips zose ni footage nyayo.',
    renderJobId: `render_${Date.now()}`,
    filmTitle: project.title,
    assembledDuration: project.actualAssembledDuration,
    clipsCount: clips.length,
    resolution: settings?.resolution || '1080p',
    aspectRatio: settings?.aspectRatio || '2.39:1',
    edl: edlContent,
    srt: srtContent,
    fcpxml,
    manifest: {
      generatedAt: new Date().toISOString(),
      sourceProject: project.id,
      tracks: {
        video: clips.length,
        dialogue: (project.dialogueTracks || []).length,
        sfx: project.sfxTracks?.length || 0,
        music: project.musicTracks?.length || 0,
      },
      exportSettings: settings,
    },
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = fs.existsSync(path.resolve(__dirname, 'index.html'))
      ? __dirname
      : path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.resolve(distPath, 'index.html')));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[M-b AI Film Studio] Online on port ${PORT} (0.0.0.0:${PORT}) | Gemini: ${GEMINI_MODEL}`);
  });
}

startServer();
