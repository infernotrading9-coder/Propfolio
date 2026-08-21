import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { AUTH_DEBUG_PANEL_ENABLED } from '../../lib/appFlags';
import netlifyIdentity from 'netlify-identity-widget';
import { getNetlifyIdentityApiUrl } from '../../utils/netlifyIdentityConfig';

type DebugEvent = Record<string, unknown>;

const AuthDebugPanel: React.FC = () => {
  const location = useLocation();
  const { currentUser, loading, pendingVerificationEmail } = useAuth();
  const [events, setEvents] = useState<DebugEvent[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [position, setPosition] = useState({ x: 16, y: 16 });
  const dragRef = useRef<{ dragging: boolean; offsetX: number; offsetY: number }>({
    dragging: false,
    offsetX: 0,
    offsetY: 0,
  });

  const storedUser = useMemo(() => {
    try {
      const raw = localStorage.getItem('user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, [currentUser, location.pathname]);

  const storageSnapshot = useMemo(() => {
    try {
      const aliases = JSON.parse(localStorage.getItem('propfolio_user_aliases') || '{}');
      const buckets = JSON.parse(localStorage.getItem('propfolio_data') || '{}');
      return {
        aliases,
        bucketKeys: Object.keys(buckets),
        bucketSummary: Object.entries(buckets).map(([id, bucket]: any) => ({
          id,
          email: bucket?.email || null,
          firms: bucket?.firms?.length || 0,
          challenges: bucket?.challenges?.length || 0,
          selectedFirmId: bucket?.selectedFirmId || null,
        })),
      };
    } catch {
      return {
        aliases: {},
        bucketKeys: [],
        bucketSummary: [],
      };
    }
  }, [currentUser, storedUser, location.pathname, events.length]);

  const identitySnapshot = useMemo(() => {
    try {
      const user: any = netlifyIdentity.currentUser();
      const params = new URLSearchParams(window.location.search);
      return {
        href: window.location.href,
        authDebugQuery: params.get('authDebug'),
        online: navigator.onLine,
        userAgent: navigator.userAgent,
        id: user?.id || user?.sub || null,
        email: user?.email || user?.user_metadata?.email || user?.profile?.email || null,
        name: user?.user_metadata?.full_name || user?.user_metadata?.name || user?.full_name || user?.profile?.name || null,
        provider: user?.app_metadata?.provider || user?.user_metadata?.provider || null,
        apiUrl: getNetlifyIdentityApiUrl() || 'auto-detect',
        netlifySiteURL: localStorage.getItem('netlifySiteURL'),
        currentUser: !!user,
        userMetadata: user?.user_metadata || null,
        appMetadata: user?.app_metadata || null,
        keys: Object.keys(user || {}),
      };
    } catch {
      try {
        const params = new URLSearchParams(window.location.search);
        return {
          href: window.location.href,
          authDebugQuery: params.get('authDebug'),
          online: navigator.onLine,
          userAgent: navigator.userAgent,
          apiUrl: getNetlifyIdentityApiUrl() || 'auto-detect',
          netlifySiteURL: localStorage.getItem('netlifySiteURL'),
          currentUser: null,
        };
      } catch {
        return null;
      }
    }
  }, [currentUser, location.pathname, events.length]);

  useEffect(() => {
    const handler = (event: Event) => {
      const custom = event as CustomEvent;
      setEvents(prev => [custom.detail, ...prev].slice(0, 20));
    };
    window.addEventListener('authDebug', handler as EventListener);
    return () => window.removeEventListener('authDebug', handler as EventListener);
  }, []);

  useEffect(() => {
    const routeEvent = {
      type: 'route:change',
      timestamp: new Date().toISOString(),
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
      currentUserEmail: currentUser?.email || null,
      storedUserEmail: storedUser?.email || null,
      loading,
      pendingVerificationEmail,
    };
    setEvents(prev => [routeEvent, ...prev].slice(0, 20));
  }, [location.pathname, location.search, location.hash, currentUser?.email, storedUser?.email, loading, pendingVerificationEmail]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!dragRef.current.dragging) return;
      setPosition({
        x: Math.max(8, window.innerWidth - event.clientX - dragRef.current.offsetX),
        y: Math.max(8, event.clientY - dragRef.current.offsetY),
      });
    };

    const handleMouseUp = () => {
      dragRef.current.dragging = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const startDrag = (clientX: number, clientY: number) => {
    dragRef.current.dragging = true;
    dragRef.current.offsetX = window.innerWidth - position.x - clientX;
    dragRef.current.offsetY = clientY - position.y;
  };

  if (!AUTH_DEBUG_PANEL_ENABLED) return null;

  if (collapsed) {
    return (
      <div
        className="fixed z-[100]"
        style={{ top: position.y, right: position.x }}
      >
        <button
          onClick={() => setCollapsed(false)}
          onMouseDown={(event) => {
            if (event.button !== 0) return;
            startDrag(event.clientX, event.clientY);
          }}
          className="px-3 py-2 rounded-lg bg-black/80 border border-cyan-400/40 text-cyan-200 text-xs shadow-lg cursor-move"
        >
          Debug Window
        </button>
      </div>
    );
  }

  return (
    <div
      className="fixed z-[100] w-[360px] max-h-[90vh] overflow-hidden rounded-2xl border border-cyan-400/30 bg-[#081018]/95 backdrop-blur-xl shadow-2xl"
      style={{ top: position.y, right: position.x }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 border-b border-white/10 cursor-move"
        onMouseDown={(event) => {
          if (event.button !== 0) return;
          startDrag(event.clientX, event.clientY);
        }}
      >
        <div>
          <h3 className="text-sm font-semibold text-cyan-200">Debug Window</h3>
          <p className="text-[11px] text-white/50">Drag by the header</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              try {
                navigator.clipboard.writeText(JSON.stringify(events, null, 2));
              } catch {}
            }}
            className="text-[11px] px-2 py-1 rounded border border-white/10 text-white/70 hover:bg-white/5"
          >
            Copy
          </button>
          <button
            onClick={() => setEvents([])}
            className="text-[11px] px-2 py-1 rounded border border-white/10 text-white/70 hover:bg-white/5"
          >
            Clear
          </button>
          <button
            onClick={() => setCollapsed(true)}
            className="text-[11px] px-2 py-1 rounded border border-white/10 text-white/70 hover:bg-white/5"
          >
            Hide
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4 text-xs">
        <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-1">
          <div>Path: <span className="text-cyan-200">{location.pathname}</span></div>
          <div>Loading: <span className="text-cyan-200">{String(loading)}</span></div>
          <div>Current User ID: <span className="text-cyan-200">{(currentUser as any)?.id || 'none'}</span></div>
          <div>Current User: <span className="text-cyan-200">{currentUser?.email || 'none'}</span></div>
          <div>Current Name: <span className="text-cyan-200">{currentUser?.name || 'none'}</span></div>
          <div>Current Provider: <span className="text-cyan-200">{(currentUser as any)?.provider || 'none'}</span></div>
          <div>Stored User: <span className="text-cyan-200">{storedUser?.email || 'none'}</span></div>
          <div>Pending Verify: <span className="text-cyan-200">{pendingVerificationEmail || 'none'}</span></div>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="text-white/70 font-medium mb-2">Identity Snapshot</div>
          <pre className="whitespace-pre-wrap break-all rounded-lg bg-white/5 p-2 border border-white/5 text-[11px] text-white/80">
            {JSON.stringify(identitySnapshot, null, 2)}
          </pre>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="text-white/70 font-medium mb-2">Storage Snapshot</div>
          <pre className="whitespace-pre-wrap break-all rounded-lg bg-white/5 p-2 border border-white/5 text-[11px] text-white/80">
            {JSON.stringify(storageSnapshot, null, 2)}
          </pre>
        </div>

        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
          <div className="text-white/70 font-medium mb-2">Event Log</div>
          <div className="space-y-2 max-h-[56vh] overflow-auto pr-1">
            {events.length === 0 ? (
              <div className="text-white/40">No events yet</div>
            ) : (
              events.map((event, index) => (
                <pre key={index} className="whitespace-pre-wrap break-all rounded-lg bg-white/5 p-2 border border-white/5 text-[11px] text-white/80">
                  {JSON.stringify(event, null, 2)}
                </pre>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthDebugPanel;
