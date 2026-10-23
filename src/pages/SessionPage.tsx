import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { isValidSessionCode } from '../lib/sessionCode';
import { useLocalMedia } from '../hooks/useLocalMedia';
import { useSupabaseSignaling } from '../hooks/useSupabaseSignaling';
import { SignalEnvelope, usePeerConnection } from '../hooks/usePeerConnection';
import { useSharedDocument } from '../hooks/useSharedDocument';
import AnnotationCanvas from '../components/AnnotationCanvas';
import ChatPanel from '../components/ChatPanel';
import ShareSheet from '../components/ShareSheet';
import VideoTile from '../components/VideoTile';
import ControlBar from '../components/session/ControlBar';
import TopBar from '../components/session/TopBar';
import AnnotationToolbar from '../components/session/AnnotationToolbar';
import Stage from '../components/session/Stage';
import Sheet from '../components/session/Sheet';
import CommandPanel, { CommandTab } from '../components/session/CommandPanel';
import ParticipantsList from '../components/session/ParticipantsList';
import { Annotation, AnnotationTool } from '../lib/annotations';
import { DOC_COLOR } from '../lib/docAnnotations';
import { ChatMessage, VOICE_B64_MAX, VoiceNote, createMessage, createVoiceMessage, parseIncomingMessage } from '../lib/chat';
import DocWorkspace from '../components/workspace/DocWorkspace';
import type { DocPointerTool } from '../components/workspace/DocAnnotationLayer';

export default function SessionPage() {
  const params = useParams<{ sessionId: string }>();
  const code = params.sessionId ?? '';
  if (!isValidSessionCode(code)) return <Navigate to="/join" replace />;
  return <SessionRoom code={code} />;
}

/**
 * The live session room.
 *
 * Deliberately a separate component from `SessionPage`: a component that
 * returns early *ahead of* its hooks changes hook order between renders
 * (invalid code -> valid code), which React rejects. Keeping the redirect in
 * the wrapper means every hook below runs unconditionally on every render.
 */
