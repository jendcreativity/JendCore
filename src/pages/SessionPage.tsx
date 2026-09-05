import { useParams } from 'react-router-dom';

export default function SessionPage() {
  const params = useParams<{ sessionId: string }>();
  const code = params.sessionId ?? '';

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">JendCore Session</h1>
        <p className="text-xl mb-2">Session Code: {code}</p>
        <p className="text-gray-400">Ready for real-time collaboration</p>
      </div>
    </div>
  );
}

