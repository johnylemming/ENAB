import { useState, useEffect } from 'react'
import { supabase } from './supabase'

const T = {
  bg: "#FAF6F1",
  card: "#FFFFFF",
  cardBorder: "#EDE8E1",
  accent: "#D4793C",
  accentLight: "#F5E6D8",
  text: "#3D3429",
  textMid: "#8C7E6F",
  textLight: "#B5A99A",
  danger: "#D94F3D",
}

export function useSession() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
    return () => subscription.unsubscribe()
  }, [])

  return { session, loading }
}

export function AuthGate({ children }) {
  const { session, loading } = useSession()

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', background: T.bg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'JetBrains Mono', monospace", color: T.accent,
      }}>
        Загрузка...
      </div>
    )
  }

  if (!session) return <LoginScreen />

  return children
}

function LoginScreen() {
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSendCode = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
    })
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
  }

  const handleVerifyCode = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp.trim(),
      type: 'email',
    })
    setLoading(false)
    if (error) {
      setError(error.message)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: T.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 16, fontFamily: "'Nunito', -apple-system, sans-serif",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap" rel="stylesheet" />

      <div style={{
        background: T.card, borderRadius: 20, padding: '32px 24px',
        width: '100%', maxWidth: 360,
        border: `1px solid ${T.cardBorder}`,
        boxShadow: '0 2px 12px rgba(180,160,140,0.08)',
      }}>
        <div style={{
          fontSize: 28, fontWeight: 700, color: T.text,
          marginBottom: 4, textAlign: 'center',
        }}>
          💰 Бюджет
        </div>
        <p style={{ color: T.textMid, fontSize: 14, textAlign: 'center', marginBottom: 24 }}>
          Войди через email
        </p>

        {sent ? (
          <form onSubmit={handleVerifyCode}>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📬</div>
              <p style={{ color: T.text, fontSize: 15, marginBottom: 4 }}>
                Код отправлен на
              </p>
              <p style={{
                color: T.accent, fontSize: 15, fontWeight: 600,
                fontFamily: "'JetBrains Mono', monospace",
                marginBottom: 0,
              }}>
                {email}
              </p>
            </div>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              value={otp}
              onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              style={{
                width: '100%', background: T.bg,
                border: `1px solid ${T.cardBorder}`, borderRadius: 12,
                padding: '14px 16px', color: T.text, fontSize: 24,
                fontFamily: "'JetBrains Mono', monospace",
                marginBottom: 12, boxSizing: 'border-box',
                outline: 'none', textAlign: 'center', letterSpacing: '0.3em',
              }}
              autoFocus
            />
            {error && (
              <p style={{ color: T.danger, fontSize: 13, marginBottom: 12 }}>{error}</p>
            )}
            <button
              type="submit"
              disabled={otp.length !== 6 || loading}
              style={{
                width: '100%', background: T.accent, border: 'none',
                color: '#fff', borderRadius: 12, padding: '14px 24px',
                fontSize: 15, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit',
                opacity: (otp.length !== 6 || loading) ? 0.5 : 1,
              }}
            >
              {loading ? 'Проверяю...' : 'Войти'}
            </button>
            <div style={{ textAlign: 'center' }}>
              <button
                type="button"
                onClick={() => { setSent(false); setOtp(''); setError('') }}
                style={{
                  background: 'none', border: 'none', color: T.accent,
                  cursor: 'pointer', fontSize: 13, marginTop: 16,
                  fontFamily: 'inherit', textDecoration: 'underline',
                }}
              >
                Другой email
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSendCode}>
            <input
              type="email"
              placeholder="email@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={{
                width: '100%', background: T.bg,
                border: `1px solid ${T.cardBorder}`, borderRadius: 12,
                padding: '14px 16px', color: T.text, fontSize: 16,
                fontFamily: "'JetBrains Mono', monospace",
                marginBottom: 12, boxSizing: 'border-box',
                outline: 'none',
              }}
              autoFocus
            />
            {error && (
              <p style={{ color: T.danger, fontSize: 13, marginBottom: 12 }}>{error}</p>
            )}
            <button
              type="submit"
              disabled={!email.trim() || loading}
              style={{
                width: '100%', background: T.accent, border: 'none',
                color: '#fff', borderRadius: 12, padding: '14px 24px',
                fontSize: 15, fontWeight: 600, cursor: 'pointer',
                fontFamily: 'inherit',
                opacity: (!email.trim() || loading) ? 0.5 : 1,
              }}
            >
              {loading ? 'Отправляю...' : 'Получить код'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export function LogoutButton() {
  return (
    <button
      onClick={() => supabase.auth.signOut()}
      style={{
        background: 'none', border: 'none',
        color: T.textLight, cursor: 'pointer',
        fontSize: 12, fontFamily: "'JetBrains Mono', monospace",
        padding: '4px 8px',
      }}
    >
      выйти
    </button>
  )
}
