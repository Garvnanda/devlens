import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { initCommands } from './core/commands';
import { apiClient } from './core/apiClient';
import { useAppStore } from './store/useAppStore';

const TOKEN_STORAGE_KEY = 'devlens_token';

// Initialize CLI commands registry
initCommands();

async function pollSkillFingerprint(attempt = 0) {
  if (attempt === 0) useAppStore.getState().setFingerprintLoading(true);
  if (attempt > 15) {
    useAppStore.getState().setFingerprintLoading(false);
    return; // give up after ~45s — job likely failed server-side, not worth polling forever
  }
  try {
    const res = await apiClient.getSkillFingerprint();
    if (res.status === 'done') {
      useAppStore.getState().setSkillFingerprint(res.skill_fingerprint);
      useAppStore.getState().setFingerprintLoading(false);
      return;
    }
  } catch {
    useAppStore.getState().setFingerprintLoading(false);
    return;
  }
  setTimeout(() => pollSkillFingerprint(attempt + 1), 3000);
}

async function hydrateAuth() {
  const urlParams = new URLSearchParams(window.location.search);
  const tokenFromUrl = urlParams.get('token');
  if (tokenFromUrl) {
    localStorage.setItem(TOKEN_STORAGE_KEY, tokenFromUrl);
    urlParams.delete('token');
    const cleanQuery = urlParams.toString();
    window.history.replaceState({}, '', window.location.pathname + (cleanQuery ? `?${cleanQuery}` : ''));
  }

  const token = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (!token) return;

  try {
    const profile = await apiClient.getMe();
    useAppStore.getState().setAuthState({
      authToken: token,
      isAuthenticated: true,
      githubUser: { login: profile.login, avatarUrl: profile.avatar_url },
    });
    useAppStore.getState().setUserProfile({
      level: profile.level,
      language: profile.language,
      goal: profile.goal,
    });
    if (profile.skill_fingerprint) {
      useAppStore.getState().setSkillFingerprint(profile.skill_fingerprint);
    } else {
      useAppStore.getState().setShowOnboardingModal(true);
      pollSkillFingerprint();
    }
  } catch {
    // Invalid/expired token — drop it, stay anonymous.
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

function renderApp() {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

// Portfolio page (Phase 14) is a deliberate, isolated exception to the
// CLI-only rule — it must be a shareable URL. Bypass the CLI shell entirely
// instead of adding a router for one page.
if (window.location.pathname.startsWith('/u/')) {
  import('./pages/PortfolioPage').then(({ renderPortfolioPage }) => {
    renderPortfolioPage();
  });
} else {
  hydrateAuth().finally(renderApp);
}
