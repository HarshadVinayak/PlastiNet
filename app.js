/**
 * SETUP INSTRUCTIONS:
 * 1. Make sure index.html loads this file as a module:
 *    <script type="module" src="app.js"></script>
 * 2. Serve the app via a local server such as `npm start`.
 *    ES Modules need HTTP so `file://` access will fail.
 */
import { markScanned, parseBinQRCode, simulateBinQRCode } from './qr.js';
import { sendScanToServer } from './api.js';

/*
 * Hardware integration note:
 * - Pico W bins emit QR strings of the form BIN_<id>_<timestamp>_<nonce>.
 * - The app scans them, sends the payload to the backend API (/scan), and the backend
 *   validates expiry, duplication, and awards points in response.
 * - This mock layer mimics that structure so you can switch to a real API later.
 */

// Firebase removed for standalone usage.

const STORAGE_USER_KEY = 'plastinetUser';
const STORAGE_USERS_KEY = 'plastinetUsers';
const STORAGE_SESSION_KEY = 'plastinetSession';
const protectedViews = ['dashboard', 'scan', 'history', 'rewards', 'profile'];
const nextRewardThreshold = 100;
const impactPerScanKg = 0.05;
const co2PerScanKg = 0.03;
const achievementRules = [
  { id: 'first-scan', label: 'First Scan', description: 'You completed your first scan.', condition: (stats) => stats.scans >= 1 },
  { id: 'ten-scans', label: '10 Scans', description: 'Ten scans and counting!', condition: (stats) => stats.scans >= 10 },
  { id: 'fifty-scans', label: '50 Scans', description: 'Fifty QR events recorded.', condition: (stats) => stats.scans >= 50 },
  { id: 'hundred-points', label: '100 PlastiCoins', description: 'Earned 100 neon PlastiCoins.', condition: (stats) => stats.points >= 100 }
];

const MOCK_REWARDS = [
  { id: '1', title: 'Bamboo Straw Set', cost: 50, description: 'Reusable bamboo straws with cleaner.', image: 'https://placehold.co/400x200/e0f2f1/00695c?text=Bamboo+Straws' },
  { id: '2', title: 'Eco Tote Bag', cost: 120, description: 'Organic cotton shopping bag.', image: 'https://placehold.co/400x200/e0f2f1/00695c?text=Tote+Bag' },
  { id: '3', title: 'Steel Water Bottle', cost: 300, description: 'Insulated stainless steel bottle.', image: 'https://placehold.co/400x200/e0f2f1/00695c?text=Water+Bottle' },
  { id: '4', title: 'Claim Money (₹1)', cost: 250, description: 'Exchange P$250 for 1 Rupee.', image: 'https://placehold.co/400x200/e0f2f1/00695c?text=Claim+Money' }
];

const MOCK_LEADERBOARD = [
  { name: 'Alex Green', points: 1540, email: 'alex@example.com' },
  { name: 'Sam River', points: 1200, email: 'sam@example.com' },
  { name: 'Jordan Earth', points: 980, email: 'jordan@example.com' }
];

