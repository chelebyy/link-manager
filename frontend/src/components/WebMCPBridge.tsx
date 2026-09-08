import { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { createWebMCPTools, registerWebMCP, type ModelContext, type ViewInput } from '../lib/webmcp';

export function WebMCPBridge({ onNavigate }: { onNavigate(view: ViewInput): void }) {
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem('link-manager:webmcp-enabled') === 'true'; }
    catch { return false; }
  });
  const [status, setStatus] = useState('Kontrol ediliyor');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    let disposed = false;
    const start = async () => {
      await Promise.resolve();
      if (disposed) return;
      if (!enabled) { setStatus('Kapalı'); return; }
      if (!context || typeof context.registerTool !== 'function') { setStatus('Tarayıcı desteklemiyor'); return; }
      setStatus('Bağlanıyor');
      try {
        const tools = createWebMCPTools({
          navigate: onNavigate,
          notify: text => { if (!disposed) setMessage(text); },
        }, controller.signal);
        await registerWebMCP(context, tools, controller.signal);
        if (!disposed) setStatus('Hazır');
      } catch {
        controller.abort();
        if (!disposed) setStatus('Bağlantı kurulamadı');
      }
    };
    void start();
    return () => { disposed = true; controller.abort(); };
  }, [enabled, onNavigate]);

  return <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
    <span role="status">WebMCP: {status}</span>
    <Button size="sm" variant="outline" onClick={() => {
      const next = !enabled;
      setEnabled(next);
      setMessage('');
      try { localStorage.setItem('link-manager:webmcp-enabled', String(next)); }
      catch { setMessage('Tercih kaydedilemedi; değişiklik yalnızca bu sekmede geçerli.'); }
    }}>
      {enabled ? 'AI erişimini kapat' : 'AI erişimini aç'}
    </Button>
    {message && <span role="status">{message}</span>}
  </div>;
}
