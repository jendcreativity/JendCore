import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { isValidSessionCode } from '../lib/sessionCode';
import { useLocalMedia } from '../hooks/useLocalMedia';
import { useSignaling } from '../hooks/useSignalingFactory';
import {
  SignalEnvelope,
  usePeerConnection,
} from '../hooks/usePeerConnection';
import { getSupabase } from '../lib/supabase';
import AnnotationCanvas from '../components/AnnotationCanvas';
import ChatPanel from '../components/ChatPanel';
import SessionControls from '../components/SessionControls';
import VideoTile from '../components/VideoTile';
import { Annotation, AnnotationTool } from '../lib/annotations';
import { ChatMessage, createMessage } from '../lib/chat';

/**
 * The live session room.
 *
 * Responsibilities:
 *   - Acquire local camera/mic.
 *   - Open a signalling channel for the session id.
 *   - Establish a peer connection with whoever else joins.
 *   - Synchronise chat messages and annotations through the same channel.
 *   - Expose session controls (mic, camera, annotate, chat, end).
 *   - Persist session metadata to Supabase if configured.
 */
export default function SessionPage() {
  const params = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const code = params.sessionId ?? '';
  if (!isValidSessionCode(code)) {
    return <Navigate to="/join" replace />;
  }

  const media = useLocalMedia(true);
  const signaling = useSignaling(code);

  const [remotePeerId, setRemotePeerId] = useState<string | null>(null);

  // Persist session to Supabase on mount
  useEffect(() => {
    const persistSession = async () => {
      const supabase = getSupabase();
      if (!supabase) return;

      try {
        // Try to insert the session record. If it already exists (due to unique constraint),
        // Supabase will return an error which we can safely ignore.
        await supabase.from('sessions').insert({
          code,
          metadata: {
            startedAt: new Date().toISOString(),
          },
        });
      } catch (err) {
        // Session already exists or other error; log but don't block
        console.debug('[jendcore] Session insert:', err);
      }
    };

    persistSession();
  }, [code]);

  // Resolve the remote peer once they announce themselves.
  useEffect(() => {
    let cancelled = false;
    signaling.waitForPeer().then((id) => {
      if (!cancelled) setRemotePeerId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [signaling]);

  // The "initiator" is the peer with the lexicographically smaller id,
  // which gives a deterministic, symmetric decision without a server.
  const initiator = useMemo(() => {
    if (!remotePeerId) return false;
    return signaling.selfId < remotePeerId;
  }, [signaling.selfId, remotePeerId]);

  const peer = usePeerConnection({
    selfId: signaling.selfId,
    remoteId: remotePeerId ?? '__no_remote__',
    initiator,
    send: signaling.send,
    subscribe: signaling.subscribe,
    localStream: media.stream,
  });

  // ── Chat state ───────────────────────────────────────────────
  const [chat, setChat] = useState<ChatMessage[]>([]);

  const sendChat = useCallback(
    (text: string) => {
      const msg = createMessage(signaling.selfId, text);
      setChat((prev) => [...prev, msg]);
      signaling.send({
        from: signaling.selfId,
        to: '*',
        kind: 'hello', // unused channel; we piggyback via dedicated envelope kind
        payload: { kind: 'chat', message: msg },
      } as unknown as SignalEnvelope);
    },
    [signaling],
  );

  // ── Annotation state ─────────────────────────────────────────
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [tool, setTool] = useState<AnnotationTool | null>(null);

  const commitAnnotation = useCallback(
    (a: Annotation) => {
      setAnnotations((prev) => [...prev, a]);
      signaling.send({
        from: signaling.selfId,
        to: '*',
        kind: 'hello',
        payload: { kind: 'annotation-add', annotation: a },
      } as unknown as SignalEnvelope);
    },
    [signaling],
  );

  const patchAnnotation = useCallback(
    (id: string, patch: Partial<Annotation>) => {
      setAnnotations((prev) =>
        prev.map((a) => (a.id === id ? ({ ...a, ...patch } as Annotation) : a)),
      );
      signaling.send({
        from: signaling.selfId,
        to: '*',
        kind: 'hello',
        payload: { kind: 'annotation-patch', id, patch },
      } as unknown as SignalEnvelope);
    },
    [signaling],
  );

  const clearAnnotations = useCallback(() => {
    setAnnotations([]);
    signaling.send({
      from: signaling.selfId,
      to: '*',
      kind: 'hello',
      payload: { kind: 'annotation-clear' },
    } as unknown as SignalEnvelope);
  }, [signaling]);

  // Listen for piggybacked chat / annotation events.
  useEffect(() => {
    return signaling.subscribe((env) => {
      const payload = env.payload as
        | {
            kind: 'chat' | 'annotation-add' | 'annotation-patch' | 'annotation-clear';
            [k: string]: unknown;
          }
        | undefined;
      if (!payload || typeof payload !== 'object') return;
      if (payload.kind === 'chat') {
        const msg = payload.message as ChatMessage;
        setChat((prev) =>
          prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
        );
      } else if (payload.kind === 'annotation-add') {
        const a = payload.annotation as Annotation;
        setAnnotations((prev) =>
          prev.some((x) => x.id === a.id) ? prev : [...prev, a],
        );
      } else if (payload.kind === 'annotation-patch') {
        const id = payload.id as string;
        const patch = payload.patch as Partial<Annotation>;
        setAnnotations((prev) =>
          prev.map((a) => (a.id === id ? ({ ...a, ...patch } as Annotation) : a)),
        );
      } else if (payload.kind === 'annotation-clear') {
        setAnnotations([]);
      }
    });
  }, [signaling]);

  // ── UI state ─────────────────────────────────────────────────
  const [chatOpen, setChatOpen] = useState(false);
  const [annotationsOpen, setAnnotationsOpen] = useState(true);

  function endSession() {
    media.stop();
    
    // Mark session as ended in Supabase if configured
    const supabase = getSupabase();
    if (supabase) {
      supabase.from('sessions').update({ ended_at: new Date().toISOString() }).eq('code', code).then().catch((err) => {
        console.debug('[jendcore] Session end update:', err);
      });
    }
    
    navigate('/');
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-ink-900 safe-top safe-bottom">
      {/* Permission error banner */}
      {media.permissionError && (
        <div className="bg-red-500/20 text-red-100 border-b-2 border-red-500/50 px-4 py-4 text-sm font-medium">
          <div className="font-semibold mb-1">Permission needed</div>
          <div>{media.permissionError}</div>
        </div>
      )}

      <div className="flex-1 flex flex-col sm:flex-row min-h-0">
        {/* Main video + annotation stage */}
        <div className="flex-1 relative flex items-center justify-center bg-black min-h-0 sm:min-h-full">
          <VideoTile
            stream={peer.remoteStream}
            muted={false}
            label="Remote"
            isRemote
            connectionState={peer.connectionState}
          />

          {/* Self preview (smaller on mobile) */}
          <div className="absolute top-3 right-3 sm:top-4 sm:right-4 w-24 sm:w-32 md:w-40 aspect-[3/4] rounded-lg sm:rounded-xl overflow-hidden border-2 border-ink-700 shadow-lg z-20">
            <VideoTile
              stream={media.stream}
              muted
              label="You"
              cameraEnabled={media.cameraEnabled}
            />
          </div>

          {/* Annotation overlay */}
          <AnnotationCanvas
            annotations={annotations}
            selfId={signaling.selfId}
            tool={annotationsOpen ? tool : null}
            onCommit={commitAnnotation}
            onPatch={patchAnnotation}
          />

          {/* Connection badge */}
          <div className="absolute top-3 left-3 sm:top-4 sm:left-4 z-20">
            <ConnectionBadge state={peer.connectionState} />
          </div>
        </div>

        {/* Side: chat (mobile overlay, desktop sidebar) */}
        {chatOpen && (
          <ChatPanel
            messages={chat}
            selfId={signaling.selfId}
            onSend={sendChat}
            onClose={() => setChatOpen(false)}
          />
        )}
      </div>

      <SessionControls
        micEnabled={media.micEnabled}
        cameraEnabled={media.cameraEnabled}
        onToggleMic={media.toggleMic}
        onToggleCamera={media.toggleCamera}
        onFlipCamera={media.flipCamera}
        onToggleChat={() => setChatOpen((v) => !v)}
        chatOpen={chatOpen}
        annotationTool={tool}
        onSelectTool={(t) => setTool(t)}
        onToggleAnnotations={() => setAnnotationsOpen((v) => !v)}
        annotationsOpen={annotationsOpen}
        onClearAnnotations={clearAnnotations}
        onEnd={endSession}
      />
    </div>
  );
}

function ConnectionBadge({ state }: { state: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    idle: { label: 'Idle', cls: 'bg-ink-700 text-ink-200' },
    connecting: { label: 'Connecting…', cls: 'bg-amber-500/20 text-amber-200' },
    connected: { label: 'Connected', cls: 'bg-emerald-500/20 text-emerald-200' },
    disconnected: { label: 'Reconnecting…', cls: 'bg-amber-500/20 text-amber-200' },
    failed: { label: 'Connection failed', cls: 'bg-red-500/20 text-red-200' },
    closed: { label: 'Closed', cls: 'bg-ink-700 text-ink-200' },
  };
  const info = map[state] ?? map.idle;
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${info.cls}`}
    >
      <span className="h-2 w-2 rounded-full bg-current" />
      {info.label}
    </span>
  );
}