const sections = document.querySelectorAll('[data-view]');
const viewTriggers = document.querySelectorAll('[data-target]');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const loginFeedback = document.getElementById('login-feedback');
const signupFeedback = document.getElementById('signup-feedback');
const savedAccounts = document.getElementById('saved-accounts');
const rewardFeedback = document.getElementById('reward-feedback');
const rewardsGrid = document.getElementById('rewards-grid');
const leaderboardList = document.getElementById('leaderboard-list');
const achievementsGrid = document.getElementById('achievements-grid');
const historyList = document.getElementById('history-list');
const scanList = document.getElementById('scan-history');
const historyEmpty = document.getElementById('history-empty');
const scanStatus = document.getElementById('scan-status');
const dashboardGreeting = document.getElementById('dashboard-greeting');
const dashboardPoints = document.getElementById('dashboard-points');
const dashboardScans = document.getElementById('dashboard-scans');
const dashboardStatus = document.getElementById('dashboard-status');
const dashboardStreak = document.getElementById('dashboard-streak');
const impactPlastic = document.getElementById('impact-plastic');
const impactCO2 = document.getElementById('impact-co2');
const progressBar = document.getElementById('next-reward-progress');
const progressLabel = document.getElementById('progress-label');
const profileName = document.getElementById('profile-name');
const profileEmail = document.getElementById('profile-email');
const profilePoints = document.getElementById('profile-points');
const profileScans = document.getElementById('profile-scans');
const dashboardScanBtn = document.getElementById('dashboard-scan');
const scanBtn = document.getElementById('scan-btn');
const logoutBtn = document.getElementById('logout-btn');
const authElements = document.querySelectorAll('[data-auth]');
const toastContainer = document.getElementById('toast-container');
const loader = document.getElementById('scrim');
const loaderText = document.getElementById('loader-text');
const scannerWrapper = document.getElementById('scanner-wrapper');
const closeScannerBtn = document.getElementById('close-scanner-btn');
const editProfileBtn = document.getElementById('edit-profile-btn');
const profileForm = document.getElementById('profile-form');
const profileFeedback = document.getElementById('profile-feedback');
const editNameInput = document.getElementById('edit-name');
const editEmailInput = document.getElementById('edit-email');
const editPasswordInput = document.getElementById('edit-password');
const editConfirmInput = document.getElementById('edit-confirm');
const cancelEditBtn = document.getElementById('cancel-edit');
const assistantLog = document.getElementById('cloe-assistant-log');
const assistantForm = document.getElementById('cloe-assistant-form');
const assistantInput = document.getElementById('cloe-assistant-input');
const trainingForm = document.getElementById('cloe-training-form');
const trainingFeedback = document.getElementById('cloe-training-feedback');
const exportTrainingBtn = document.getElementById('export-training-btn');
const importTrainingInput = document.getElementById('import-training-input');
const installAppBtn = document.getElementById('install-app-btn');
const suggestionList = document.getElementById('assistant-suggestion-list');
const assistantHistoryList = document.getElementById('assistant-history-list');

const formatPlastiCoins = (value = 0) => `P$${Number(value || 0).toLocaleString()}`;

let html5QrCode = null;
let scannerActive = false;
let currentUser = null;
let rewardsCache = [];
let previousPoints = 0;
let pointsAnimationFrame = null;
let deferredInstallPrompt = null;

const safeParse = (value) => {
  try {
    return value ? JSON.parse(value) : null;
  } catch (err) {
    console.warn('storage parse failed', err);
    return null;
  }
};

const normalizeEmail = (value = '') => value.toString().trim().toLowerCase();

const readUsers = () => {
  const storedUsers = safeParse(localStorage.getItem(STORAGE_USERS_KEY));
  if (Array.isArray(storedUsers)) {
    return storedUsers;
  }

  const legacyUser = safeParse(localStorage.getItem(STORAGE_USER_KEY));
  if (legacyUser?.email) {
    localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify([legacyUser]));
    localStorage.removeItem(STORAGE_USER_KEY);
    return [legacyUser];
  }

  return [];
};

const writeUsers = (users = []) => {
  localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(users));
};

const storage = {
  getUsers: () => readUsers(),
  findUserByEmail: (email) => readUsers().find((user) => normalizeEmail(user.email) === normalizeEmail(email)),
  saveUser: (user, previousEmail = '') => {
    const previousKey = normalizeEmail(previousEmail || user.email);
    const nextUsers = readUsers().filter((entry) => normalizeEmail(entry.email) !== previousKey);
    nextUsers.unshift({ ...user, updatedAt: Date.now() });
    writeUsers(nextUsers);
  },
  getRecentUsers: () =>
    readUsers()
      .sort((left, right) => (right.updatedAt || 0) - (left.updatedAt || 0))
      .slice(0, 4),
  setSession: (email) => localStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify({ email, timestamp: Date.now() })),
  getSession: () => safeParse(localStorage.getItem(STORAGE_SESSION_KEY)),
  clearSession: () => localStorage.removeItem(STORAGE_SESSION_KEY)
};