function SessionRoom({ code }: { code: string }) {
  const navigate = useNavigate();
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
  // The shared-document feature: transport (data channel), meta + ops (broadcast).
  const doc = useSharedDocument(
    signaling.selfId,
    { send: signaling.send, subscribe: signaling.subscribe },
    peer.dataChannel,
    { remoteId: remotePeerId, connected: !!peer.remoteStream },
  );
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
  // Shared-document workspace: overlay visibility, the armed annotation tool
  // and the current ink colour. Screen annotations and document annotations are
  // deliberately independent modes with their own state.
  const [docOpen, setDocOpen] = useState(false);
  const [docTool, setDocTool] = useState<DocPointerTool | null>(null);
  const [docColor, setDocColor] = useState(DOC_COLOR);
  // One command panel owns Chat / Markup / People; the invite sheet stays its own.
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelTab, setPanelTab] = useState<CommandTab>('chat');
  const [showShare, setShowShare] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  // Derived chat-open state: the single source for both unread effects below,
  // exactly replacing the old `showChat` boolean.
  const chatOpen = panelOpen && panelTab === 'chat';

  // A document appearing or leaving drives the workspace: sharing one opens it
  // for everyone, closing one puts the stage back on video and drops the tool.
  useEffect(() => {
    if (doc.meta) setDocOpen(true);
    else {
      setDocOpen(false);
      setDocTool(null);
    }
  }, [doc.meta]);


  const sendChat = useCallback(
    (text: string) => {
      const msg = createMessage(signaling.selfId, text, signaling.selfName);
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

  // Voice notes ride the same chat envelope. The audio is an in-memory base64
  // blob: it is never uploaded anywhere, and it disappears with the session.
  const sendVoice = useCallback(
    (note: VoiceNote) => {
      // Bound before transport: the receipt path applies the same ceiling, so a
      // note that could not be relayed is never added to the local transcript
      // either. The recorder's 30 s / 24 kbps cap makes this unreachable in
      // practice — it is a backstop, not a user-facing limit.
      if (!note?.data || note.data.length > VOICE_B64_MAX) return;
      const msg = createVoiceMessage(signaling.selfId, note, signaling.selfName);
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
        // Validated, never trusted: a malformed or oversized payload is dropped
        // instead of entering the transcript.
        const incoming = parseIncomingMessage(payload.message);
        if (incoming) {
          setChat((prev) => (prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]));
        }
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
      if (p?.kind === 'chat' && p.message && !chatOpen) {
        if ((p.message as ChatMessage).author === signaling.selfId) return;
        setChatUnread((n) => n + 1);
      }
    });
    return unsub;
  }, [signaling, chatOpen]);

  // Reset only when Chat becomes selected/open. Switching to another tab leaves
  // the badge alone, so unread counts are never cleared by leaving Chat.
  useEffect(() => { if (chatOpen) setChatUnread(0); }, [chatOpen]);

  function endSession() {
    media.stop();
    navigate('/');
  }

  const annotateActive = tool !== null;
  const participantCount = signaling.peers.length + 1;
  const connectionLabel = peer.remoteStream
    ? 'Connected'
    : peer.connectionState === 'connecting'
      ? 'Connecting…'
      : peer.connectionState === 'disconnected'
        ? 'Reconnecting…'
        : peer.connectionState === 'failed'
          ? 'Connection failed'
          : 'Waiting for peer…';
  const isRemoteSharing = sharingPeerId === remotePeerId && !!remotePeerId;

  /**
   * Display name for a peer id. Falls back to role words so the UI never shows
   * a blank or an internal id: "You" for this user, "Remote" for a peer who has
   * not entered a name yet.
   */
  const nameOf = useCallback(
    (id: string | null): string => {
      if (!id) return '';
      if (id === signaling.selfId) return signaling.selfName.trim() || 'You';
      const peer = signaling.peers.find((p) => p.id === id);
      return peer?.name?.trim() || 'Remote';
    },
    [signaling.selfId, signaling.selfName, signaling.peers],
  );
  /** Whose screen is on the main stage, by name. */
  const sharingName = nameOf(sharingPeerId);
  const mainStream = isRemoteSharing ? peer.remoteStream : media.stream;
  const mainLabel = isRemoteSharing ? 'Remote' : 'You';
  const mainCameraEnabled = isRemoteSharing ? remoteMediaState.cameraEnabled : media.cameraEnabled;
  const mainMicEnabled = isRemoteSharing ? remoteMediaState.micEnabled : media.micEnabled;
  const pipStream = isRemoteSharing ? media.stream : peer.remoteStream;
  const pipLabel = isRemoteSharing ? 'You' : 'Remote';
  const pipCameraEnabled = isRemoteSharing ? media.cameraEnabled : remoteMediaState.cameraEnabled;
  const pipMicEnabled = isRemoteSharing ? media.micEnabled : remoteMediaState.micEnabled;
  const handleToggleAnnotate = useCallback(() => setTool((prev) => prev ? null : 'freehand'), []);

  // Panel entry points. Each key states its intent, so the panel is never left
  // "open with nothing selected": closing clears the open flag, and reopening
  // always lands on the tab that matches the control used to open it.
  const openPanel = useCallback((tab: CommandTab) => {
    setPanelTab(tab);
    setPanelOpen(true);
  }, []);
  const closePanel = useCallback(() => setPanelOpen(false), []);

  // Roster excludes self: "You" is already the roster's own row, so passing the
  // raw peer list would render the local user twice.
  const otherPeers = useMemo(
    () => signaling.peers.filter((p) => p.id !== signaling.selfId),
    [signaling.peers, signaling.selfId],
  );

  // Truthful status tone for TopBar: 'live' requires a real media session (a live
  // remote stream or a connected peer connection) — never a signaling subscription.
  const connectionStatus: 'live' | 'connecting' | 'waiting' | 'error' = signaling.error
    ? 'error'
    : peer.connectionState === 'failed'
      ? 'error'
      : peer.remoteStream || peer.connectionState === 'connected'
        ? 'live'
        : peer.connectionState === 'connecting' || peer.connectionState === 'disconnected'
          ? 'connecting'
          : 'waiting';

  return (
    <div className="fixed inset-0 flex flex-col bg-graphite-950 text-white selection:bg-[#1877F2]/30">
      {media.permissionError && (
        <div className="relative z-40 border-b border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-100 backdrop-blur">
          <div className="mx-auto max-w-3xl">
            <div className="text-xs font-bold uppercase tracking-widest text-red-200">Permission needed</div>
            <div className="mt-1 leading-snug text-red-100/90">{media.permissionError}</div>
          </div>
        </div>
      )}
      {signaling.error && (
        <div className="relative z-40 border-b border-red-500/20 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-100 backdrop-blur">
          <div className="mx-auto max-w-3xl">
            <div className="text-xs font-bold uppercase tracking-widest text-red-200">Connection problem</div>
            <div className="mt-1 leading-snug text-red-100/90">{signaling.error}</div>
          </div>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col">
        <Stage
          topBar={<TopBar code={code} connectionLabel={connectionLabel} status={connectionStatus} />}
          toolbar={
            // The Markup tab presents this same toolbar inline, so the floating
            // copy is hidden only while that tab is open (behind the panel scrim
            // it would sit dimmed and unclickable). Tool state is untouched.
            annotateActive && !(panelOpen && panelTab === 'markup') ? (
              <AnnotationToolbar tool={tool} onSelect={setTool} onClear={clearAnnotations} onClose={() => setTool(null)} />
            ) : null
          }
          corner={<VideoTile stream={pipStream} muted={isRemoteSharing} label={pipLabel} isRemote={!isRemoteSharing} cameraEnabled={pipCameraEnabled} micEnabled={pipMicEnabled} connectionState={!isRemoteSharing ? peer.connectionState : undefined} />}
        >
          <div className="absolute inset-0">
            <VideoTile stream={mainStream} muted={!isRemoteSharing} label={mainLabel} isRemote={isRemoteSharing} cameraEnabled={mainCameraEnabled} micEnabled={mainMicEnabled} connectionState={isRemoteSharing ? peer.connectionState : undefined} />
          </div>
          {sharingPeerId && (
            <div className="pointer-events-none absolute left-1/2 top-[56px] z-10 hidden -translate-x-1/2 sm:flex">
              <span className="rounded-full bg-accent-500 px-3 py-1 text-xs font-bold text-white shadow-lg">
                {sharingPeerId === signaling.selfId ? 'You are sharing' : `${sharingName} is sharing`}
              </span>
            </div>
          )}
          {sharingPeerId && (
            <div className="pointer-events-none absolute left-3 top-[92px] z-10 sm:hidden">
              <span className="rounded-full bg-accent-500 px-2.5 py-1 text-[11px] font-bold text-white shadow">
                {sharingPeerId === signaling.selfId ? 'You sharing' : `${sharingName} sharing`}
              </span>
            </div>
          )}
          {!peer.remoteStream && peer.connectionState !== 'connecting' && !isRemoteSharing && !signaling.error && (
            <div className="pointer-events-none absolute inset-x-3 bottom-[260px] z-10 flex justify-center sm:bottom-[118px]">
              <div className="rounded-2xl bg-black/55 px-4 py-3 text-center backdrop-blur border border-white/10">
                <div className="text-sm font-semibold text-white">Waiting for others to join</div>
                <div className="mt-1 text-xs text-white/70">Share code <span className="font-mono font-bold text-white">{code}</span> or send the invite link</div>
                <button type="button" onClick={() => setShowShare(true)} className="pointer-events-auto mt-2 inline-flex rounded-full bg-white px-3 py-1.5 text-xs font-bold text-ink-900 hover:bg-white/90 transition">Share invite</button>
              </div>
            </div>
          )}

          <AnnotationCanvas annotations={annotations} selfId={signaling.selfId} tool={tool} onCommit={commitAnnotation} onPatch={patchAnnotation} />
          <DocWorkspace
            doc={doc}
            selfId={signaling.selfId}
            open={docOpen}
            tool={docTool}
            color={docColor}
            onToolChange={setDocTool}
            onColorChange={setDocColor}
            onClose={() => setDocOpen(false)}
          />
        </Stage>
      </div>
      {/* Media keys go inert only while tracks are being replaced: `busy` is
          also true during the initial permission prompt, where pre-setting
          mic/camera state must stay possible — hence the stream gate. */}
      <ControlBar
        micEnabled={media.micEnabled}
        cameraEnabled={media.cameraEnabled}
        annotateActive={annotateActive}
        onToggleMic={handleToggleMic}
        onToggleCamera={handleToggleCamera}
        onToggleAnnotate={handleToggleAnnotate}
        onFlipCamera={media.flipCamera}
        busy={media.busy && !!media.stream}
        canFlip={media.canFlip}
        onOpenChat={() => openPanel('chat')}
        onOpenParticipants={() => openPanel('people')}
        onOpenTools={() => openPanel('markup')}
        toolsActive={panelOpen && panelTab === 'markup'}
        onOpenDocument={() => setDocOpen((o) => !o)}
        documentActive={docOpen && !!doc.meta}
        onOpenShare={() => setShowShare(true)}
        sharingSelf={sharingPeerId === signaling.selfId}
        onToggleShareView={toggleShare}
        onEnd={endSession}
        participantCount={participantCount}
        chatUnread={chatUnread}
      />
      <CommandPanel
        open={panelOpen}
        onClose={closePanel}
        tab={panelTab}
        onTabChange={setPanelTab}
        side="auto"
        chatUnread={chatUnread}
        peopleCount={participantCount}
        chat={
          <ChatPanel
            messages={chat}
            selfId={signaling.selfId}
            selfName={signaling.selfName}
            onSend={sendChat}
            onSendVoice={sendVoice}
            // Reusing the session's own mic track stops a voice note from
            // fighting the call for the device.
            voiceTrack={media.stream?.getAudioTracks()[0] ?? null}
          />
        }
        markup={
          <AnnotationToolbar
            variant="inline"
            tool={tool}
            onSelect={setTool}
            onClear={clearAnnotations}
            onClose={() => setTool(null)}
          />
        }
        people={
          <ParticipantsList
            code={code}
            participantCount={participantCount}
            micEnabled={media.micEnabled}
            cameraEnabled={media.cameraEnabled}
            peers={otherPeers}
            remotePeerId={remotePeerId}
            remoteConnected={!!peer.remoteStream}
            connectionState={peer.connectionState}
            selfId={signaling.selfId}
            selfName={signaling.selfName}
            onNameChange={signaling.setName}
            sharingPeerId={sharingPeerId}
            sharingSelf={sharingPeerId === signaling.selfId}
            onToggleShareView={toggleShare}
            invite={<ShareSheet url={window.location.origin + '/s/' + code} code={code} compact />}
          />
        }
      />
      <Sheet open={showShare} onClose={() => setShowShare(false)} title="Share invite">
        <div className="p-4">
          <ShareSheet url={window.location.origin + '/s/' + code} code={code} />
          <p className="mt-3 text-center text-xs leading-snug text-white/60">Anyone with the code <span className="font-mono font-bold text-white">{code}</span> can join.</p>
        </div>
      </Sheet>
    </div>
  );
}

