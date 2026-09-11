import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function GoogleCallback() {
  const [status, setStatus] = React.useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = React.useState('Authenticating...');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const accessToken = urlParams.get('access_token');
        const refreshToken = urlParams.get('refresh_token');
        const userId = urlParams.get('user_id');
        const error = urlParams.get('error');

        if (error) {
          setStatus('error');
          setMessage(error);
          setTimeout(() => {
            window.location.href = '/';
          }, 3000);
          return;
        }

        if (!accessToken || !refreshToken || !userId) {
          setStatus('error');
          setMessage('Invalid response from authentication');
          setTimeout(() => {
            window.location.href = '/';
          }, 3000);
          return;
        }

        // Store tokens in localStorage
        localStorage.setItem('accessToken', accessToken);
        localStorage.setItem('refreshToken', refreshToken);
        localStorage.setItem('user', JSON.stringify({ id: userId }));

        setStatus('success');
        setMessage('Successfully authenticated with Google');

        // Wait a moment then redirect to dashboard
        setTimeout(() => {
          window.location.href = '/';
        }, 1500);

      } catch (err) {
        console.error('Google callback error:', err);
        setStatus('error');
        setMessage(err instanceof Error ? err.message : 'Authentication failed');
        
        // Wait 3 seconds then redirect to login
        setTimeout(() => {
          window.location.href = '/';
        }, 3000);
      }
    };

    handleCallback();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="max-w-md w-full px-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-2xl shadow-xl p-8 text-center"
        >
          {status === 'loading' && (
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <Loader2 className="w-16 h-16 text-blue-600 animate-spin" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                Authenticating with Google...
              </h2>
              <p className="text-slate-600">
                Please wait while we complete your sign in
              </p>
            </div>
          )}

          {status === 'success' && (
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-green-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                Success!
              </h2>
              <p className="text-slate-600">
                {message}
              </p>
              <p className="text-sm text-slate-500">
                Redirecting to dashboard...
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center gap-4">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                <AlertCircle className="w-10 h-10 text-red-600" />
              </div>
              <h2 className="text-xl font-bold text-slate-900">
                Authentication Failed
              </h2>
              <p className="text-slate-600">
                {message}
              </p>
              <p className="text-sm text-slate-500">
                Redirecting to login page...
              </p>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}