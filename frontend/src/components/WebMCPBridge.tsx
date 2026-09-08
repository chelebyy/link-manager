import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from './ui/button';
import { AlertDialog, AlertDialogContent, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from './ui/alert-dialog';
import { createWebMCPTools, registerWebMCP, type ImportPreview, type ModelContext, type ViewInput } from '../lib/webmcp';

interface PendingImport extends ImportPreview { finish(approved: boolean): void }

export function WebMCPBridge({ onNavigate }: { onNavigate(view: ViewInput): void }) {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(() => {
    try { return localStorage.getItem('link-manager:webmcp-enabled') !== 'false'; }
    catch { return true; }
  });
  const [status, setStatus] = useState('Kontrol ediliyor');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState<PendingImport | null>(null);
  const pendingRef = useRef<PendingImport | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    let disposed = false;
    const confirmImport = (preview: ImportPreview, signal: AbortSignal) => new Promise<boolean>((resolve) => {
      if (signal.aborted || pendingRef.current) { resolve(false); return; }
      let settled = false;
      const finish = (approved: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal.removeEventListener('abort', cancel);
        pendingRef.current = null;
        if (!disposed) setPending(null);
        resolve(approved && !signal.aborted);
      };
      const cancel = () => finish(false);
      const timeout = window.setTimeout(cancel, 5 * 60 * 1000);
      signal.addEventListener('abort', cancel, { once: true });
      const request = { ...preview, finish };
      pendingRef.current = request;
      setPending(request);
    });
    const start = async () => {
      await Promise.resolve();
      if (disposed) return;
      setPending(null);
      if (!enabled) { setStatus('Kapalı'); return; }
      if (!context || typeof context.registerTool !== 'function') { setStatus('Tarayıcı desteklemiyor'); return; }
      setStatus('Bağlanıyor');
      try {
        const tools = createWebMCPTools({
          navigate: onNavigate, confirmImport,
          notify: text => { if (!disposed) setMessage(text); },
          refresh: async () => {
            await Promise.all(['resources', 'categories', 'resource-types'].map(key => queryClient.invalidateQueries({ queryKey: [key] })));
          },
        }, controller.signal);
        await registerWebMCP(context, tools, controller.signal);
        if (!disposed) setStatus('Hazır');
      } catch {
        controller.abort();
        if (!disposed) setStatus('Bağlantı kurulamadı');
      }
    };
    void start();
    return () => { disposed = true; controller.abort(); pendingRef.current?.finish(false); };
  }, [enabled, onNavigate, queryClient]);

  const previous = pending ? {
    resourceTypes: pending.existing.resourceTypes.filter(row => pending.payload.resourceTypes.some(next => next.id === row.id)),
    categories: pending.existing.categories.filter(row => pending.payload.categories.some(next => next.id === row.id)),
    resources: pending.existing.resources.filter(row => pending.payload.resources.some(next => next.id === row.id)),
  } : null;

  return <>
    <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span role="status">WebMCP: {status}</span>
      <Button size="sm" variant="outline" onClick={() => {
        pendingRef.current?.finish(false);
        setPending(null);
        const next = !enabled;
        setEnabled(next);
        try { localStorage.setItem('link-manager:webmcp-enabled', String(next)); }
        catch { setMessage('Tercih kaydedilemedi; değişiklik yalnızca bu sekmede geçerli.'); }
      }}>
        {enabled ? 'AI erişimini kapat' : 'AI erişimini aç'}
      </Button>
      {message && <span role="status">{message}</span>}
    </div>
    <AlertDialog open={!!pending} onOpenChange={open => { if (!open) pendingRef.current?.finish(false); }}>
      <AlertDialogContent>
        <AlertDialogTitle>JSON içe aktarmayı onayla</AlertDialogTitle>
        <AlertDialogDescription>
          Yapay zekâ aşağıdaki verileri içe aktarmak istiyor. Aynı kimlikteki kayıtların alanları değiştirilecek; dosyada bulunmayan kayıtlar korunacak. İptal ederseniz hiçbir veri yazılmaz. Onay beş dakika sonra sona erer.
        </AlertDialogDescription>
        {pending && previous && <>
          <ul className="text-sm space-y-1">
            <li>Kart: {pending.payload.resourceTypes.length} (mevcut: {previous.resourceTypes.length})</li>
            <li>Kategori: {pending.payload.categories.length} (mevcut: {previous.categories.length})</li>
            <li>Kaynak: {pending.payload.resources.length} (mevcut: {previous.resources.length})</li>
          </ul>
          <details><summary>Değiştirilecek mevcut kayıtlar</summary><pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(previous, null, 2)}</pre></details>
          <details open><summary>İçe aktarılacak JSON</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(pending.payload, null, 2)}</pre></details>
        </>}
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => pendingRef.current?.finish(false)}>İptal</AlertDialogCancel>
          <AlertDialogAction onClick={() => pendingRef.current?.finish(true)}>Onayla ve içe aktar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
