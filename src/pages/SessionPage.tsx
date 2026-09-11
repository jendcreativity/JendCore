import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { isValidSessionCode } from '../lib/sessionCode';
import { useLocalMedia } from '../hooks/useLocalMedia';
import { useSupabaseSignaling } from '../hooks/useSupabaseSignaling';
import { SignalEnvelope, usePeerConnection } from '../hooks/usePeerConnection';
import AnnotationCanvas from '../components/AnnotationCanvas';
import ChatPanel from '../components/ChatPanel';
import SessionControls from '../components/SessionControls';
import ShareSheet from '../components/ShareSheet';
import SidePanel from '../components/SidePanel';
import VideoTile from '../components/VideoTile';
import { Annotation, AnnotationTool } from '../lib/annotations';
import { ChatMessage, createMessage } from '../lib/chat';


export default function SessionPage() {
  const params = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const code = params.sessionId ?? '';
  
  if (!isValidSessionCode(code)) {
    return <Navigate to="/join" replace />;
  }

  const media = useLocalMedia(true);
  const signaling = useSupabaseSignaling(code);
  const [remotePeerId, setRemotePeerId] = useState<string | null>(null);

  useEffect(() => {
    const others = signaling.peers.filter((p) => p.id !== signaling.selfId);
    if (others.length > 0) {
      others.sort((a, b) => (a.id < b.id ? -1 : 1));
      const next = others[0].id;
      setRemotePeerId((prev) => (prev !== next ? next : prev));
    }
  }, [signaling.peers, signaling.selfId]);

  useEffect(() => {
    if (remotePeerId) return;
    let cancelled = false;
    signaling.waitForPeer().then((id: string) => {
      if (!cancelled) setRemotePeerId(id);
    });
    return () => { cancelled = true; };
  }, [signaling, remotePeerId]);

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

  const [sharingPeerId, setSharingPeerId] = useState<string | null>(null);
  const [remoteMediaState, setRemoteMediaState] = useState<{ micEnabled: boolean; cameraEnabled: boolean }>({ micEnabled: true, cameraEnabled: true });

  const toggleShare = useCallback(() => {
    const newSharingState = sharingPeerId === signaling.selfId ? null : signaling.selfId;
    setSharingPeerId(newSharingState);
    
    // Broadcast who's sharing
    signaling.send({
      from: signaling.selfId,
      to: '*',
      kind: 'sharing',
      payload: newSharingState,
    });
  }, [signaling, sharingPeerId]);

  // Listen for sharing + remote mic/camera state
  useEffect(() => {
    const unsub = signaling.subscribe((msg: SignalEnvelope) => {
      if (msg.kind === 'sharing') {
        setSharingPeerId(msg.payload as string | null);
      } else if (msg.kind === 'media-state') {
        if (msg.from === signaling.selfId) return;
        const p = msg.payload as { micEnabled: boolean; cameraEnabled: boolean };
        if (typeof p?.micEnabled === 'boolean' || typeof p?.cameraEnabled === 'boolean') {
          setRemoteMediaState({
            micEnabled: typeof p.micEnabled === 'boolean' ? p.micEnabled : true,
            cameraEnabled: typeof p.cameraEnabled === 'boolean' ? p.cameraEnabled : true,
          });
        }
      }
    });
    return unsub;
  }, [signaling]);

  // Wrapped toggles that also broadcast state so remote sees same mute/camera view
  const handleToggleMic = useCallback(() => {
    const next = !media.micEnabled;
    media.toggleMic();
    signaling.send({
      from: signaling.selfId,
      to: '*',
      kind: 'media-state',
      payload: { micEnabled: next, cameraEnabled: media.cameraEnabled },
    });
  }, [media, signaling]);

  const handleToggleCamera = useCallback(() => {
    const next = !media.cameraEnabled;
    media.toggleCamera();
    signaling.send({
      from: signaling.selfId,
      to: '*',
      kind: 'media-state',
      payload: { micEnabled: media.micEnabled, cameraEnabled: next },
    });
  }, [media, signaling]);

  // When a new peer joins, sync our current mic/camera state
  useEffect(() => {
    if (!remotePeerId) return;
    signaling.send({
      from: signaling.selfId,
      to: remotePeerId,
      kind: 'media-state',
      payload: { micEnabled: media.micEnabled, cameraEnabled: media.cameraEnabled },
    });
  }, [remotePeerId]); // eslint-disable-line react-hooks/exhaustive-deps


  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [tool, setTool] = useState<AnnotationTool | null>(null);
  const [sidebarTab, setSidebarTab] = useState<'annotations' | 'chat'>('annotations');
  const [sidePanelOpen, setSidePanelOpen] = useState(false);


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
      const payload = msg.payload as any;
      if (payload?.kind === 'chat') {
        setChat((prev) => [...prev, payload.message]);
      } else if (payload?.kind === 'annotation-add') {
        setAnnotations((prev) => [...prev, payload.annotation]);
      } else if (payload?.kind === 'annotation-patch') {
        const { id, patch } = payload;
        setAnnotations((prev) =>
          prev.map((a) => (a.id === id ? ({ ...a, ...patch } as Annotation) : a)),
        );
      } else if (payload?.kind === 'annotation-clear') {
        setAnnotations([]);
      }
    });
    return unsub;
  }, [signaling]);

  function endSession() {
    media.stop();
    navigate('/');
  }

  return (
    <div className="fixed inset-0 flex flex-col bg-ink-900 safe-top safe-bottom">
      {media.permissionError && (
        <div className="bg-red-500/20 text-red-100 border-b-2 border-red-500/50 px-4 py-4 text-sm font-medium">
          <div className="font-semibold mb-1">Permission needed</div>
          <div>{media.permissionError}</div>
        </div>
      )}
      <div className="flex-1 flex flex-col sm:flex-row min-h-0">
        {/* Video area - full screen on mobile */}
        <div className="flex-1 relative flex items-center justify-center bg-black min-h-0 sm:min-h-full order-2 sm:order-1">
          {/* Main video: show whoever is sharing, or default to your camera */}
          {sharingPeerId === remotePeerId ? (
            <VideoTile
              stream={peer.remoteStream}
              muted={false}
              label="Remote Sharing"
              isRemote
              cameraEnabled={remoteMediaState.cameraEnabled}
              micEnabled={remoteMediaState.micEnabled}
              connectionState={peer.connectionState}
            />
          ) : (
            <VideoTile
              stream={media.stream}
              muted
              label="You"
              isRemote={false}
              cameraEnabled={media.cameraEnabled}
              micEnabled={media.micEnabled}
              connectionState={peer.connectionState}
            />
          )}

          {/* Corner video: show the other person, or your camera if remote is sharing */}
          <div className="absolute bottom-20 right-3 sm:top-4 sm:right-4 sm:bottom-auto w-20 sm:w-32 md:w-40 aspect-[3/4] rounded-lg sm:rounded-xl overflow-hidden border-2 border-ink-700 shadow-lg z-20">
            {sharingPeerId === remotePeerId ? (
              <VideoTile
                stream={media.stream}
                muted
                label="You"
                isRemote={false}
                cameraEnabled={media.cameraEnabled}
                micEnabled={media.micEnabled}
                connectionState={peer.connectionState}
              />
            ) : (
              <VideoTile
                stream={peer.remoteStream}
                muted={false}
                label="Remote"
                isRemote
                cameraEnabled={remoteMediaState.cameraEnabled}
                micEnabled={remoteMediaState.micEnabled}
                connectionState={peer.connectionState}
              />
            )}
          </div>

          {/* Sharing indicator badge */}
          {sharingPeerId && (
            <div className="absolute top-3 left-3 sm:top-4 sm:left-4 px-2 py-1 sm:px-3 sm:py-2 bg-blue-500 text-white rounded-lg font-semibold text-xs sm:text-sm z-20">
              {sharingPeerId === signaling.selfId ? '🔴 You are sharing' : '👁️ Remote is sharing'}
            </div>
          )}

          {/* Connection status badge - single source, mirrored for both peers */}
          <div className="absolute top-3 right-3 sm:top-4 sm:right-4 px-2 py-1 bg-black/60 text-white rounded-full text-xs z-20">
            {peer.remoteStream ? '● Connected' : peer.connectionState === 'connecting' ? '○ Connecting…' : '○ Waiting for peer…'}
          </div>

          {/* Mobile panel toggle button */}
          <button
            onClick={() => setSidePanelOpen(!sidePanelOpen)}
            className="sm:hidden absolute bottom-3 left-3 px-3 py-2 bg-accent-500 hover:bg-accent-600 text-white rounded-lg font-semibold text-sm z-20 transition"
            aria-label="Toggle controls panel"
          >
            ⚙️ Controls
          </button>

          <AnnotationCanvas
            annotations={annotations}
            selfId={signaling.selfId}
            tool={tool}
            onCommit={commitAnnotation}
            onPatch={patchAnnotation}
          />
        </div>

        {/* Desktop sidebar - always visible */}
        <div className="hidden sm:flex flex-col bg-ink-800 border-t sm:border-t-0 sm:border-l border-ink-700 min-h-0 w-80 md:w-96">
          <SessionControls
            micEnabled={media.micEnabled}
            cameraEnabled={media.cameraEnabled}
            onToggleMic={handleToggleMic}
            onToggleCamera={handleToggleCamera}
            onFlipCamera={media.flipCamera}
            isSharing={sharingPeerId === signaling.selfId}
            onToggleShare={toggleShare}
            annotationTool={tool}
            onSelectTool={setTool}
            sidebarTab={sidebarTab}
            onSelectTab={setSidebarTab}
            onClearAnnotations={clearAnnotations}
            onEnd={endSession}
          />
          {/* Sidebar tabs */}
          <div className="flex border-b border-ink-700">
            <button
              onClick={() => setSidebarTab('annotations')}
              className={`flex-1 px-3 py-2 text-xs font-semibold transition ${
                sidebarTab === 'annotations'
                  ? 'bg-accent-500 text-white'
                  : 'bg-ink-700 text-ink-300 hover:bg-ink-600'
              }`}
            >
              Annotations
            </button>
            <button
              onClick={() => setSidebarTab('chat')}
              className={`flex-1 px-3 py-2 text-xs font-semibold transition ${
                sidebarTab === 'chat'
                  ? 'bg-accent-500 text-white'
                  : 'bg-ink-700 text-ink-300 hover:bg-ink-600'
              }`}
            >
              Chat
            </button>
          </div>

          {/* Invite share — inside session so user can re-share anytime */}
          <div className="p-3 border-t border-ink-700">
            <ShareSheet url={`${window.location.origin}/s/${code}`} code={code} compact />
          </div>

          {/* Tab content */}
          {sidebarTab === 'annotations' ? (
            <div className="flex-1 flex flex-col min-h-0 p-3 border-t border-ink-700">
              <div className="flex-1 overflow-y-auto space-y-2">
                {annotations.length === 0 ? (
                  <div className="text-xs text-ink-500">No annotations yet</div>
                ) : (
                  annotations.map((a) => (
                    <div key={a.id} className="text-xs bg-ink-700 p-2 rounded text-ink-200">
                      <div className="font-semibold">{a.tool}</div>
                      <div className="text-ink-400">by {a.author}</div>
                    </div>
                  ))
                )}
              </div>
              <button
                onClick={clearAnnotations}
                className="mt-2 px-2 py-1 bg-red-500/20 text-red-300 rounded text-xs hover:bg-red-500/30 transition"
              >
                Clear All
              </button>
            </div>
          ) : (
            <ChatPanel
              messages={chat}
              selfId={signaling.selfId}
              onSend={sendChat}
            />
          )}
        </div>

        {/* Mobile collapsible side panel */}
        <SidePanel isOpen={sidePanelOpen} onClose={() => setSidePanelOpen(false)}>
          <SessionControls
            micEnabled={media.micEnabled}
            cameraEnabled={media.cameraEnabled}
            onToggleMic={handleToggleMic}
            onToggleCamera={handleToggleCamera}
            onFlipCamera={media.flipCamera}
            isSharing={sharingPeerId === signaling.selfId}
            onToggleShare={toggleShare}
            annotationTool={tool}
            onSelectTool={setTool}
            sidebarTab={sidebarTab}
            onSelectTab={setSidebarTab}
            onClearAnnotations={clearAnnotations}
            onEnd={endSession}
          />
          <div className="p-3 border-y border-ink-700">
            <ShareSheet url={`${window.location.origin}/s/${code}`} code={code} compact />
          </div>
          {/* Sidebar tabs */}
          <div className="flex border-b border-ink-700">
            <button
              onClick={() => setSidebarTab('annotations')}
              className={`flex-1 px-3 py-2 text-xs font-semibold transition ${
                sidebarTab === 'annotations'
                  ? 'bg-accent-500 text-white'
                  : 'bg-ink-700 text-ink-300 hover:bg-ink-600'
              }`}
            >
              Annotations
            </button>
            <button
              onClick={() => setSidebarTab('chat')}
              className={`flex-1 px-3 py-2 text-xs font-semibold transition ${
                sidebarTab === 'chat'
                  ? 'bg-accent-500 text-white'
                  : 'bg-ink-700 text-ink-300 hover:bg-ink-600'
              }`}
            >
              Chat
            </button>
          </div>

          {/* Tab content */}
          {sidebarTab === 'annotations' ? (
            <div className="flex-1 flex flex-col min-h-0 p-3 border-t border-ink-700">
              <div className="flex-1 overflow-y-auto space-y-2">
                {annotations.length === 0 ? (
                  <div className="text-xs text-ink-500">No annotations yet</div>
                ) : (
                  annotations.map((a) => (
                    <div key={a.id} className="text-xs bg-ink-700 p-2 rounded text-ink-200">
                      <div className="font-semibold">{a.tool}</div>
                      <div className="text-ink-400">by {a.author}</div>
                    </div>
                  ))
                )}
              </div>
              <button
                onClick={clearAnnotations}
                className="mt-2 px-2 py-1 bg-red-500/20 text-red-300 rounded text-xs hover:bg-red-500/30 transition"
              >
                Clear All
              </button>
            </div>
          ) : (
            <ChatPanel
              messages={chat}
              selfId={signaling.selfId}
              onSend={sendChat}
            />
          )}
        </SidePanel>
      </div>
    </div>
  );
}

