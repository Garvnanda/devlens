import { createRoot } from 'react-dom/client';

/**
 * Standalone public portfolio page (Phase 14) — deliberately does NOT import
 * Zustand, CommandRegistry, or StateMachine. This is the one explicit
 * exception to the CLI-only rule, since it must be a shareable URL to a
 * third party rather than a CLI-cockpit surface. Full implementation lands
 * in Phase 14; this is a placeholder so the route resolves cleanly now.
 */
function PortfolioPage() {
    const username = window.location.pathname.split('/u/')[1] || '';
    return (
        <div style={{ fontFamily: 'monospace', background: '#000000', color: '#E2E8F0', minHeight: '100vh', padding: '2rem' }}>
            <h1>DevLens Portfolio — {username}</h1>
            <p style={{ opacity: 0.6 }}>Coming soon.</p>
        </div>
    );
}

export function renderPortfolioPage() {
    createRoot(document.getElementById('root')!).render(<PortfolioPage />);
}
