const CUSTOM_ENTRIES_KEY = 'plastinetCloeCustomEntries';
const QR_PREFIX = 'BIN_';

const builtinEntries = [
  {
    id: 'impact-flow',
    title: 'Impact + PlastiCoins',
    tags: ['plastic', 'recycle', 'points', 'impact', 'scan', 'bin_'],
    response:
      'Each BIN_ scan logs recycled plastic and drops 5-20 PlastiCoins. Keep scanning daily to stack more PlastiCoins, then redeem them from the rewards vault.'
  },
  {
    id: 'app-flow',
    title: 'App pathways',
    tags: ['app', 'login', 'signup', 'dashboard', 'profile'],
    response:
      'Sign in from the landing page, then the dashboard keeps everything synced. The profile tab stores credits, streaks, and verified history for partnerships.'
  },
  {
    id: 'scanner-tips',
    title: 'Scanner & device',
    tags: ['device', 'camera', 'scanner', 'hardware', 'html5', 'qrcode'],
    response:
      'Grant camera access so the scanner overlays stay live. Hold the phone steadily, keep the QR inside the neon box, and Cloe will validate the BIN_ code instantly.'
  },
  {
    id: 'reward-journey',
    title: 'Rewards loop',
    tags: ['reward', 'redeem', 'perks', 'gift', 'badge', 'bamboo'],
    response:
      'Rewards are tiered by PlastiCoins. Bamboo straws unlock at P$50, then the eco tote or water bottle need higher tallies. Tap redeem from the rewards screen to lock it in and log it in history.'
  },
  {
    id: 'log-story',
    title: 'History & proof',
    tags: ['history', 'log', 'proof', 'record', 'credential', 'share'],
    response:
      'History lists every credit with timestamps. Share the logs with partners or regulators if they need proof of your collection run.'
  },
  {
    id: 'streak-badges',
    title: 'Streaks & achievements',
    tags: ['streak', 'achievement', 'badge', 'first scan', 'ten scans'],
    response:
      'Cloe tracks streaks automatically. Scan daily to keep the flame alive and unlock badges like 10 scans, 50 scans, or the 100-PlastiCoin club.'
  }
];

const fallbackResponses = [
  'I can help with scans, rewards, streaks, or the devices that capture BIN_. What do you need?',
  'Cloe keeps the neon stats aligned with the app, devices, and reward tiers; ask me anything there.',
  'Still learning, but I know about the dashboard, scanning flow, hardware tips, and reward hall. Give me a keyword to lock in.'
];

const MAX_CUSTOM_ENTRIES = 50;

const parseHistory = (payload) => {
  try {
    const parsed = JSON.parse(payload || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('Failed to parse custom training history', err);
    return [];
  }
};

const safeParse = (value) => (value ? value.toString() : '');

const loadCustomEntries = () => {
  const raw = localStorage.getItem(CUSTOM_ENTRIES_KEY) || '[]';
  return parseHistory(raw);
};

let customEntries = loadCustomEntries();
let knowledgeEntries = [...customEntries, ...builtinEntries];
const trainingHistory = [...customEntries];

const persistCustomEntries = () => {
  localStorage.setItem(CUSTOM_ENTRIES_KEY, JSON.stringify(customEntries.slice(0, MAX_CUSTOM_ENTRIES)));
};

const normalize = (value) => (value || '').toString().toLowerCase();

const syncEntries = () => {
  customEntries = customEntries.slice(0, MAX_CUSTOM_ENTRIES);
  knowledgeEntries = [...customEntries, ...builtinEntries];
  trainingHistory.splice(0, trainingHistory.length, ...customEntries);
  persistCustomEntries();
};

const highlightScore = (prompt, entry) => {
  const normalizedPrompt = normalize(prompt);
  return entry.tags.reduce((score, tag) => (normalizedPrompt.includes(tag) ? score + 1 : score), 0);
};

const respond = (prompt = '') => {
  const normalizedPrompt = normalize(prompt);
  if (!normalizedPrompt) {
    return 'Drop a question and I will answer from the app, the scanner, or the reward hall.';
  }
  let bestEntry = null;
  let bestScore = 0;
  for (const entry of knowledgeEntries) {
    const score = highlightScore(normalizedPrompt, entry);
    if (score > bestScore) {
      bestScore = score;
      bestEntry = entry;
    }
  }
  if (bestEntry && bestScore > 0) {
    return `${bestEntry.response}`;
  }
  const fallback = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)];
  return fallback;
};

