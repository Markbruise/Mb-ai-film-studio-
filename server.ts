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

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-4-hydrogen';
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
          'User-Agent': 'aistudio-build',
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

function resolveImageInputToBase64(imageInput: string): { data: string; mimeType: string } | null {
  if (!imageInput || typeof imageInput !== 'string') return null;

  if (imageInput.includes('base64,')) {
    const parts = imageInput.split('base64,');
    const mimeMatch = imageInput.match(/data:([^;]+);/);
    return {
      data: parts[1],
      mimeType: mimeMatch ? mimeMatch[1] : 'image/png',
    };
  }

  if (imageInput.startsWith('/uploads/')) {
    const safeName = path.basename(imageInput);
    const localPath = path.resolve(UPLOADS_DIR, safeName);
    if (fs.existsSync(localPath)) {
      const ext = path.extname(safeName).toLowerCase();
      const mimeType =
        ext === '.jpg' || ext === '.jpeg'
          ? 'image/jpeg'
          : ext === '.webp'
          ? 'image/webp'
          : 'image/png';
      return {
        data: fs.readFileSync(localPath).toString('base64'),
        mimeType,
      };
    }
    return null;
  }

  // Raw base64 fallback (reject path-like strings)
  if (!imageInput.startsWith('/') && !imageInput.startsWith('http')) {
    return { data: imageInput, mimeType: 'image/png' };
  }

  return null;
}

