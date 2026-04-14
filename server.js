import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import scanRoutes from './scanRoutes.js';

const app = express();
const HOST = process.env.HOST || '0.0.0.0';
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/plastinet';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const GROQ_MODEL = 'llama-3.3-70b-versatile';
const BUILTIN_CLOE_CONTEXT = [
    'PlastiNet is a recycling app with scans, rewards, streaks, dashboards, verified history, and PlastiCoins.',
    'BIN_ QR scans log recycled plastic and award roughly 5-20 PlastiCoins when valid.',
    'Users can ask about the scanner flow, hardware/device tips, duplicate scan handling, rewards tiers, streaks, and history.',
    'Rewards include Bamboo Straw Set at P$50, Eco Tote Bag at P$120, Claim Money (₹1) at P$250, and Steel Water Bottle at P$300.',
    'History contains timestamps for recycling events and redeemed rewards.',
    'Keep answers concise, friendly, and focused on PlastiNet. If something is unknown, say so briefly instead of inventing details.'
];

const loadDotEnv = () => {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) return;

    try {
        const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;

            const separatorIndex = trimmed.indexOf('=');
            if (separatorIndex <= 0) continue;

            const key = trimmed.slice(0, separatorIndex).trim();
            const rawValue = trimmed.slice(separatorIndex + 1).trim();
            const value = rawValue.replace(/^['"]|['"]$/g, '');

            if (key && process.env[key] === undefined) {
                process.env[key] = value;
            }
        }
    } catch (error) {
        console.error('Failed to load .env file:', error);
    }
};

loadDotEnv();

const buildCloeMessages = ({ question = '', customEntries = [], userName = '' }) => {
    const trimmedQuestion = question.toString().trim();
    const normalizedEntries = Array.isArray(customEntries)
        ? customEntries
            .filter((entry) => entry?.response)
            .slice(0, 20)
            .map((entry, index) => {
                const title = entry.title?.toString().trim() || `Custom insight ${index + 1}`;
                const tags = Array.isArray(entry.tags) ? entry.tags.filter(Boolean).join(', ') : 'custom';
                return `- ${title} [${tags}]: ${entry.response.toString().trim()}`;
            })
        : [];

    const systemContent = [
        'You are Cloe, the PlastiNet assistant.',
        ...BUILTIN_CLOE_CONTEXT,
        userName ? `Current user name: ${userName}.` : '',
        normalizedEntries.length
            ? `User-trained Cloe knowledge:\n${normalizedEntries.join('\n')}`
            : 'There is no user-trained Cloe knowledge for this request.'
    ]
        .filter(Boolean)
        .join('\n');

    return [
        { role: 'system', content: systemContent },
        { role: 'user', content: trimmedQuestion }
    ];
};

const askGroq = async ({ question, customEntries, userName }) => {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`
        },
        body: JSON.stringify({
            model: GROQ_MODEL,
            temperature: 0.4,
            max_tokens: 512,
            messages: buildCloeMessages({ question, customEntries, userName })
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq request failed (${response.status}): ${errorText}`);
    }

    const payload = await response.json();
    return payload?.choices?.[0]?.message?.content?.trim() || '';
};

// Middleware
app.use(cors()); // Enable communication with the web app
app.use(express.json());
app.use(express.static(__dirname));

// Simple Logging Middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});

// Database Connection
mongoose.connect(MONGODB_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Endpoints
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/', scanRoutes);
app.post('/api/cloe/chat', async (req, res) => {
    const question = req.body?.question?.toString().trim();
    const customEntries = Array.isArray(req.body?.customEntries) ? req.body.customEntries : [];
    const userName = req.body?.userName?.toString?.().trim?.() || '';

    if (!question) {
        return res.status(400).json({ success: false, message: 'Question is required.' });
    }

    if (!process.env.GROQ_API_KEY) {
        return res.status(503).json({
            success: false,
            message: 'GROQ_API_KEY is not configured on the server.'
        });
    }

    try {
        const reply = await askGroq({ question, customEntries, userName });
        if (!reply) {
            throw new Error('Groq returned an empty response.');
        }

        return res.json({
            success: true,
            reply,
            provider: 'groq',
            model: GROQ_MODEL
        });
    } catch (error) {
        console.error('Cloe chat failed:', error);
        return res.status(502).json({
            success: false,
            message: 'Groq could not answer right now.'
        });
    }
});
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, HOST, () => {
    console.log(`PlastiNet app running on http://${HOST}:${PORT}`);
});
