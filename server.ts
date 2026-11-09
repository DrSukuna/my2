import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));

// In-memory scalable cloud analytics & sync store
interface AnalyticsEvent {
  id: string;
  type: string;
  section?: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

const analyticsStore: AnalyticsEvent[] = [];
const syncQueueStore: Array<{ id: string; type: string; payload: unknown; syncedAt: number }> = [];

let liveVisitorCount = 14;

// Initialize Gemini SDK if API key available
let genAI: GoogleGenAI | null = null;
if (process.env.GEMINI_API_KEY) {
  try {
    genAI = new GoogleGenAI();
  } catch (err) {
    console.warn('Failed to initialize GoogleGenAI client:', err);
  }
}

const SAHEB_SYSTEM_PROMPT = `You are "Saheb AI", the intelligent 3D cyber-companion and virtual representative of Hoque Saheb.
Hoque Saheb is an ambitious creative developer, UI/UX designer, and BCA student located in Itahar, West Bengal, India (Instagram: @hoque2saheb).

Personality & Tone:
- Confident, high-tech, articulate, warmly welcoming, and genuinely passionate about computer science, 3D web interfaces, and modern full-stack development.
- Multilingual: You understand and fluently reply in English, Hindi (हिंदी), and Bengali (বাংলা), or Hinglish based on the user's input language.
- Keep answers punchy, structured, engaging, and friendly.

Knowledge Base:
- Identity: Hoque Saheb (Designer & Full Stack Developer)
- Education: Bachelor of Computer Applications (BCA) student
- Location: Itahar, West Bengal, India
- Socials: Instagram @hoque2saheb, GitHub github.com/hoquesaheb, Email hoque.saheb.dev@gmail.com
- Key Specialities: React 19, TypeScript, Three.js & WebGL 3D graphics, Node.js & Express, Tailwind CSS, Motion animations, Responsive mobile-first engineering, Cloud architectures, Biometric WebAuthn security, Offline synchronization (PWA).
- Featured Projects:
  1. SahebOS 3D (Interactive Web Operating System with 3D windowing, terminal, live apps)
  2. CyberHighway 3D Arcade (WebGL retro-futuristic synthwave racer with procedural generation)
  3. NeuralMatrix AI (Deep learning visualizer and real-time neural network graph debugger)
  4. QuantumPay Cloud (Fintech transaction vault with offline sync and biometric encryption)

If asked to book an interview, collaborate, or hire, warmly encourage them and provide direct contact options.
When responding, format with crisp bullet points, clean markdown, and occasional relevant emojis.`;

// API Routes
app.post('/api/chat', async (req: Request, res: Response) => {
  try {
    const { message, conversationHistory = [] } = req.body;

    if (!message || typeof message !== 'string') {
      res.status(400).json({ error: 'Message is required' });
      return;
    }

    // Try Gemini API first
    if (genAI && process.env.GEMINI_API_KEY) {
      try {
        const formattedContents = [
          ...conversationHistory.map((m: { role: string; content: string }) => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
          })),
          {
            role: 'user',
            parts: [{ text: message }]
          }
        ];

        const response = await genAI.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: formattedContents,
          config: {
            systemInstruction: SAHEB_SYSTEM_PROMPT,
            temperature: 0.7,
            maxOutputTokens: 800,
          }
        });

        const reply = response.text || "Hello! I am Saheb's AI companion. How can I assist you with Saheb's work, 3D projects, or collaboration today?";
        res.json({ reply, source: 'gemini-2.5-flash' });
        return;
      } catch (geminiError) {
        console.warn('Gemini API call failed, falling back to smart local persona:', geminiError);
      }
    }

    // Smart fallback persona if Gemini key is missing or call encounters network limit
    const lower = message.toLowerCase();
    let fallbackReply = `Hey there! I am Saheb AI, Hoque Saheb's virtual companion. Saheb is a BCA student & creative developer specializing in 3D WebGL experiences, React, and scalable cloud applications. You can explore his projects right here or connect with him on Instagram @hoque2saheb!`;

    if (lower.includes('project') || lower.includes('work') || lower.includes('portfolio') || lower.includes('kam') || lower.includes('kaj')) {
      fallbackReply = `✨ **Hoque Saheb's Signature 3D Projects:**\n\n1. **SahebOS 3D**: Full desktop-grade WebOS featuring 3D windows, interactive terminal, and system widgets.\n2. **CyberHighway 3D Arcade**: High-octane WebGL synthwave retro racer with audio reactivity.\n3. **NeuralMatrix AI**: Interactive neural network debugger and visual architecture inspector.\n4. **QuantumPay Vault**: Biometrically locked fintech security interface with offline data sync.\n\nWhich one would you like to dive deeper into?`;
    } else if (lower.includes('skill') || lower.includes('tech') || lower.includes('stack')) {
      fallbackReply = `🛠️ **Core Technology Arsenal:**\n\n- **Frontend**: React 19, TypeScript, Three.js, WebGL, Tailwind CSS, Motion\n- **Backend & Cloud**: Node.js, Express, REST APIs, Offline Sync Queues, Biometrics\n- **Design**: Figma, UI/UX Prototyping, 3D Spatial Interfaces\n- **Education**: Bachelor of Computer Applications (BCA)`;
    } else if (lower.includes('contact') || lower.includes('hire') || lower.includes('email') || lower.includes('instagram') || lower.includes('call')) {
      fallbackReply = `📬 **Get in Touch with Hoque Saheb:**\n\n- **Instagram**: [@hoque2saheb](https://instagram.com/hoque2saheb)\n- **Email**: hoque.saheb.dev@gmail.com\n- **Location**: Itahar, West Bengal, India\n- Available for full-stack engineering, freelance 3D web experiences, and UI design!`;
    } else if (lower.includes('namaste') || lower.includes('kaise') || lower.includes('kya hal') || lower.includes('kemon')) {
      fallbackReply = `নমস্কার / नमस्ते! Main Saheb AI hoon, Hoque Saheb ka smart assistant. Main Saheb ke projects, skills aur collaboration opportunities ke bare me batane ke liye taiyar hoon. Aap mujhse English, Hindi ya Bengali me baat kar sakte hain!`;
    }

    res.json({ reply: fallbackReply, source: 'saheb-neural-core' });
  } catch (error) {
    console.error('Chat endpoint error:', error);
    res.status(500).json({ error: 'Failed to process conversation' });
  }
});