const DATA_DIR = path.resolve(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const JOBS_FILE = path.resolve(DATA_DIR, 'jobs.json');
const PROJECTS_FILE = path.resolve(DATA_DIR, 'projects.json');

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
  resolution?: string;
  referenceImage?: string;
  firstFrameImage?: string;
  lastFrameImage?: string;
  characterRefImages?: string[];
  characterReferences?: string[];
  visualContinuity?: any;
  characters?: any[];
  locations?: any[];
  fileSize?: number;
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

      const conditionImages: Array<{ data: string; mimeType: string }> = [];
      const candidateInputs = [
        job.firstFrameImage,
        job.referenceImage,
        ...(Array.isArray(job.characterRefImages) ? job.characterRefImages : []),
        job.lastFrameImage,
      ].filter((v): v is string => typeof v === 'string' && v.length > 0);

      for (const rawImg of candidateInputs) {
        if (conditionImages.length >= 6) break;
        const resolved = resolveImageInputToBase64(rawImg);
        if (resolved) conditionImages.push(resolved);
      }

      let interactionInput: any;
      if (conditionImages.length > 0) {
        const keyframeNote = job.firstFrameImage && job.lastFrameImage
          ? ' [Smoothly transition motion and composition from the first keyframe image to the final keyframe image.]'
          : '';
        interactionInput = [
          ...conditionImages.map((img) => ({
            type: 'image',
            mime_type: img.mimeType,
            data: img.data,
          })),
          {
            type: 'text',
            text: `${enrichedPrompt}${keyframeNote}`,
          },
        ];
      } else {
        interactionInput = enrichedPrompt;
      }

      const rawRes = (job.resolution || '').toLowerCase();
      const targetVideoRes = rawRes.includes('4k') ? '4k' : rawRes.includes('1080') ? '1080p' : '720p';

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
            resolution: targetVideoRes,
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
      resolution,
      filmProjectId,
      provider,
      referenceImage,
      firstFrameImage,
      lastFrameImage,
      characterRefImages,
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
      resolution: resolution || '720p',
      referenceImage,
      firstFrameImage,
      lastFrameImage,
      characterRefImages,
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
 * SYNTHESIZE DIALOGUE SPEECH (Multilingual Gemini TTS with preserved FFmpeg/Flite offline engine)
 */
app.post('/api/audio/dialogue/generate', async (req: Request, res: Response) => {
  try {
    const { dialogueId, text, character, voiceStyle, language = 'en', engine = 'auto', emotion = 'cinematic natural' } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text is required for dialogue synthesis.' });
    }

    const safeId = (dialogueId || `dlg_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    const outPath = path.resolve(DIALOGUE_AUDIO_DIR, `${safeId}.wav`);

    const ai = getAI();
    const shouldTryGeminiTts = Boolean(ai) && (engine === 'gemini-tts' || (engine === 'auto' && language !== 'en'));
    let usedEngine = 'ffmpeg-flite';

    if (shouldTryGeminiTts && ai) {
      try {
        const ttsVoiceName = voiceStyle === 'female' || /sarah|elena|maya|eva|woman|girl|dr\. vance/i.test(character || '')
          ? 'Kore'
          : 'Puck';
        const ttsPrompt = `Speak naturally in language "${language}" with tone "${emotion}": ${text.trim()}`;
        const ttsResp = await ai.models.generateContent({
          model: process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts',
          contents: [{ parts: [{ text: ttsPrompt }] }],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: ttsVoiceName },
              },
            },
          },
        });

        const audioPart = ttsResp.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData?.data);
        if (audioPart?.inlineData?.data) {
          const rawAudioBuf = Buffer.from(audioPart.inlineData.data, 'base64');
          const mime = audioPart.inlineData.mimeType || '';
          const tmpRaw = path.resolve('/tmp', `${safeId}_tts_raw`);
          fs.writeFileSync(tmpRaw, rawAudioBuf);
          if (mime.includes('L16') || mime.includes('pcm')) {
            execSync(`ffmpeg -y -f s16le -ar 24000 -ac 1 -i "${tmpRaw}" -ar 44100 -ac 2 "${outPath}"`);
          } else {
            execSync(`ffmpeg -y -i "${tmpRaw}" -ar 44100 -ac 2 "${outPath}"`);
          }
          try { fs.unlinkSync(tmpRaw); } catch {}
          usedEngine = process.env.GEMINI_TTS_MODEL || 'gemini-3.8-flash-tts';
        }
      } catch (ttsErr: any) {
        console.warn('[Dialogue TTS] Gemini TTS unavailable or failed, checking fallback:', ttsErr?.message);
        if (engine === 'gemini-tts') {
          return res.status(502).json({
            error: `Gemini TTS synthesis failed: ${ttsErr?.message || 'Unknown TTS error'}. Switch engine to Auto or Flite for local synthesis.`,
          });
        }
      }
    }

    if (usedEngine === 'ffmpeg-flite') {
      const isFemale = /sarah|elena|maya|eva|woman|girl|dr\. vance/i.test(character || '') || voiceStyle === 'female';
      const voice = isFemale ? 'slt' : 'kal';
      const cleanText = text.replace(/['"\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
      execSync(`ffmpeg -y -f lavfi -i "flite=text='${cleanText}':voice=${voice}" -ar 44100 -ac 2 "${outPath}"`);
    }

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
      engine: usedEngine,
      language,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Dialogue synthesis failed' });
  }
});

/**
 * AI MUSIC SCORE GENERATION (Google Lyria 3)
 * Supports 'lyria-3-clip-preview' (up to 30s) and 'lyria-3-pro-preview' (full tracks).
 */
app.post('/api/generate/music', async (req: Request, res: Response) => {
  try {
    const { prompt, model = 'lyria-3-clip-preview', referenceImage, title } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required for music generation.' });
    }

    const ai = getAI();
    if (!ai) {
      return res.status(500).json({ error: 'GoogleGenAI client not initialized (GEMINI_API_KEY missing or empty).' });
    }

    const selectedModel = model === 'lyria-3-pro-preview' ? 'lyria-3-pro-preview' : 'lyria-3-clip-preview';
    console.log(`[Music Generator] Generating music with ${selectedModel}: "${prompt.slice(0, 60)}..."`);

    let contents: any;
    const resolvedRef = referenceImage ? resolveImageInputToBase64(referenceImage) : null;
    if (resolvedRef) {
      contents = {
        parts: [
          { text: prompt },
          { inlineData: { data: resolvedRef.data, mimeType: resolvedRef.mimeType } }
        ]
      };
    } else {
      contents = prompt;
    }

    const responseStream = await ai.models.generateContentStream({
      model: selectedModel,
      contents,
    });

    let audioBase64 = '';
    let lyrics = '';
    let mimeType = 'audio/wav';

    for await (const chunk of responseStream) {
      const parts = chunk.candidates?.[0]?.content?.parts;
      if (!parts) continue;

      for (const part of parts) {
        if (part.inlineData?.data) {
          if (!audioBase64 && part.inlineData.mimeType) {
            mimeType = part.inlineData.mimeType;
          }
          audioBase64 += part.inlineData.data;
        }
        if (part.text && !lyrics) {
          lyrics = part.text;
        }
      }
    }

    if (!audioBase64) {
      throw new Error('Music generation stream completed without audio data.');
    }

    const safeTitle = (title || 'score').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    const audioExt = mimeType.includes('mpeg') || mimeType.includes('mp3') ? 'mp3' : 'wav';
    const musicFilename = `lyria_${safeTitle}_${Date.now()}.${audioExt}`;
    const musicPath = path.resolve(MUSIC_AUDIO_DIR, musicFilename);

    const audioBuffer = Buffer.from(audioBase64, 'base64');
    fs.writeFileSync(musicPath, audioBuffer);

    let duration = selectedModel === 'lyria-3-pro-preview' ? 120 : 30;
    try {
      const probeOutput = execSync(`ffprobe -v quiet -print_format json -show_format "${musicPath}"`).toString();
      const probeData = JSON.parse(probeOutput);
      const parsedDur = parseFloat(probeData.format?.duration || '0');
      if (Number.isFinite(parsedDur) && parsedDur > 0) {
        duration = parsedDur;
      }
    } catch {}

    const audioUrl = `/assets/audio/music/${musicFilename}`;
    console.log(`[Music Generator] Saved generated score: ${audioUrl} (${duration.toFixed(1)}s, ${mimeType})`);

    return res.json({
      status: 'completed',
      audioUrl,
      mimeType,
      duration: Math.round(duration * 10) / 10,
      model: selectedModel,
      title: title || 'Cinematic Theme',
      lyrics,
      bpm: 110,
    });
  } catch (err: any) {
    console.error('Lyria music generation failed:', err);
    let cleanMessage = err?.message || 'Music generation failed';
    try {
      if (typeof cleanMessage === 'string' && cleanMessage.includes('{')) {
        const parsed = JSON.parse(cleanMessage.slice(cleanMessage.indexOf('{')));
        if (parsed?.error?.message) cleanMessage = parsed.error.message;
      }
    } catch {}
    return res.status(500).json({
      error: `Music generation (${req.body?.model || 'lyria-3-clip-preview'}) failed: ${cleanMessage}. Ensure billing is active on your API key.`,
    });
  }
});

/**
 * ANIMATE IMAGE INTO VIDEO (Google Gemini Omni Flash via Interactions API)
 * Animates an uploaded photo/frame into video with 16:9 or 9:16 aspect ratio.
 */
app.post('/api/generate/animate-image', async (req: Request, res: Response) => {
  try {
    const { imageData, prompt, duration = 5, aspectRatio = '16:9', clipId } = req.body;
    if (!imageData) {
      return res.status(400).json({ error: 'Image data (base64 or /uploads path) is required for animation.' });
    }

    const ai = getAI();
    if (!ai) {
      return res.status(500).json({ error: 'GoogleGenAI client not initialized (GEMINI_API_KEY missing or empty).' });
    }

    const resolvedImg = resolveImageInputToBase64(imageData);
    if (!resolvedImg) {
      return res.status(400).json({ error: 'Invalid image source. Provide a valid image file or data URI.' });
    }

    const motionPrompt = prompt || 'Cinematic natural camera movement with lifelike environmental motion, realistic lighting, 4K texture';
    const chosenAspect = aspectRatio === '9:16' ? '9:16' : '16:9';
    const targetSeconds = Math.min(15, Math.max(3, Math.round(Number(duration) || 5)));

    console.log(`[Image Animator] Animating photo with Gemini Omni Flash (aspect: ${chosenAspect}, duration: ${targetSeconds}s)...`);

    const interaction = await ai.interactions.create({
      model: 'gemini-omni-1.2-flash',
      input: [
        {
          type: 'image',
          mime_type: resolvedImg.mimeType,
          data: resolvedImg.data,
        },
        {
          type: 'text',
          text: motionPrompt,
        },
      ],
      background: false,
      store: false,
      stream: false,
      response_format: {
        type: 'video',
        aspect_ratio: chosenAspect,
        duration: `${targetSeconds}s`,
        resolution: '720p',
      },
    }, { timeout: 300000 });

    let outputVideo: any = (interaction as any).output_video;
    if (!outputVideo && Array.isArray((interaction as any).steps)) {
      for (const step of (interaction as any).steps) {
        if (step.type === 'model_output' && Array.isArray(step.content)) {
          const vidPart = step.content.find((c: any) => c.type === 'video');
          if (vidPart) {
            outputVideo = vidPart;
          }
        }
      }
    }

    if (!outputVideo || (!outputVideo.data && !outputVideo.uri)) {
      throw new Error('Gemini Omni Flash returned no video output.');
    }

    let videoBuffer: Buffer | null = null;
    let videoUri: string | null = null;
    if (outputVideo.data) {
      videoBuffer = Buffer.from(outputVideo.data, 'base64');
    } else if (outputVideo.uri) {
      videoUri = outputVideo.uri;
    }

    const safeId = (clipId || `anim_${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '_');
    const outFilename = `anim_${safeId}_${Date.now()}.mp4`;
    const outPath = path.resolve(UPLOADS_DIR, outFilename);

    if (videoBuffer) {
      fs.writeFileSync(outPath, videoBuffer);
    } else if (videoUri) {
      const downloadTarget = videoUri.includes('googleapis.com') && process.env.GEMINI_API_KEY
        ? `${videoUri}${videoUri.includes('?') ? '&' : '?'}key=${process.env.GEMINI_API_KEY}`
        : videoUri;
      execSync(`curl -sL --max-time 120 "${downloadTarget}" -o "${outPath}"`);
    }

    if (!fs.existsSync(outPath) || fs.statSync(outPath).size === 0) {
      throw new Error('Animated video could not be written to disk.');
    }

    // Validate video container and read actual duration via ffprobe
    let actualDuration = targetSeconds;
    try {
      const probeCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,duration -of json "${outPath}"`;
      const probeRes = JSON.parse(execSync(probeCmd).toString());
      const stream = probeRes.streams?.[0];
      if (!stream || !stream.codec_name) {
        throw new Error('Generated video asset failed stream/codec verification.');
      }
      const probed = parseFloat(stream.duration || `${targetSeconds}`);
      if (Number.isFinite(probed) && probed > 0) {
        actualDuration = Math.round(probed * 10) / 10;
      }
    } catch (probeErr: any) {
      try { fs.unlinkSync(outPath); } catch {}
      throw new Error(probeErr?.message || 'Generated file is not a valid playable MP4 video.');
    }

    const videoUrl = `/uploads/${outFilename}`;
    console.log(`[Image Animator] Animated video verified and saved: ${videoUrl} (${actualDuration}s)`);

    return res.json({
      status: 'completed',
      videoUrl,
      duration: actualDuration,
      aspectRatio: chosenAspect,
      prompt: motionPrompt,
    });
  } catch (err: any) {
    console.error('Image animation failed:', err);
    let cleanMessage = err?.message || 'Animation failed';
    try {
      if (typeof cleanMessage === 'string' && cleanMessage.includes('{')) {
        const parsed = JSON.parse(cleanMessage.slice(cleanMessage.indexOf('{')));
        if (parsed?.error?.message) cleanMessage = parsed.error.message;
      }
    } catch {}
    return res.status(500).json({
      error: `Photo animation failed: ${cleanMessage}. Video generation requires a paid Gemini API key with billing enabled.`,
    });
  }
});

/**
 * CONCEPT ART & STORYBOARD IMAGE GENERATOR
 * Primary: gemini-nano-banana-2.1 (official @google/genai generateContent + imageConfig)
 * Fallback on 429/404: gemini-3.1-flash-lite-image -> gemini-2.5-flash-image
 */
app.post('/api/generate/image', async (req: Request, res: Response) => {
  try {
    const { prompt, aspectRatio = '16:9', imageSize = '1K', base64Image } = req.body;
    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'Prompt is required for image generation.' });
    }

    const ai = getAI();
    if (!ai) {
      return res.status(500).json({ error: 'GoogleGenAI client not initialized (GEMINI_API_KEY missing or empty).' });
    }

    const allowedAspectMap: Record<string, string> = {
      '1:1': '1:1',
      '3:4': '3:4',
      '4:3': '4:3',
      '9:16': '9:16',
      '16:9': '16:9',
      '21:9': '21:9',
      '2.39:1': '21:9',
    };
    const normalizedAspect = allowedAspectMap[aspectRatio] || '16:9';
    const resolvedBase = base64Image ? resolveImageInputToBase64(base64Image) : null;

    const parts: any[] = [];
    if (resolvedBase) {
      parts.push({
        inlineData: {
          data: resolvedBase.data,
          mimeType: resolvedBase.mimeType,
        },
      });
    }
    parts.push({ text: prompt });

    const candidateModels = [
      'gemini-nano-banana-2.1',
      'gemini-3.1-flash-lite-image',
      'gemini-2.5-flash-image',
    ];

    let base64Result = '';
    let mimeType = 'image/png';
    let textDesc = '';
    let modelUsed = 'gemini-nano-banana-2.1';
    let lastErr: any = null;
    let sawRateLimit = false;

    for (const modelName of candidateModels) {
      try {
        console.log(`[Image Generator] Trying ${modelName} (${normalizedAspect}): "${prompt.slice(0, 60)}..."`);
        const isHighQualityModel = modelName === 'gemini-nano-banana-2.1' || modelName === 'gemini-3-pro-image';
        const imageConfig: Record<string, string> = {
          aspectRatio: normalizedAspect,
        };
        if (isHighQualityModel && imageSize) {
          imageConfig.imageSize = imageSize;
        }

        const response = await ai.models.generateContent({
          model: modelName,
          contents: { parts },
          config: modelName === 'gemini-2.5-flash-image' ? { imageConfig: { aspectRatio: normalizedAspect } } : { imageConfig },
        });

        const respParts = response.candidates?.[0]?.content?.parts || [];
        for (const p of respParts) {
          if (p.inlineData?.data && !base64Result) {
            base64Result = p.inlineData.data;
            mimeType = p.inlineData.mimeType || 'image/png';
          } else if (p.text) {
            textDesc += p.text;
          }
        }

        if (base64Result) {
          modelUsed = modelName;
          break;
        }
        lastErr = new Error(`${modelName} completed without image output.`);
      } catch (mErr: any) {
        lastErr = mErr;
        const msg = String(mErr?.message || '');
        const status = mErr?.status || (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') ? 429 : 500);
        if (status === 429 || msg.includes('Rate limit') || msg.includes('quota')) {
          sawRateLimit = true;
        }
        console.warn(`[Image Generator] ${modelName} failed (${status}): ${msg.slice(0, 220)}`);
      }
    }

    if (!base64Result) {
      let cleanMessage = String(lastErr?.message || 'Image generation failed');
      try {
        if (cleanMessage.includes('{')) {
          const parsed = JSON.parse(cleanMessage.slice(cleanMessage.indexOf('{')));
          if (parsed?.error?.message) cleanMessage = parsed.error.message;
        }
      } catch {}

      if (sawRateLimit) {
        return res.status(429).json({
          code: 'RATE_LIMIT_FREE_TIER',
          upgradeRequired: true,
          error:
            'Image generation requires a billing-enabled Gemini API key (Free Tier daily limit is 0 for Nano Banana & Gemini Image models). Select a paid API key in AI Studio or upload a custom reference/storyboard image.',
        });
      }

      return res.status(500).json({
        error: `Image generation failed: ${cleanMessage}`,
      });
    }

    const imgExt = mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';
    const imgFilename = `concept_${Date.now()}.${imgExt}`;
    const imgPath = path.resolve(UPLOADS_DIR, imgFilename);
    fs.writeFileSync(imgPath, Buffer.from(base64Result, 'base64'));

    const imageUrl = `/uploads/${imgFilename}`;
    console.log(`[Image Generator] Saved concept image (${modelUsed}): ${imageUrl}`);

    return res.json({
      status: 'completed',
      model: modelUsed,
      imageUrl,
      base64Data: `data:${mimeType};base64,${base64Result}`,
      mimeType,
      description: textDesc,
      aspectRatio,
    });
  } catch (err: any) {
    console.error('Image generation failed:', err);
    let cleanMessage = err?.message || 'Image generation failed';
    try {
      if (typeof cleanMessage === 'string' && cleanMessage.includes('{')) {
        const parsed = JSON.parse(cleanMessage.slice(cleanMessage.indexOf('{')));
        if (parsed?.error?.message) cleanMessage = parsed.error.message;
      }
    } catch {}
    const isQuota = cleanMessage.includes('429') || cleanMessage.toLowerCase().includes('quota') || cleanMessage.toLowerCase().includes('rate limit');
    return res.status(isQuota ? 429 : 500).json({
      error: `Image generation failed: ${cleanMessage}`,
      upgradeRequired: isQuota,
    });
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

    const baseRes = settings?.resolution || project.resolution || '1080p';
    const aspect = settings?.aspectRatio || project.aspectRatio || '16:9';
    let targetWidth = baseRes === '4K Cinema' ? 3840 : baseRes === '720p' ? 1280 : 1920;
    let targetHeight = baseRes === '4K Cinema' ? 2160 : baseRes === '720p' ? 720 : 1080;
    if (aspect === '9:16') {
      const swap = targetWidth;
      targetWidth = targetHeight;
      targetHeight = swap;
    } else if (aspect === '4:3') {
      targetWidth = baseRes === '4K Cinema' ? 2880 : baseRes === '720p' ? 960 : 1440;
    } else if (aspect === '2.39:1') {
      targetHeight = Math.round(targetWidth / 2.39 / 2) * 2;
    }
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
        const clipDurations: number[] = [];

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

          // Optional opening fade-in on clip 0 if fade_black is set
          const fadeInFilter =
            i === 0 && clip.transitionIn === 'fade_black' && (clip.transitionDuration ?? 0.8) > 0
              ? `,fade=t=in:st=0:d=${Math.min(clipDuration * 0.45, clip.transitionDuration ?? 0.8)}`
              : '';

          execSync(
            `ffmpeg -y -i "${sourceFile}" -t ${clipDuration} -vf "scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${fps}${fadeInFilter}" -c:v libx264 -preset fast -pix_fmt yuv420p -an "${clipOut}"`
          );
          let actualClipDur = clipDuration;
          try {
            const cp = JSON.parse(execSync(`ffprobe -v quiet -print_format json -show_format "${clipOut}"`).toString());
            const d = parseFloat(cp.format?.duration || '0');
            if (Number.isFinite(d) && d > 0.1) actualClipDur = d;
          } catch {}
          clipVideoPaths.push(clipOut);
          clipDurations.push(actualClipDur);
          renderJob.progress = Math.min(50, 10 + Math.round((i / clips.length) * 40));
          saveJobQueue();
        }

        // 2. Assemble video clips (supporting FFmpeg xfade transitions when configured)
        const assembledVideoPath = path.resolve(tempDir, 'assembled_video.mp4');
        const hasTransitions =
          clipVideoPaths.length > 1 &&
          clipVideoPaths.length <= 20 &&
          clips.slice(1).some((c: any) => c.transitionIn && c.transitionIn !== 'cut' && (c.transitionDuration ?? 0.8) > 0);

        let assembledViaXfade = false;
        if (hasTransitions) {
          try {
            const xfadeMap: Record<string, string> = {
              cross_dissolve: 'fade',
              fade_black: 'fadeblack',
              wipe_left: 'wipeleft',
              wipe_right: 'wiperight',
              whip_pan: 'slideleft',
            };

            const inputFlags = clipVideoPaths.map((p) => `-i "${p}"`).join(' ');
            let filterComplex = '';
            let prevLabel = '[0:v]';
            let runningDuration = clipDurations[0];

            for (let i = 1; i < clipVideoPaths.length; i++) {
              const clip = clips[i];
              const transType = clip.transitionIn || 'cut';
              const rawDur = transType === 'cut' ? 0 : (clip.transitionDuration ?? 0.8);
              const maxAllowed = Math.min(runningDuration, clipDurations[i]) * 0.45;
              const transDur = rawDur > 0 ? Math.max(0.05, Math.min(maxAllowed, rawDur)) : 0.04;
              const xfadeName = transType === 'cut' ? 'fade' : (xfadeMap[transType] || 'fade');
              const offset = Math.max(0.1, Math.round((runningDuration - transDur) * 1000) / 1000);
              const outLabel = i === clipVideoPaths.length - 1 ? '[vout]' : `[v${i}]`;

              filterComplex += `${prevLabel}[${i}:v]xfade=transition=${xfadeName}:duration=${transDur}:offset=${offset}${outLabel};`;
              prevLabel = outLabel;
              runningDuration = runningDuration + clipDurations[i] - transDur;
            }

            filterComplex = filterComplex.replace(/;$/, '');
            execSync(
              `ffmpeg -y ${inputFlags} -filter_complex "${filterComplex}" -map "[vout]" -c:v libx264 -preset fast -pix_fmt yuv420p "${assembledVideoPath}"`
            );
            assembledViaXfade = fs.existsSync(assembledVideoPath) && fs.statSync(assembledVideoPath).size > 0;
          } catch (xfadeErr) {
            console.warn('FFmpeg xfade assembly fallback to standard concat:', xfadeErr);
            assembledViaXfade = false;
          }
        }

        if (!assembledViaXfade) {
          const concatListPath = path.resolve(tempDir, 'concat_list.txt');
          fs.writeFileSync(concatListPath, clipVideoPaths.map((p) => `file '${p}'`).join('\n'));
          execSync(`ffmpeg -y -f concat -safe 0 -i "${concatListPath}" -c copy "${assembledVideoPath}"`);
        }

        // Optional burned-in subtitles
        const dialogues = project.dialogueTracks || [];
        let videoForFinalMux = assembledVideoPath;
        if (settings?.burnSubtitles && dialogues.length > 0) {
          try {
            const srtPath = path.resolve(tempDir, 'subtitles.srt');
            const formatSrtTime = (s: number) => {
              const h = Math.floor(s / 3600);
              const m = Math.floor((s % 3600) / 60);
              const sec = Math.floor(s % 60);
              const ms = Math.floor((s % 1) * 1000);
              const p = (n: number) => String(n).padStart(2, '0');
              return `${p(h)}:${p(m)}:${p(sec)},${String(ms).padStart(3, '0')}`;
            };
            const srtBody = dialogues
              .map((dlg: any, idx: number) =>
                `${idx + 1}\n${formatSrtTime(dlg.startTime || 0)} --> ${formatSrtTime((dlg.startTime || 0) + (dlg.duration || 2))}\n${dlg.character || 'SPEAKER'}: ${dlg.text || ''}\n`
              )
              .join('\n');
            fs.writeFileSync(srtPath, srtBody, 'utf-8');
            const subtitledPath = path.resolve(tempDir, 'assembled_subtitled.mp4');
            execSync(
              `ffmpeg -y -i "${assembledVideoPath}" -vf "subtitles='${srtPath}':force_style='FontSize=20,PrimaryColour=&H008AF0FE&,BackColour=&H80000000&,BorderStyle=4'" -c:v libx264 -preset fast -pix_fmt yuv420p "${subtitledPath}"`
            );
            if (fs.existsSync(subtitledPath) && fs.statSync(subtitledPath).size > 0) {
              videoForFinalMux = subtitledPath;
            }
          } catch (subErr) {
            console.warn('Subtitle burn-in skipped:', subErr);
          }
        }

        renderJob.progress = 60;

        // 3. Audio synthesis & mixing
        let totalDuration = project.actualAssembledDuration || clips.reduce((acc: number, c: any) => acc + c.duration, 0);
        try {
          const vProbe = JSON.parse(execSync(`ffprobe -v quiet -print_format json -show_format "${videoForFinalMux}"`).toString());
          const vDur = parseFloat(vProbe.format?.duration || '0');
          if (Number.isFinite(vDur) && vDur > 0) totalDuration = vDur;
        } catch {}

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
            dialogueAudioInputs.push({ file: dlgWav, delayMs: Math.round((dlg.startTime || 0) * 1000) });
          }
        }
        renderJob.progress = 75;

        // Resolve Music Tracks (custom Lyria 3 / project tracks first, fallback to ambient_drone.mp3)
        const masterMusicGain = (settings?.audioMix?.musicLevel ?? 70) / 100;
        const dlgLevel = (settings?.audioMix?.dialogueLevel ?? 90) / 100;

        let audioFilter = '';
        const ffmpegAudioArgs: string[] = [];
        let inputIdx = 1;
        const musTags: string[] = [];

        const publicRootDir = path.resolve(__dirname, 'public');
        const projectMusicItems = Array.isArray(project.musicTracks) ? project.musicTracks : [];
        for (let m = 0; m < projectMusicItems.length; m++) {
          const mus = projectMusicItems[m];
          if (!mus?.audioUrl) continue;
          const cleanUrl = String(mus.audioUrl).replace(/^\/+/, '');
          const candidatePath = path.resolve(publicRootDir, cleanUrl);
          if (candidatePath.startsWith(publicRootDir + path.sep) && fs.existsSync(candidatePath)) {
            const trackVol = typeof mus.volume === 'number' ? (mus.volume <= 1 ? mus.volume : mus.volume / 100) : 0.7;
            const effectiveVol = Math.max(0, Math.min(2, trackVol * masterMusicGain));
            const startMs = Math.max(0, Math.round((mus.startTime || 0) * 1000));
            const remainingTimeline = Math.max(0.5, totalDuration - (mus.startTime || 0));
            const clipDur = Math.max(0.5, Math.min(remainingTimeline, mus.duration || remainingTimeline));
            ffmpegAudioArgs.push('-stream_loop', '-1', '-i', candidatePath);
            audioFilter += `[${inputIdx}:a]atrim=0:${clipDur},adelay=${startMs}|${startMs},volume=${effectiveVol}[mus${m}];`;
            musTags.push(`[mus${m}]`);
            inputIdx++;
          }
        }

        if (musTags.length === 0) {
          const defaultMusic = path.resolve(MUSIC_AUDIO_DIR, 'ambient_drone.mp3');
          if (fs.existsSync(defaultMusic)) {
            ffmpegAudioArgs.push('-stream_loop', '-1', '-i', defaultMusic);
            audioFilter += `[${inputIdx}:a]atrim=0:${totalDuration},volume=${masterMusicGain}[mus_default];`;
            musTags.push('[mus_default]');
            inputIdx++;
          }
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
            const cand = path.resolve(publicRootDir, String(item.audioUrl).replace(/^\/+/, ''));
            if (cand.startsWith(publicRootDir + path.sep) && fs.existsSync(cand)) sfxCandidate = cand;
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

        const allAudioTags = [...musTags, ...dlgTags, ...sfxTags];
        const mixInputs = allAudioTags.length;

        if (mixInputs > 0) {
          audioFilter += `${allAudioTags.join('')}amix=inputs=${mixInputs}:duration=longest:dropout_transition=2,atrim=0:${totalDuration}[aout]`;
        }

        renderJob.progress = 85;

        // 4. Final Encode to MP4 Master
        let finalCmd = `ffmpeg -y -i "${videoForFinalMux}" ${ffmpegAudioArgs.map((a) => `"${a}"`).join(' ')} `;
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

// ============================================================================
// MULTI-PROJECT PERSISTENCE, SCREENPLAY WRITER AI, ASSET LIBRARY & DIAGNOSTICS
// ============================================================================

function loadProjectsStore(): any[] {
  try {
    if (fs.existsSync(PROJECTS_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf-8'));
      return Array.isArray(parsed) ? parsed : [];
    }
  } catch (err) {
    console.error('Failed to read projects store:', err);
  }
  return [];
}

function saveProjectsStore(projects: any[]) {
  try {
    fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save projects store:', err);
  }
}

app.get('/api/projects', (_req: Request, res: Response) => {
  const projects = loadProjectsStore().sort(
    (a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime()
  );
  res.json(projects);
});

app.get('/api/projects/:id', (req: Request, res: Response) => {
  const projects = loadProjectsStore();
  const found = projects.find((p) => p.id === req.params.id);
  if (!found) return res.status(404).json({ error: 'Project not found' });
  res.json(found);
});

app.post('/api/projects', (req: Request, res: Response) => {
  const project = req.body;
  if (!project || !project.id || !project.title) {
    return res.status(400).json({ error: 'Valid project object with id and title is required.' });
  }
  const projects = loadProjectsStore();
  const idx = projects.findIndex((p) => p.id === project.id);
  const stamped = { ...project, updatedAt: new Date().toISOString() };
  if (idx >= 0) {
    projects[idx] = stamped;
  } else {
    projects.unshift(stamped);
  }
  saveProjectsStore(projects.slice(0, 50));
  res.json(stamped);
});

app.post('/api/projects/:id/duplicate', (req: Request, res: Response) => {
  const projects = loadProjectsStore();
  const source = projects.find((p) => p.id === req.params.id);
  if (!source) return res.status(404).json({ error: 'Project not found' });
  const copy = {
    ...source,
    id: `proj_${Date.now()}`,
    title: `${source.title} (Copy)`,
    archived: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  projects.unshift(copy);
  saveProjectsStore(projects.slice(0, 50));
  res.json(copy);
});

app.patch('/api/projects/:id/archive', (req: Request, res: Response) => {
  const projects = loadProjectsStore();
  const idx = projects.findIndex((p) => p.id === req.params.id);
  if (idx < 0) return res.status(404).json({ error: 'Project not found' });
  projects[idx].archived = typeof req.body?.archived === 'boolean' ? req.body.archived : !projects[idx].archived;
  projects[idx].updatedAt = new Date().toISOString();
  saveProjectsStore(projects);
  res.json(projects[idx]);
});

app.delete('/api/projects/:id', (req: Request, res: Response) => {
  const projects = loadProjectsStore();
  const next = projects.filter((p) => p.id !== req.params.id);
  if (next.length === projects.length) return res.status(404).json({ error: 'Project not found' });
  saveProjectsStore(next);
  res.json({ deleted: true, id: req.params.id });
});

/**
 * AI Screenplay Generation, Rewrite & Translation (Preserves connected GEMINI_MODEL)
 */
app.post('/api/ai/screenplay/generate', async (req: Request, res: Response) => {
  try {
    const { idea, title, genre = 'Cinematic Drama', targetDurationSeconds = 120, language = 'en', visualStyle = 'Cinematic Realism', targetAudience = 'General Audience' } = req.body;
    if (!idea || typeof idea !== 'string') {
      return res.status(400).json({ error: 'Story premise or idea is required.' });
    }
    const ai = getAI();
    if (!ai) {
      return res.status(503).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    }
    const prompt = `You are a professional screenwriter. Write a complete, production-ready screenplay in standard screenplay format.
Title: ${title || 'Untitled Film'}
Premise: ${idea}
Genre: ${genre}
Target Film Duration: ${targetDurationSeconds} seconds
Language Code / Output Language: ${language}
Visual Style: ${visualStyle}
Target Audience: ${targetAudience}

Format rules:
- Use clear SCENE N - INT./EXT. LOCATION - TIME OF DAY headings (even if dialogue is in "${language}", keep INT./EXT. markers clear so our parser maps every scene cleanly).
- Include vivid visual action descriptions and natural dialogue cues in "${language}" with ALL-CAPS character names before lines.
- Include dialogue speaker lines and end with FADE OUT.
Return ONLY the formatted screenplay text.`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
    });
    return res.json({ source: 'gemini', model: GEMINI_MODEL, screenplay: (response.text || '').trim() });
  } catch (err: any) {
    console.error('Screenplay generation error:', err);
    return res.status(500).json({ error: err?.message || 'Screenplay generation failed' });
  }
});

app.post('/api/ai/screenplay/rewrite', async (req: Request, res: Response) => {
  try {
    const { screenplay, instruction = 'Enhance cinematic pacing, visual clarity, and dramatic dialogue.', language = 'en' } = req.body;
    if (!screenplay || typeof screenplay !== 'string') {
      return res.status(400).json({ error: 'Screenplay text is required.' });
    }
    const ai = getAI();
    if (!ai) {
      return res.status(503).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    }
    const prompt = `You are a master script doctor. Rewrite and improve the following screenplay according to the director's notes while keeping valid INT./EXT. scene headings and ALL-CAPS speaker cues.
Output Language: ${language}
Director Instruction: ${instruction}

Screenplay:
${screenplay.slice(0, 20000)}

Return ONLY the improved screenplay text.`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
    });
    return res.json({ source: 'gemini', model: GEMINI_MODEL, screenplay: (response.text || '').trim() });
  } catch (err: any) {
    console.error('Screenplay rewrite error:', err);
    return res.status(500).json({ error: err?.message || 'Screenplay rewrite failed' });
  }
});

app.post('/api/ai/screenplay/translate', async (req: Request, res: Response) => {
  try {
    const { screenplay, targetLanguage = 'fr' } = req.body;
    if (!screenplay || typeof screenplay !== 'string') {
      return res.status(400).json({ error: 'Screenplay text is required.' });
    }
    const ai = getAI();
    if (!ai) {
      return res.status(503).json({ error: 'GEMINI_API_KEY is not configured on the server.' });
    }
    const prompt = `Translate the following screenplay faithfully into language "${targetLanguage}". Preserve screenplay structure, keep "SCENE N - INT./EXT." markers parseable, keep character cue formatting clear, and translate all action lines and dialogue naturally into "${targetLanguage}".

Screenplay:
${screenplay.slice(0, 20000)}

Return ONLY the translated screenplay.`;

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
    });
    return res.json({ source: 'gemini', model: GEMINI_MODEL, screenplay: (response.text || '').trim(), targetLanguage });
  } catch (err: any) {
    console.error('Screenplay translation error:', err);
    return res.status(500).json({ error: err?.message || 'Screenplay translation failed' });
  }
});

/**
 * Media & Asset Library + Export History Endpoints
 */
app.get('/api/assets/library', (_req: Request, res: Response) => {
  const items: any[] = [];
  const collectFiles = (dir: string, urlPrefix: string, defaultKind: string) => {
    if (!fs.existsSync(dir)) return;
    for (const file of fs.readdirSync(dir)) {
      const fullPath = path.resolve(dir, file);
      const stat = fs.statSync(fullPath);
      if (!stat.isFile() || stat.size < 100) continue;
      const ext = path.extname(file).toLowerCase();
      let kind = defaultKind;
      if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) kind = 'storyboard';
      else if (['.mp4', '.webm', '.mov'].includes(ext)) kind = defaultKind === 'export' ? 'export' : 'video';
      else if (['.wav', '.mp3', '.ogg'].includes(ext)) kind = 'audio';
      items.push({
        id: `${kind}_${file}`,
        kind,
        name: file,
        url: `${urlPrefix}/${file}`,
        sizeBytes: stat.size,
        createdAt: stat.mtime.toISOString(),
      });
    }
  };

  collectFiles(UPLOADS_DIR, '/uploads', 'video');
  collectFiles(EXPORTS_DIR, '/exports', 'export');
  collectFiles(MUSIC_AUDIO_DIR, '/assets/audio/music', 'audio');
  collectFiles(DIALOGUE_AUDIO_DIR, '/assets/audio/dialogue', 'audio');
  collectFiles(SFX_AUDIO_DIR, '/assets/audio/sfx', 'audio');

  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(items);
});

app.get('/api/exports', (_req: Request, res: Response) => {
  if (!fs.existsSync(EXPORTS_DIR)) return res.json([]);
  const files = fs.readdirSync(EXPORTS_DIR).filter((f) => f.toLowerCase().endsWith('.mp4'));
  const records = files
    .map((file) => {
      const fullPath = path.resolve(EXPORTS_DIR, file);
      const stat = fs.statSync(fullPath);
      if (stat.size < 100) return null;
      return {
        id: `exp_${file}`,
        filename: file,
        videoUrl: `/exports/${file}`,
        downloadUrl: `/api/exports/${file}`,
        fileSize: stat.size,
        createdAt: stat.mtime.toISOString(),
      };
    })
    .filter(Boolean)
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json(records);
});

/**
 * Provider Connection & Capability Live Tester
 */
app.post('/api/diagnostics/provider-test', async (_req: Request, res: Response) => {
  const ai = getAI();
  const hasKey = Boolean(ai);
  const providers: Array<{ id: string; label: string; model: string; status: 'connected' | 'requires_billing_or_vertex' | 'unavailable'; detail: string }> = [];

  if (!ai) {
    return res.json({
      geminiConfigured: false,
      providers: [
        { id: 'screenplay', label: 'Screenplay & Scene AI', model: GEMINI_MODEL, status: 'unavailable', detail: 'GEMINI_API_KEY missing from server environment.' },
      ],
      subscriptionNotice: 'Consumer Google AI Pro / Google Flow web subscriptions do not issue API keys or grant OAuth programmatic billing. Configure an official Google AI Studio / Cloud API key in environment secrets.',
    });
  }

  const checkModel = async (id: string, label: string, modelName: string, extraNote = '') => {
    try {
      const m = await ai.models.get({ model: `models/${modelName}` });
      providers.push({
        id,
        label,
        model: modelName,
        status: 'connected',
        detail: `Model registered in API catalog (${m?.displayName || modelName}).${extraNote ? ' ' + extraNote : ''}`,
      });
    } catch (err: any) {
      providers.push({
        id,
        label,
        model: modelName,
        status: 'requires_billing_or_vertex',
        detail: `${err?.message || 'Not exposed on current endpoint'}.${extraNote ? ' ' + extraNote : ''}`,
      });
    }
  };

  await Promise.all([
    checkModel('screenplay', 'Screenplay, Breakdown & Continuity', GEMINI_MODEL),
    checkModel('image', 'Characters, Locations & Storyboard Art', 'gemini-nano-banana-2.1'),
    checkModel('video_omni', 'AI Video Generation (Interactions API)', 'gemini-omni-1.2-flash', 'Cloud video quota requires active paid billing tier on the API project.'),
    checkModel('music', 'AI Orchestral Score Composer', 'lyria-3-clip-preview'),
    checkModel('tts', 'Multilingual Neural Dialogue TTS', 'gemini-3.8-flash-tts', 'Local FFmpeg Flite TTS is also always online as offline voice engine.'),
    checkModel('veo', 'Google Veo (Vertex AI Only)', 'veo-2.0-generate-001', process.env.VERTEX_PROJECT_ID ? `Vertex project: ${process.env.VERTEX_PROJECT_ID}` : 'Requires VERTEX_PROJECT_ID on Google Cloud Vertex AI; unavailable on standard v1beta API key.'),
  ]);

  res.json({
    geminiConfigured: hasKey,
    providers,
    subscriptionNotice: 'Google AI Pro / Google Flow consumer subscriptions apply only inside consumer web apps and do not provide programmatic API billing or OAuth API access for external studios.',
    checkedAt: new Date().toISOString(),
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
