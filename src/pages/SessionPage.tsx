import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { isValidSessionCode } from '../lib/sessionCode';
import { useLocalMedia } from '../hooks/useLocalMedia';
import { useSignaling } from '../hooks/useSignaling';
import { SignalEnvelope, usePeerConnection } from '../hooks/usePeerConnection';
import AnnotationCanvas from '../components/AnnotationCanvas';
import ChatPanel from '../components/ChatPanel';
import SessionControls from '../components/SessionControls';
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
  const signaling = useSignaling(code);
  const [remotePeerId, setRemotePeerId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    signaling.waitForPeer().then((id: string) => {
      if (!cancelled) setRemotePeerId(id);
    });
    return () => { cancelled = true; };
  }, [signaling]);

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

  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [tool, setTool] = useState<AnnotationTool | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [annotationsOpen, setAnnotationsOpen] = useState(true);

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
        <div className="flex-1 relative flex items-center justify-center bg-black min-h-0 sm:min-h-full">
          <VideoTile
            stream={peer.remoteStream}
            muted={false}
            label="Remote"
            isRemote
            connectionState={peer.connectionState}
          />
          <div className="absolute top-3 right-3 sm:top-4 sm:right-4 w-24 sm:w-32 md:w-40 aspect-[3/4] rounded-lg sm:rounded-xl overflow-hidden border-2 border-ink-700 shadow-lg z-20">
            <VideoTile
              stream={media.stream}
              muted
              label="You"
              isRemote={false}
              connectionState={peer.connectionState}
            />
          </div>
          {annotationsOpen && (
            <AnnotationCanvas
              annotations={annotations}
              selfId={signaling.selfId}
              tool={tool}
              onCommit={commitAnnotation}
              onPatch={patchAnnotation}
            />
          )}
        </div>
        <div className="flex flex-col bg-ink-800 border-l border-ink-700 min-h-0">
          <SessionControls
            code={code}
            micEnabled={media.micEnabled}
            cameraEnabled={media.cameraEnabled}
            onToggleMic={media.toggleMic}
            onToggleCamera={media.toggleCamera}
            annotationTool={tool}
            onSelectAnnotationTool={setTool}
            annotationsOpen={annotationsOpen}
            onToggleAnnotations={setAnnotationsOpen}
            chatOpen={chatOpen}
            onToggleChat={setChatOpen}
            onEndSession={endSession}
          />
          {chatOpen ? (
            <ChatPanel
              messages={chat}
              selfId={signaling.selfId}
              onSendMessage={sendChat}
            />
          ) : (
            annotationsOpen && (
              <div className="flex-1 flex flex-col min-h-0 p-3 border-t border-ink-700">
                <div className="text-xs font-semibold text-ink-400 mb-2">Annotations</div>
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
            )
          )}
        </div>
      </div>
    </div>
  );
}

