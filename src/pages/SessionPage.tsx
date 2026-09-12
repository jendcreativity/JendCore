import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { isValidSessionCode } from '../lib/sessionCode';
import { useLocalMedia } from '../hooks/useLocalMedia';
import { useSupabaseSignaling } from '../hooks/useSupabaseSignaling';
import { SignalEnvelope, usePeerConnection } from '../hooks/usePeerConnection';
import AnnotationCanvas from '../components/AnnotationCanvas';
import ChatPanel from '../components/ChatPanel';
import ShareSheet from '../components/ShareSheet';
import VideoTile from '../components/VideoTile';
import ControlBar from '../components/session/ControlBar';
import TopBar from '../components/session/TopBar';
import AnnotationToolbar from '../components/session/AnnotationToolbar';
import Stage from '../components/session/Stage';
import Sheet from '../components/session/Sheet';
import { Annotation, AnnotationTool } from '../lib/annotations';
import { ChatMessage, createMessage } from '../lib/chat';
import { IconUsers } from '../components/Icon';

export default function SessionPage() {
  const params = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const code = params.sessionId ?? '';
  if (!isValidSessionCode(code)) return <Navigate to="/join" replace />;
  const media = useLocalMedia(true);
  const signaling = useSupabaseSignaling(code);
  const [remotePeerId, setRemotePeerId] = useState<string | null>(null);
  useEffect(() => {
    const others = signaling.peers.filter((p) => p.id !== signaling.selfId);
    if (others.length > 0) {
      others.sort((a, b) => (a.id < b.id ? -1 : 1));
      setRemotePeerId((prev) => (prev !== others[0].id ? others[0].id : prev));
    }
  }, [signaling.peers, signaling.selfId]);
  useEffect(() => {
    if (remotePeerId) return;
    let cancelled = false;
    signaling.waitForPeer().then((id: string) => { if (!cancelled) setRemotePeerId(id); });
    return () => { cancelled = true; };
  }, [signaling, remotePeerId]);
  const initiator = useMemo(() => remotePeerId ? signaling.selfId < remotePeerId : false, [signaling.selfId, remotePeerId]);
  const peer = usePeerConnection({ selfId: signaling.selfId, remoteId: remotePeerId ?? '__no_remote__', initiator, send: signaling.send, subscribe: signaling.subscribe, localStream: media.stream });
  const [sharingPeerId, setSharingPeerId] = useState<string | null>(null);
  const [remoteMediaState, setRemoteMediaState] = useState({ micEnabled: true, cameraEnabled: true });
  const toggleShare = useCallback(() => {
    const next = sharingPeerId === signaling.selfId ? null : signaling.selfId;
    setSharingPeerId(next);
    signaling.send({ from: signaling.selfId, to: '*', kind: 'sharing', payload: next });
  }, [signaling, sharingPeerId]);
  useEffect(() => {
    const unsub = signaling.subscribe((msg: SignalEnvelope) => {
      if (msg.kind === 'sharing') setSharingPeerId(msg.payload as string | null);
      else if (msg.kind === 'media-state') {
        if (msg.from === signaling.selfId) return;
        const p = msg.payload as { micEnabled: boolean; cameraEnabled: boolean };
        if (typeof p?.micEnabled === 'boolean' || typeof p?.cameraEnabled === 'boolean') {
          setRemoteMediaState({ micEnabled: typeof p.micEnabled === 'boolean' ? p.micEnabled : true, cameraEnabled: typeof p.cameraEnabled === 'boolean' ? p.cameraEnabled : true });
        }
      }
    });
    return unsub;
  }, [signaling]);
  const handleToggleMic = useCallback(() => {
    const next = !media.micEnabled; media.toggleMic();
    signaling.send({ from: signaling.selfId, to: '*', kind: 'media-state', payload: { micEnabled: next, cameraEnabled: media.cameraEnabled } });
  }, [media, signaling]);
  const handleToggleCamera = useCallback(() => {
    const next = !media.cameraEnabled; media.toggleCamera();
    signaling.send({ from: signaling.selfId, to: '*', kind: 'media-state', payload: { micEnabled: media.micEnabled, cameraEnabled: next } });
  }, [media, signaling]);
  useEffect(() => {
    if (!remotePeerId) return;
    signaling.send({ from: signaling.selfId, to: remotePeerId, kind: 'media-state', payload: { micEnabled: media.micEnabled, cameraEnabled: media.cameraEnabled } });
  }, [remotePeerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [tool, setTool] = useState<AnnotationTool | null>(null);
  const [showChat, setShowChat] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);


  const sendChat = useCallback(
    (text: string) => {
      const msg = createMessage(signaling.selfId, text);
      setChat((prev) => [...prev, msg]);
      signaling.send({
        from: signaling.selfId,
        to: '*',
        kind: 'hello',
        payload: { kind: 'chat', message: msg },
      });
    },
    [signaling],
  );

  const commitAnnotation = useCallback(
    (a: Annotation) => {
      setAnnotations((prev) => [...prev, a]);
      signaling.send({
        from: signaling.selfId,
        to: '*',
        kind: 'hello',
        payload: { kind: 'annotation-add', annotation: a },
      });
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
      });
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
    });
  }, [signaling]);

  useEffect(() => {
    const unsub = signaling.subscribe((msg: SignalEnvelope) => {
      const payload = msg.payload as unknown as { kind?: string; message?: ChatMessage; annotation?: Annotation; id?: string; patch?: Partial<Annotation> };
      if (payload?.kind === 'chat' && payload.message) {
        const incoming = payload.message as ChatMessage;
        setChat((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]));
      } else if (payload?.kind === 'annotation-add' && payload.annotation) {
        const incoming = payload.annotation as Annotation;
        setAnnotations((prev) => (prev.some((a) => a.id === incoming.id) ? prev : [...prev, incoming]));
      } else if (payload?.kind === 'annotation-patch' && payload.id) {
        const { id, patch } = payload as { id: string; patch: Partial<Annotation> };
        setAnnotations((prev) => prev.map((a) => (a.id === id ? ({ ...a, ...patch } as Annotation) : a)));
      } else if (payload?.kind === 'annotation-clear') {
        setAnnotations([]);
      }
    });
    return unsub;
  }, [signaling]);

  // Track unread chat when panel closed — ignore self-echo so sender does not get unread for own message
  useEffect(() => {
    const unsub = signaling.subscribe((msg: SignalEnvelope) => {
      const p = msg.payload as unknown as { kind?: string; message?: ChatMessage };
      if (p?.kind === 'chat' && p.message && !showChat) {
        if ((p.message as ChatMessage).author === signaling.selfId) return;
        setChatUnread((n) => n + 1);
      }
    });
    return unsub;
  }, [signaling, showChat]);

  useEffect(() => { if (showChat) setChatUnread(0); }, [showChat]);

  function endSession() {
    media.stop();
    navigate('/');
  }

  const annotateActive = tool !== null;
  const participantCount = signaling.peers.length + 1;
  const connectionLabel = peer.remoteStream ? 'Connected' : peer.connectionState === 'connecting' ? 'Connecting…' : 'Waiting for peer…';
  const isRemoteSharing = sharingPeerId === remotePeerId && !!remotePeerId;
  const mainStream = isRemoteSharing ? peer.remoteStream : media.stream;
  const mainLabel = isRemoteSharing ? 'Remote' : 'You';
  const mainCameraEnabled = isRemoteSharing ? remoteMediaState.cameraEnabled : media.cameraEnabled;
  const mainMicEnabled = isRemoteSharing ? remoteMediaState.micEnabled : media.micEnabled;
  const pipStream = isRemoteSharing ? media.stream : peer.remoteStream;
  const pipLabel = isRemoteSharing ? 'You' : 'Remote';
  const pipCameraEnabled = isRemoteSharing ? media.cameraEnabled : remoteMediaState.cameraEnabled;
  const pipMicEnabled = isRemoteSharing ? media.micEnabled : remoteMediaState.micEnabled;
  const handleToggleAnnotate = useCallback(() => setTool((prev) => prev ? null : 'freehand'), []);

  return (
    <div className="fixed inset-0 flex flex-col bg-[#070d1a] text-white selection:bg-[#1877F2]/30">
      {media.permissionError && (
        <div className="relative z-40 border-b border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-100 backdrop-blur">
          <div className="mx-auto max-w-3xl">
            <div className="text-xs font-bold uppercase tracking-widest text-red-200">Permission needed</div>
            <div className="mt-1 leading-snug text-red-100/90">{media.permissionError}</div>
          </div>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col">
        <Stage
          topBar={<TopBar code={code} connectionLabel={connectionLabel} />}
          toolbar={annotateActive ? <AnnotationToolbar tool={tool} onSelect={setTool} onClear={clearAnnotations} onClose={() => setTool(null)} /> : null}
          corner={<VideoTile stream={pipStream} muted={!isRemoteSharing} label={pipLabel} isRemote={!isRemoteSharing} cameraEnabled={pipCameraEnabled} micEnabled={pipMicEnabled} connectionState={!isRemoteSharing ? peer.connectionState : undefined} />}
        >
          <div className="absolute inset-0">
            <VideoTile stream={mainStream} muted={!isRemoteSharing} label={mainLabel} isRemote={isRemoteSharing} cameraEnabled={mainCameraEnabled} micEnabled={mainMicEnabled} connectionState={isRemoteSharing ? peer.connectionState : undefined} />
          </div>
          {sharingPeerId && (
            <div className="pointer-events-none absolute left-1/2 top-[56px] z-10 hidden -translate-x-1/2 sm:flex">
              <span className="rounded-full bg-[#1877F2] px-3 py-1 text-xs font-bold text-white shadow-lg">{sharingPeerId === signaling.selfId ? 'You are sharing' : 'Remote is sharing'}</span>
            </div>
          )}
          {sharingPeerId && (
            <div className="pointer-events-none absolute left-3 top-[92px] z-10 sm:hidden">
              <span className="rounded-full bg-[#1877F2] px-2.5 py-1 text-[11px] font-bold text-white shadow">{sharingPeerId === signaling.selfId ? 'You sharing' : 'Remote sharing'}</span>
            </div>
          )}
          {!peer.remoteStream && peer.connectionState !== 'connecting' && !isRemoteSharing && (
            <div className="pointer-events-none absolute inset-x-3 bottom-[128px] z-10 flex justify-center sm:bottom-[118px]">
              <div className="rounded-2xl bg-black/55 px-4 py-3 text-center backdrop-blur border border-white/10">
                <div className="text-sm font-semibold text-white">Waiting for others to join</div>
                <div className="mt-1 text-xs text-white/70">Share code <span className="font-mono font-bold text-white">{code}</span> or send the invite link</div>
                <button type="button" onClick={() => setShowShare(true)} className="pointer-events-auto mt-2 inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-bold text-ink-900 hover:bg-white/90 transition">Share invite</button>
              </div>
            </div>
          )}

          <AnnotationCanvas annotations={annotations} selfId={signaling.selfId} tool={tool} onCommit={commitAnnotation} onPatch={patchAnnotation} />
        </Stage>
      </div>
      <ControlBar micEnabled={media.micEnabled} cameraEnabled={media.cameraEnabled} annotateActive={annotateActive} onToggleMic={handleToggleMic} onToggleCamera={handleToggleCamera} onToggleAnnotate={handleToggleAnnotate} onFlipCamera={media.flipCamera} onOpenChat={() => setShowChat(true)} onOpenParticipants={() => setShowParticipants(true)} onOpenShare={() => setShowShare(true)} onEnd={endSession} participantCount={participantCount} chatUnread={chatUnread} />
      <Sheet open={showChat} onClose={() => setShowChat(false)} title="Chat" side={typeof window !== 'undefined' && window.innerWidth < 640 ? 'bottom' : 'right'}>
        <ChatPanel messages={chat} selfId={signaling.selfId} onSend={sendChat} onClose={() => setShowChat(false)} />
      </Sheet>
      <Sheet open={showParticipants} onClose={() => setShowParticipants(false)} title="Participants">
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-white/60">
            <IconUsers size={14} />
            <span>{participantCount} in session</span>
            <span className="ml-auto rounded-full bg-white/10 px-2 py-0.5 font-mono text-[11px] text-white/80">{code}</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-3 rounded-2xl bg-white/[0.06] border border-white/10 px-3 py-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1877F2] text-xs font-bold text-white">You</div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold leading-none text-white">You</div>
                <div className="text-xs text-white/60">{media.cameraEnabled ? 'Camera on' : 'Camera off'} • {media.micEnabled ? 'Mic on' : 'Muted'}</div>
              </div>
              <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-bold text-emerald-300">You</span>
            </div>
            {signaling.peers.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-2xl bg-white/[0.06] border border-white/10 px-3 py-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white">{p.id.slice(0, 2).toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold leading-none text-white">{p.id === remotePeerId ? 'Remote' : 'Participant'}</div>
                  <div className="text-xs text-white/60">{p.id.slice(0, 8)} • joined {new Date(p.joinedAt).toLocaleTimeString()}</div>
                </div>
                <span className={'rounded-full px-2 py-1 text-[10px] font-bold ' + (p.id === remotePeerId && peer.remoteStream ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-white/60')}>{p.id === remotePeerId ? (peer.remoteStream ? 'Connected' : peer.connectionState) : 'In session'}</span>
              </div>
            ))}
            {signaling.peers.length === 0 && (
              <div className="rounded-2xl border border-dashed border-white/15 px-3 py-6 text-center text-sm text-white/60">No one else yet. Share the invite to bring someone in.</div>
            )}
          </div>
          <div className="rounded-2xl bg-white/[0.06] border border-white/10 p-3">
            <ShareSheet url={window.location.origin + '/s/' + code} code={code} compact />
          </div>
          <button type="button" onClick={toggleShare} className={'w-full rounded-xl px-3 py-3 text-sm font-bold transition ' + (sharingPeerId === signaling.selfId ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-[#1877F2] text-white hover:bg-[#0F5FCC]')}>{sharingPeerId === signaling.selfId ? 'Stop sharing' : 'Share my view'}</button>
        </div>
      </Sheet>
      <Sheet open={showShare} onClose={() => setShowShare(false)} title="Share invite">
        <div className="p-4">
          <ShareSheet url={window.location.origin + '/s/' + code} code={code} />
          <p className="mt-3 text-center text-xs leading-snug text-white/60">Anyone with the code <span className="font-mono font-bold text-white">{code}</span> can join.</p>
        </div>
      </Sheet>
    </div>
  );
}