const showToast = (message, variant = 'info') => {
  if (!toastContainer) return;
  const toast = document.createElement('div');
  toast.className = `toast ${variant}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 2600);
};

const showLoader = (message = 'Working…') => {
  if (!loader || !loaderText) return;
  loaderText.textContent = message;
  loader.classList.remove('hidden');
};

const hideLoader = () => loader?.classList.add('hidden');

const appendAssistantBubble = (text, speaker = 'cloe') => {
  if (!assistantLog || !text) return;
  const bubble = document.createElement('div');
  bubble.className = `assistant-bubble assistant-bubble--${speaker}`;
  bubble.innerHTML = `<p>${text}</p>`;
  assistantLog.appendChild(bubble);
  assistantLog.scrollTop = assistantLog.scrollHeight;
};

const setAssistantFeedback = (message = '', success = false) => {
  if (!trainingFeedback) return;
  trainingFeedback.textContent = message;
  trainingFeedback.classList.toggle('success', success);
};

const isStandaloneMode = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

const setInstallButtonVisibility = (visible) => {
  if (!installAppBtn) return;
  installAppBtn.classList.toggle('hidden', !visible || isStandaloneMode());
};

const registerInstallPrompt = () => {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    setInstallButtonVisibility(true);
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    setInstallButtonVisibility(false);
    showToast('PlastiNet installed on your device.', 'success');
  });
};

const registerServiceWorker = async () => {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('/sw.js');
  } catch (error) {
    console.warn('Service worker registration failed', error);
  }
};

const quickPrompts = [
  'How can I keep a streak alive?',
  'What exactly triggers a duplicate scan rejection?',
  'Explain how the reward tiers are structured.'
];

const refreshTrainingHistory = () => {
  if (!assistantHistoryList || !window.CloeBrain?.getTrainingHistory) return;
  const entries = window.CloeBrain.getTrainingHistory();
  if (!entries.length) {
    assistantHistoryList.innerHTML = '<li>No custom training yet.</li>';
    return;
  }
  assistantHistoryList.innerHTML = entries
    .slice(0, 6)
    .map((entry) => {
      const timeLabel = entry.trainedAt ? new Date(entry.trainedAt).toLocaleTimeString() : '';
      const title = entry.title || (entry.tags?.[0] ?? 'Custom insight');
      return `<li>${timeLabel ? `${timeLabel} · ` : ''}${title}</li>`;
    })
    .join('');
};

const renderSavedAccounts = () => {
  if (!savedAccounts) return;
  const users = storage.getRecentUsers();
  if (!users.length) {
    savedAccounts.classList.add('hidden');
    savedAccounts.innerHTML = '';
    return;
  }

  savedAccounts.classList.remove('hidden');
  savedAccounts.innerHTML = `
    <div class="saved-accounts-header">
      <p class="label">Saved accounts</p>
      <p class="subtle">Quick-fill the email field on this device.</p>
    </div>
    <div class="saved-account-list">
      ${users
        .map(
          (user) => `
            <button type="button" class="saved-account-btn" data-email="${user.email}">
              <strong>${user.name || user.email.split('@')[0]}</strong>
              <span>${user.email}</span>
            </button>
          `
        )
        .join('')}
    </div>
  `;
};

const updateScanStatus = (message, state = 'neutral') => {
  if (!scanStatus) return;
  scanStatus.textContent = message;
  scanStatus.classList.toggle('success', state === 'success');
  scanStatus.classList.toggle('error', state === 'error');
};

const toggleScannerProcessing = (processing) => {
  if (!scannerWrapper) return;
  scannerWrapper.classList.toggle('processing', processing);
};

const animateValue = (obj, start, end, duration) => {
  if (!obj) return;
  if (pointsAnimationFrame) {
    window.cancelAnimationFrame(pointsAnimationFrame);
  }
  if (start === end || duration <= 0) {
    obj.textContent = Math.floor(end).toLocaleString();
    return;
  }
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    obj.textContent = Math.floor(progress * (end - start) + start).toLocaleString();
    if (progress < 1) {
      pointsAnimationFrame = window.requestAnimationFrame(step);
    } else {
      pointsAnimationFrame = null;
    }
  };
  pointsAnimationFrame = window.requestAnimationFrame(step);
};

const persistUser = async () => {
  if (!currentUser) return;
  storage.saveUser(currentUser);
  renderSavedAccounts();
};

const highlightNav = (viewId) => {
  viewTriggers.forEach((trigger) => {
    trigger.classList.toggle('active', trigger.dataset.target === viewId);
  });
};

const updateAuthVisibility = (hide = false) => {
  authElements.forEach((el) => {
    el.classList.toggle('hidden', hide);
  });
};

const calculateStats = () => {
  const history = currentUser?.history ?? [];
  const scans = history.filter((entry) => entry.action === 'Plastic recycled').length;
  return { scans, points: currentUser?.points ?? 0 };
};

const calculateImpact = () => {
  const stats = calculateStats();
  return {
    plasticKg: (stats.scans * impactPerScanKg).toFixed(2),
    co2Kg: (stats.scans * co2PerScanKg).toFixed(2)
  };
};

const renderImpact = () => {
  if (!currentUser) return;
  const { plasticKg, co2Kg } = calculateImpact();
  if (impactPlastic) impactPlastic.textContent = `You saved ${plasticKg} kg plastic.`;
  if (impactCO2) impactCO2.textContent = `Reduced ${co2Kg} kg CO₂.`;
};

const renderProgress = () => {
  if (!progressBar || !progressLabel || !currentUser) return;
  const points = currentUser.points;
  const currentCyclePoints = points % nextRewardThreshold;
  const progress = (currentCyclePoints / nextRewardThreshold) * 100;
  progressBar.style.width = `${progress}%`;
  progressLabel.textContent = `${formatPlastiCoins(currentCyclePoints)} / ${formatPlastiCoins(nextRewardThreshold)} toward next reward`;
};

const renderAchievements = () => {
  if (!achievementsGrid) return;
  const unlocked = currentUser?.achievements ?? [];
  const badges = achievementRules
    .filter((rule) => unlocked.includes(rule.id))
    .map((rule) => `<span class="achievement-badge" title="${rule.description}">${rule.label}</span>`)
    .join('');
  achievementsGrid.innerHTML = badges || '<p class="subtle">No achievements yet.</p>';
};

const renderHistory = () => {
  const entries = currentUser?.history ?? [];
  const scans = entries.filter((entry) => entry.action === 'Plastic recycled');
  if (historyEmpty) historyEmpty.style.display = scans.length ? 'none' : 'block';
  if (historyList) {
    historyList.innerHTML = scans
      .map(
        (entry) => `
      <li>
        <span>${entry.qrId || 'Plastic recycled'}</span>
        <span>+${formatPlastiCoins(entry.points)} · ${new Date(entry.date).toLocaleString()}</span>
      </li>
    `
      )
      .join('');
  }
  if (scanList) {
    if (!scans.length) {
      scanList.innerHTML = '<li class="history-list-empty">No scans yet. Run a demo scan to warm things up.</li>';
    } else {
      scanList.innerHTML = scans
        .slice(0, 3)
        .map(
          (entry) => `
        <li>
          <span>${entry.qrId || 'Plastic recycled'}</span>
          <span>+${formatPlastiCoins(entry.points)} · ${new Date(entry.date).toLocaleTimeString()}</span>
        </li>
      `
        )
        .join('');
    }
  }
  const latestScanLabel = document.getElementById('latest-scan');
  const latestEntry = scans[0];
  if (latestScanLabel) {
    latestScanLabel.textContent = latestEntry ? latestEntry.qrId || 'Plastic recycled' : '—';
  }
};

const renderLeaderboard = (rows = []) => {
  if (!leaderboardList) return;
  leaderboardList.innerHTML = rows
    .map((item, index) => {
      const highlight = currentUser?.email === item.email ? 'highlight' : '';
      return `<li class="${highlight}"><span>${index + 1}. ${item.name || item.email.split('@')[0]}</span><span>${formatPlastiCoins(item.points || 0)}</span></li>`;
    })
    .join('');
};

const renderRewards = () => {
  if (!rewardsGrid) return;
  if (!rewardsCache.length) {
    rewardsGrid.innerHTML = '<p class="subtle">No rewards published yet.</p>';
    return;
  }
  const points = currentUser?.points ?? 0;
  rewardsGrid.innerHTML = rewardsCache
    .map((reward) => {
      const afford = points >= reward.cost;
      return `
        <article class="reward-card">
          ${reward.image ? `<img src="${reward.image}" alt="${reward.title}" style="display:block; width:100%; height:140px; object-fit:cover; border-radius:6px; margin-bottom:10px;">` : ''}
          <p class="label">${reward.title}</p>
          <p class="reward-value">Cost: ${formatPlastiCoins(reward.cost)}</p>
          <p class="card-detail">${reward.description || 'Redeemable for verified plastic drops.'}</p>
          <button class="glow-btn" data-reward-id="${reward.id}" ${afford ? '' : 'disabled'}>
            ${afford ? 'Redeem' : `Need ${formatPlastiCoins(reward.cost - points)}`}
          </button>
        </article>
      `;
    })
    .join('');
  rewardsGrid.querySelectorAll('button').forEach((button) => {
    const rewardId = button.dataset.rewardId;
    const reward = rewardsCache.find((item) => item.id === rewardId);
    if (reward) {
      button.addEventListener('click', () => redeemReward(reward));
    }
  });
};

const fetchRewards = async () => {
  rewardsCache = [...MOCK_REWARDS];
  renderRewards();
};

const fetchLeaderboard = async () => {
  const savedUsers = storage
    .getUsers()
    .map((user) => ({
      name: user.name,
      points: user.points || 0,
      email: user.email
    }));
  const mergedRows = [...savedUsers, ...MOCK_LEADERBOARD.filter((mock) =>
    !savedUsers.some((user) => normalizeEmail(user.email) === normalizeEmail(mock.email))
  )]
    .sort((left, right) => (right.points || 0) - (left.points || 0))
    .slice(0, 5);
  renderLeaderboard(mergedRows);
};

const updateDashboard = () => {
  if (!currentUser) return;
  const hours = new Date().getHours();
  const greeting = hours < 12 ? 'Morning' : hours < 18 ? 'Afternoon' : 'Evening';
  dashboardGreeting.textContent = `Good ${greeting}, ${currentUser.name}`;
  animateValue(dashboardPoints, previousPoints, currentUser.points, 1000);
  previousPoints = currentUser.points;
  profilePoints.textContent = formatPlastiCoins(currentUser.points);
  dashboardScans.textContent = `${(currentUser.history ?? []).filter((entry) => entry.action === 'Plastic recycled').length}`;
  dashboardStatus.textContent = 'Session active · All systems stable';
  dashboardStreak.textContent = `🔥 ${currentUser.streakCount ?? 0} Day Streak`;
  renderImpact();
  renderProgress();
  renderHistory();
  renderAchievements();
  renderRewards();
  fetchLeaderboard();
};

const checkAchievements = async () => {
  if (!currentUser) return;
  const stats = calculateStats();
  for (const rule of achievementRules) {
    if (rule.condition(stats) && !(currentUser.achievements ?? []).includes(rule.id)) {
      currentUser.achievements = [...(currentUser.achievements ?? []), rule.id];
      showToast(`Achievement unlocked: ${rule.label}`, 'success');
      await persistUser();
    }
  }
  renderAchievements();
};

const updateStreak = () => {
  if (!currentUser) return;
  const last = currentUser.lastScanDate ? new Date(currentUser.lastScanDate).setHours(0, 0, 0, 0) : null;
  const today = new Date().setHours(0, 0, 0, 0);
  if (!last || today - last > 86400000) {
    currentUser.streakCount = 1;
  } else if (today === last) {
    currentUser.streakCount = currentUser.streakCount ?? 1;
  } else {
    currentUser.streakCount = (currentUser.streakCount ?? 0) + 1;
  }
  currentUser.lastScanDate = new Date().toISOString();
  if ((currentUser.streakCount ?? 0) % 5 === 0) {
    showToast(`🔥 ${currentUser.streakCount}-day streak! Keep going!`, 'success');
  }
};

const addHistoryEntry = (points, action, qrId = '') => {
  if (!currentUser) return;
  currentUser.history = currentUser.history ?? [];
  currentUser.history.unshift({ date: new Date().toISOString(), points, action, qrId });
};

const redeemReward = async (reward) => {
  if (!currentUser) {
    showToast('Login to redeem rewards.', 'error');
    showView('login');
    return;
  }
  if (currentUser.points < reward.cost) {
    setFeedback(rewardFeedback, 'Not enough PlastiCoins yet.');
    showToast('Not enough PlastiCoins.', 'error');
    return;
  }
  currentUser.points -= reward.cost;
  addHistoryEntry(reward.cost, `Reward redeemed: ${reward.title}`);
  await persistUser();
  setFeedback(rewardFeedback, `Redeemed ${reward.title}!`, true);
  showToast(`Redeemed ${reward.title}. -${formatPlastiCoins(reward.cost)}`, 'success');
  renderRewards();
  updateDashboard();
};

const setFeedback = (element, message = '', success = false) => {
  if (!element) return;
  element.textContent = message;
  element.classList.toggle('success', success);
};

const toggleProfileForm = (show = false) => {
  if (!profileForm) return;
  profileForm.classList.toggle('active', show);
  if (!show) {
    setFeedback(profileFeedback, '');
    return;
  }
  setFeedback(profileFeedback, '');
  editNameInput.value = currentUser?.name ?? '';
  editEmailInput.value = currentUser?.email ?? '';
  editPasswordInput.value = '';
  editConfirmInput.value = '';
  profileForm.scrollIntoView({ block: 'center' });
};

const toggleScannerVisibility = (visible) => {
  if (!scannerWrapper) return;
  scannerWrapper.classList.toggle('active', visible);
};

const stopScanner = async () => {
  if (html5QrCode && scannerActive) {
    await html5QrCode.stop().catch(() => { });
  }
  scannerActive = false;
  toggleScannerVisibility(false);
  updateScanStatus('Scanner idle.');
};

const handleScanResult = async (decodedText) => {
  if (!decodedText) return;
  if (!currentUser) {
    showToast('Log in to scan.', 'error');
    stopScanner();
    showView('login');
    return;
  }
  const parsed = parseBinQRCode(decodedText.trim());
  if (!parsed) {
    updateScanStatus('Invalid QR code.', 'error');
    showToast('QR code must start with BIN_.', 'error');
    return;
  }
  updateScanStatus('Processing QR…');
  toggleScannerProcessing(true);
  showLoader('Processing scan…');
  await stopScanner();

  try {
    const response = await sendScanToServer(parsed, { userId: currentUser.email ?? 'guest' });
    if (!response.success) {
      updateScanStatus(response.message || 'Scan rejected.', 'error');
      showToast(response.message || 'Validation failed.', 'error');
      return;
    }
    const pointsEarned = response.points ?? 0;
    currentUser.points += pointsEarned;
    markScanned(parsed.raw, { binId: parsed.binId, timestamp: parsed.timestamp });
    currentUser.scannedIds = [...new Set([...(currentUser.scannedIds ?? []), parsed.raw])];
    addHistoryEntry(pointsEarned, 'Plastic recycled', parsed.raw);
    updateStreak();
    await persistUser();
    await checkAchievements();
    renderRewards();
    updateDashboard();
    updateScanStatus(`Recycled ${parsed.binId}! +${formatPlastiCoins(pointsEarned)}`, 'success');
    showToast(`${response.message || 'Recycled successfully'} +${formatPlastiCoins(pointsEarned)}`, 'success');
  } catch (err) {
    console.warn('sendScanToServer failed', err);
    updateScanStatus('Processing failed.', 'error');
    showToast('Unable to process scan.', 'error');
  } finally {
    hideLoader();
    toggleScannerProcessing(false);
    await stopScanner();
  }
};

const startScanner = async () => {
  if (scannerActive) return;
  if (!window.Html5Qrcode) {
    showToast('Scanner library missing.', 'error');
    return;
  }
  if (!currentUser) {
    showToast('Log in before scanning.', 'error');
    showView('login');
    return;
  }
  toggleScannerVisibility(true);
  showLoader('Opening camera…');
  if (!html5QrCode) {
    html5QrCode = new Html5Qrcode('qr-reader');
  }
  try {
    await html5QrCode.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      handleScanResult,
      () => { } // Ignore frame-by-frame scanning errors
    );
    scannerActive = true;
    updateScanStatus('Point the QR code inside the neon box.');
  } catch (err) {
    console.warn('Scanner failed', err);
    const errorMsg = err.name === 'NotAllowedError' ? 'Camera access denied.' : (err.message || 'Camera not found.');
    showToast(errorMsg, 'error');
    updateScanStatus(errorMsg, 'error');
    toggleScannerVisibility(false);
  } finally {
    hideLoader();
  }
};

const showView = (target) => {
  const needsAuth = protectedViews.includes(target);
  const destination = needsAuth && !currentUser ? 'login' : target;
  sections.forEach((section) => {
    section.classList.toggle('active', section.dataset.view === destination);
  });
  highlightNav(destination);
  if (destination === 'login') setFeedback(loginFeedback, '');
  if (destination === 'signup') setFeedback(signupFeedback, '');
  if (destination === 'rewards') setFeedback(rewardFeedback, '');
  if (destination !== 'profile') toggleProfileForm(false);
  if (destination !== 'scan') {
    stopScanner();
  }
  if (destination === 'scan') {
    updateScanStatus('Camera ready when you are. Tap Start camera or use Run demo scan.');
  }
};

const restoreSession = async () => {
  const session = storage.getSession();
  const storedUser = session?.email ? storage.findUserByEmail(session.email) : null;
  if (session?.email && storedUser?.email) {
    currentUser = storedUser;
    await persistUser();
    updateAuthVisibility(true);
    updateDashboard();
    showToast('Session restored.', 'success');
    showView('dashboard');
  } else {
    storage.clearSession();
    updateAuthVisibility(false);
    renderSavedAccounts();
    showView('landing');
  }
};

loginForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const email = formData.get('email')?.trim();
  const password = formData.get('password')?.trim();
  if (!email || !password) {
    setFeedback(loginFeedback, 'Fill out both fields.');
    showToast('Please enter email and password.', 'error');
    return;
  }
  const storedUser = storage.findUserByEmail(email);
  if (!storedUser || storedUser.password !== password) {
    setFeedback(loginFeedback, 'Credentials do not match.');
    showToast('Invalid credentials.', 'error');
    return;
  }
  showLoader('Signing you in…');
  hideLoader();
  currentUser = storedUser;
  await persistUser();
  storage.setSession(storedUser.email);
  await checkAchievements();
  updateAuthVisibility(true);
  updateDashboard();
  setFeedback(loginFeedback, 'Login successful! Redirecting…', true);
  showToast('Logged in.', 'success');
  showView('dashboard');
});

signupForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(signupForm);
  const name = formData.get('name')?.trim();
  const email = formData.get('email')?.trim();
  const password = formData.get('password')?.trim();
  const confirm = formData.get('confirm')?.trim();
  if (!name || !email || !password || !confirm) {
    setFeedback(signupFeedback, 'All fields are required.');
    showToast('Complete every field.', 'error');
    return;
  }
  if (password !== confirm) {
    setFeedback(signupFeedback, 'Passwords must match.');
    showToast('Passwords do not match.', 'error');
    return;
  }
  if (storage.findUserByEmail(email)) {
    setFeedback(signupFeedback, 'That email already has an account.');
    showToast('Use a different email or log in instead.', 'error');
    return;
  }
  showLoader('Creating your PlastiNet ID…');
  currentUser = { name, email, password, points: 0, history: [], achievements: [], streakCount: 0, lastScanDate: null, scannedIds: [] };
  await persistUser();
  hideLoader();
  storage.setSession(email);
  updateAuthVisibility(true);
  updateDashboard();
  setFeedback(signupFeedback, 'Account ready! Redirecting…', true);
  showToast('Account created.', 'success');
  showView('dashboard');
});

scanBtn?.addEventListener('click', startScanner);
dashboardScanBtn?.addEventListener('click', () => showView('scan'));
closeScannerBtn?.addEventListener('click', () => {
  stopScanner();
  showView('dashboard');
});

logoutBtn?.addEventListener('click', () => {
  showLoader('Signing out…');
  setTimeout(() => {
    hideLoader();
    storage.clearSession();
    currentUser = null;
    updateAuthVisibility(false);
    renderSavedAccounts();
    setFeedback(loginFeedback, 'Logged out. See you soon!', true);
    showToast('Logged out.', 'info');
    showView('landing');
  }, 600);
});

editProfileBtn?.addEventListener('click', () => {
  if (!currentUser) {
    showToast('Login before editing.', 'error');
    showView('login');
    return;
  }
  toggleProfileForm(true);
});

cancelEditBtn?.addEventListener('click', () => toggleProfileForm(false));

profileForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = editNameInput.value?.trim();
  const email = editEmailInput.value?.trim();
  const password = editPasswordInput.value?.trim();
  const confirm = editConfirmInput.value?.trim();
  if (!name || !email) {
    setFeedback(profileFeedback, 'Name and email are required.');
    showToast('Complete the form.', 'error');
    return;
  }
  if ((password || confirm) && password !== confirm) {
    setFeedback(profileFeedback, 'Passwords must match.');
    showToast('Passwords do not match.', 'error');
    return;
  }
  const previousEmail = currentUser.email;
  if (normalizeEmail(email) !== normalizeEmail(previousEmail) && storage.findUserByEmail(email)) {
    setFeedback(profileFeedback, 'That email is already being used.');
    showToast('Pick a different email.', 'error');
    return;
  }
  showLoader('Saving profile…');
  currentUser.name = name;
  currentUser.email = email;
  if (password) {
    currentUser.password = password;
  }
  storage.saveUser(currentUser, previousEmail);
  renderSavedAccounts();
  storage.setSession(email);
  hideLoader();
  setFeedback(profileFeedback, 'Profile updated!', true);
  showToast('Profile saved.', 'success');
  toggleProfileForm(false);
  updateDashboard();
});

viewTriggers.forEach((trigger) => {
  trigger.addEventListener('click', () => showView(trigger.dataset.target));
});

savedAccounts?.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-email]');
  if (!button || !loginForm) return;
  const emailInput = loginForm.querySelector('input[name="email"]');
  const passwordInput = loginForm.querySelector('input[name="password"]');
  if (!emailInput) return;
  emailInput.value = button.dataset.email ?? '';
  passwordInput?.focus();
  setFeedback(loginFeedback, 'Email filled in. Enter the password to continue.', true);
});

assistantForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const question = assistantInput?.value?.trim();
  if (!question) return;
  appendAssistantBubble(question, 'user');
  assistantInput.value = '';
  const brain = window.CloeBrain;
  const reply = brain?.respond(question) ?? "I'm still learning how to reply.";
  setTimeout(() => appendAssistantBubble(reply, 'cloe'), 220);
});

trainingForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  const formData = new FormData(trainingForm);
  const topic = formData.get('topic')?.toString() ?? '';
  const response = formData.get('response')?.toString() ?? '';
  const brain = window.CloeBrain;
  if (!brain) {
    setAssistantFeedback('Cloe is still booting up.', false);
    return;
  }
  const result = brain.train({ topic, response });
  const success = result.toLowerCase().startsWith('thanks');
  setAssistantFeedback(result, success);
  appendAssistantBubble(result, 'cloe');
  trainingForm.reset();
  refreshTrainingHistory();
});

exportTrainingBtn?.addEventListener('click', () => {
  const brain = window.CloeBrain;
  if (!brain?.exportCustomEntries) {
    setAssistantFeedback('Cloe is still booting up.', false);
    return;
  }

  const payload = brain.exportCustomEntries();
  const blob = new Blob([payload], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `plastinet-cloe-training-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);

  setAssistantFeedback('Exported Cloe brain JSON.', true);
  appendAssistantBubble('I packed the custom training into a JSON file you can share.', 'cloe');
});