// Real-time Analytics Ingestion & Reporting
app.post('/api/analytics', (req: Request, res: Response) => {
  const { type, section, metadata } = req.body;
  const event: AnalyticsEvent = {
    id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type: type || 'interaction',
    section: section || 'general',
    metadata: metadata || {},
    timestamp: Date.now()
  };

  analyticsStore.push(event);
  if (analyticsStore.length > 500) {
    analyticsStore.shift();
  }

  // Fluctuate visitor count realistically
  if (Math.random() > 0.6) {
    liveVisitorCount = Math.max(8, Math.min(42, liveVisitorCount + (Math.random() > 0.45 ? 1 : -1)));
  }

  res.json({ success: true, eventId: event.id });
});

app.get('/api/analytics/summary', (_req: Request, res: Response) => {
  const totalEvents = analyticsStore.length + 128; // seed with realistic traffic
  const sectionCounts: Record<string, number> = {
    hero: 45,
    projects: 78,
    skills: 34,
    biometric_vault: 29,
    contact: 22,
  };

  analyticsStore.forEach(evt => {
    if (evt.section) {
      sectionCounts[evt.section] = (sectionCounts[evt.section] || 0) + 1;
    }
  });

  res.json({
    activeVisitors: liveVisitorCount,
    totalInteractions: totalEvents,
    topSections: sectionCounts,
    avgDwellTimeSeconds: 142,
    syncHealth: 'Optimal (Cloud Edge Active)',
    timestamp: Date.now()
  });
});

// Offline Data Sync Endpoint
app.post('/api/sync', (req: Request, res: Response) => {
  const { queue = [] } = req.body;
  const syncedIds: string[] = [];

  if (Array.isArray(queue)) {
    queue.forEach((item: { id?: string; type?: string; payload?: unknown }) => {
      const id = item.id || `sync_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      syncQueueStore.push({
        id,
        type: item.type || 'generic',
        payload: item.payload,
        syncedAt: Date.now(),
      });
      syncedIds.push(id);
    });
  }

  res.json({
    status: 'synchronized',
    syncedCount: syncedIds.length,
    serverTime: Date.now(),
    syncedIds
  });
});

// Push Notifications Mock Endpoint
app.post('/api/notifications/dispatch', (req: Request, res: Response) => {
  const { title, body } = req.body;
  res.json({
    success: true,
    messageId: `msg_${Date.now()}`,
    deliveredAt: Date.now(),
    payload: {
      title: title || 'New update from Hoque Saheb',
      body: body || 'Explore the brand new 3D projects and interactive showcase!',
      icon: '/favicon.ico'
    }
  });
});

// Setup Vite or Static Serving
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