const parseTags = (value) =>
  (value || '')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean)
    .slice(0, 6);

const sanitizeEntry = (entry = {}, fallbackIndex = 0) => {
  const trimmedResponse = (entry.response || '').toString().trim();
  if (!trimmedResponse) return null;
  const trimmedTitle = (entry.title || '').toString().trim();
  const tags = Array.isArray(entry.tags)
    ? entry.tags.map((tag) => normalize(tag).trim()).filter(Boolean).slice(0, 6)
    : parseTags(entry.topic || trimmedTitle);

  return {
    id: entry.id || `custom-import-${Date.now()}-${fallbackIndex}`,
    title: trimmedTitle || 'Custom insight',
    tags: tags.length ? tags : ['custom'],
    response: trimmedResponse,
    trainedAt: Number(entry.trainedAt) || Date.now()
  };
};

const train = ({ topic = '', response = '' }) => {
  const trimmedResponse = (response || '').trim();
  const trimmedTopic = (topic || '').trim();
  if (!trimmedResponse) {
    return 'Tell me how to answer, then I can remember it.';
  }
  const tags = parseTags(trimmedTopic);
  const newEntry = {
    id: `custom-${Date.now()}`,
    title: trimmedTopic || 'Custom insight',
    tags: tags.length ? tags : ['custom'],
    response: trimmedResponse,
    trainedAt: Date.now()
  };
  customEntries.unshift(newEntry);
  syncEntries();
  return `Thanks! I stored that under ${newEntry.tags.join(', ')}.`;
};

const getCustomEntries = () => customEntries.slice(0, MAX_CUSTOM_ENTRIES);

const exportCustomEntries = () => JSON.stringify(getCustomEntries(), null, 2);

const importCustomEntries = (payload) => {
  const parsed = Array.isArray(payload) ? payload : parseHistory(payload);
  const importedEntries = parsed
    .map((entry, index) => sanitizeEntry(entry, index))
    .filter(Boolean);

  if (!importedEntries.length) {
    return { success: false, message: 'That file did not include any valid training entries.' };
  }

  const mergedEntries = [...importedEntries, ...customEntries].filter((entry, index, entries) => {
    const duplicateIndex = entries.findIndex((candidate) => {
      const sameId = candidate.id === entry.id;
      const sameContent =
        candidate.response === entry.response &&
        JSON.stringify(candidate.tags) === JSON.stringify(entry.tags) &&
        candidate.title === entry.title;
      return sameId || sameContent;
    });

    return duplicateIndex === index;
  });

  customEntries = mergedEntries
    .sort((left, right) => (right.trainedAt || 0) - (left.trainedAt || 0))
    .slice(0, MAX_CUSTOM_ENTRIES);
  syncEntries();

  return {
    success: true,
    count: importedEntries.length,
    message: `Imported ${importedEntries.length} training entr${importedEntries.length === 1 ? 'y' : 'ies'}.`
  };
};

const getTopics = () => Array.from(new Set(knowledgeEntries.flatMap((entry) => entry.tags)));
const getTrainingHistory = () => trainingHistory.slice(0, 12);

window.CloeBrain = {
  respond,
  train,
  getCustomEntries,
  exportCustomEntries,
  importCustomEntries,
  getTopics,
  trainingHistory,
  getTrainingHistory
};