importTrainingInput?.addEventListener('change', async (event) => {
  const [file] = event.target.files ?? [];
  if (!file) return;

  try {
    const payload = await file.text();
    const result = window.CloeBrain?.importCustomEntries?.(payload);
    if (!result?.success) {
      setAssistantFeedback(result?.message || 'That file could not be imported.', false);
      return;
    }

    setAssistantFeedback(result.message, true);
    appendAssistantBubble(`${result.message} I can use those answers right away.`, 'cloe');
    refreshTrainingHistory();
  } catch (error) {
    console.error('Training import failed', error);
    setAssistantFeedback('Import failed. Try a valid JSON export.', false);
  } finally {
    importTrainingInput.value = '';
  }
});

installAppBtn?.addEventListener('click', async () => {
  if (!deferredInstallPrompt) {
    showToast('Install is available after the app fully loads in Chrome on Android.', 'info');
    return;
  }

  deferredInstallPrompt.prompt();
  const outcome = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  setInstallButtonVisibility(false);

  if (outcome.outcome === 'accepted') {
    showToast('Installing PlastiNet…', 'success');
  }
});

suggestionList?.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-prompt]');
  if (!button) return;
  const prompt = button.dataset.prompt ?? button.textContent;
  assistantInput.value = prompt;
  assistantInput.focus();
});

const simulateBinBtn = document.getElementById('simulate-bin-btn');
simulateBinBtn?.addEventListener('click', () => {
  const qr = simulateBinQRCode();
  updateScanStatus('Processing simulated QR…');
  showToast('Simulated bin QR generated.', 'info');
  handleScanResult(qr);
});

const initApp = async () => {
  registerInstallPrompt();
  await registerServiceWorker();
  await fetchRewards();
  await fetchLeaderboard();
  renderSavedAccounts();
  await restoreSession();
  refreshTrainingHistory();
  setInstallButtonVisibility(Boolean(deferredInstallPrompt));
};

initApp();
