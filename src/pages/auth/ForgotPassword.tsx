import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../../config/firebase';
import { useLanguage } from '../../contexts/LanguageContext';
import LanguageSwitcher from '../../components/common/LanguageSwitcher';
import Container from '../../components/layout/Container';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const { t } = useLanguage();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await sendPasswordResetEmail(auth, email, {
        url: window.location.origin + '/login',
        handleCodeInApp: false,
      });
      
      setSuccess(true);
      console.log('✅ Password reset email sent to:', email);
    } catch (err: any) {
      console.error('Password reset error:', err);
      
      // User-friendly error messages
      if (err.code === 'auth/user-not-found') {
        setError('No account found with this email address');
      } else if (err.code === 'auth/invalid-email') {
        setError('Invalid email address');
      } else if (err.code === 'auth/too-many-requests') {
        setError('Too many requests. Please try again later');
      } else {
        setError('Failed to send reset email. Please try again');
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-app-primary flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        {/* Language Switcher */}
        <div className="absolute top-4 right-4">
          <LanguageSwitcher />
        </div>

        <Container className="max-w-md">
          <div className="sm:mx-auto sm:w-full sm:max-w-md">
            {/* Success Icon */}
            <div className="flex justify-center">
              <div className="w-20 h-20 rounded-full bg-chart-cyan/20 flex items-center justify-center">
                <svg className="w-10 h-10 text-chart-cyan" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
            </div>

            <h2 className="mt-6 text-center text-2xl font-bold text-text-primary">
              Check Your Email
            </h2>
            <p className="mt-2 text-center text-sm text-text-secondary">
              We've sent a password reset link to <span className="font-semibold text-text-primary">{email}</span>
            </p>
          </div>

          <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
            <div className="bg-app-card py-8 px-4 shadow-card sm:rounded-2xl sm:px-10 border border-white/10">
              <div className="space-y-4">
                <div className="bg-app-blue/10 border border-app-blue/30 rounded-xl p-4">
                  <h3 className="text-sm font-semibold text-app-blue mb-2">Next Steps:</h3>
                  <ol className="text-sm text-text-secondary space-y-2 list-decimal list-inside">
                    <li>Check your email inbox</li>
                    <li>Click the password reset link</li>
                    <li>Enter your new password</li>
                    <li>Login with your new password</li>
                  </ol>
                </div>

                <p className="text-xs text-text-muted text-center">
                  Didn't receive the email? Check your spam folder or try again
                </p>

                <div className="flex flex-col gap-3">
                  <button
                    onClick={() => setSuccess(false)}
                    className="w-full py-3 px-4 border border-white/10 rounded-xl text-sm font-semibold text-text-primary bg-app-secondary hover:bg-white/10 transition-all"
                  >
                    Try Another Email
                  </button>

                  <Link
                    to="/login"
                    className="w-full py-3 px-4 text-center rounded-xl text-sm font-semibold text-white bg-gradient-primary hover:shadow-button-hover hover:-translate-y-0.5 transition-all"
                  >
                    Back to Login
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </Container>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app-primary flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      {/* Language Switcher */}
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>

      <Container className="max-w-md">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          {/* Logo */}
          <div className="flex justify-center">
            <div className="w-24 h-24 rounded-2xl overflow-hidden shadow-card bg-gradient-primary p-1">
              <div className="w-full h-full bg-app-card rounded-xl flex items-center justify-center">
                <span className="text-5xl font-bold text-white">N</span>
              </div>
            </div>
          </div>
          <h2 className="mt-6 text-center text-3xl font-bold text-text-primary">
            Reset Password
          </h2>
          <p className="mt-2 text-center text-sm text-text-secondary">
            Enter your email address and we'll send you a link to reset your password
          </p>
        </div>

        <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
          <div className="bg-app-card py-8 px-4 shadow-card sm:rounded-2xl sm:px-10 border border-white/10">
            <form className="space-y-6" onSubmit={handleSubmit}>
              {/* Error Alert */}
              {error && (
                <div className="bg-chart-pink/10 border border-chart-pink/30 text-chart-pink px-4 py-3 rounded-xl text-sm">
                  {error}
                </div>
              )}

              {/* Email Field */}
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-text-primary mb-2">
                  Email Address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none block w-full px-4 py-3 bg-app-secondary border border-white/10 rounded-xl text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-app-blue focus:border-transparent transition-all"
                  placeholder="Enter your email"
                />
              </div>

              {/* Submit Button */}
              <div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center py-4 px-8 border border-transparent rounded-xl shadow-button text-base font-semibold text-white bg-gradient-primary hover:shadow-button-hover hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-app-blue focus:ring-offset-app-card disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 transition-all duration-300"
                >
                  {loading ? (
                    <span className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Sending...
                    </span>
                  ) : (
                    'Send Reset Link'
                  )}
                </button>
              </div>
            </form>

            {/* Back to Login Link */}
            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/10" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-app-card text-text-muted">Remember your password?</span>
                </div>
              </div>

              <div className="mt-6">
                <Link
                  to="/login"
                  className="w-full flex justify-center py-4 px-8 border-2 border-app-blue rounded-xl text-base font-semibold text-app-blue bg-transparent hover:bg-app-blue/10 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-app-blue focus:ring-offset-app-card transition-all duration-300"
                >
                  Back to Login
                </Link>
              </div>
            </div>
          </div>
        </div>
      </Container>
    </div>
  );
}
