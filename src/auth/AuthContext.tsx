import { API_BASE_URL } from '../config/api';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import * as Keychain from 'react-native-keychain';
import AsyncStorage from '@react-native-async-storage/async-storage';

type User = {
  id: string;
  username: string;
  display_name: string;
  email: string | null;
  avatar_url: string | null;
};

type AuthContextValue = {
  user: User | null;
  token: string | null;
  loading: boolean;
  updateUser: (updatedUser: User) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const KEYCHAIN_SERVICE = 'com.jogquest.auth';
const CACHED_USER_KEY = '@jogquest/cached-user';

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const updateUser = useCallback((updatedUser: User) => {
    setUser(updatedUser);

    // Keep the local profile in sync for the next app launch.
    void AsyncStorage.setItem(
      CACHED_USER_KEY,
      JSON.stringify(updatedUser),
    ).catch(error => {
      console.warn('Could not cache user profile:', error);
    });
  }, []);

  const loadSession = useCallback(async () => {
    let sessionToken: string | null = null;

    try {
      // Read the secure token and cached profile together.
      const [credentials, cachedUserJson] = await Promise.all([
        Keychain.getGenericPassword({ service: KEYCHAIN_SERVICE }),
        AsyncStorage.getItem(CACHED_USER_KEY),
      ]);

      sessionToken = credentials ? credentials.password : null;

      let cachedUser: User | null = null;

      if (cachedUserJson) {
        try {
          const parsed: unknown = JSON.parse(cachedUserJson);

          if (
            parsed &&
            typeof parsed === 'object' &&
            'id' in parsed &&
            typeof parsed.id === 'string' &&
            'username' in parsed &&
            typeof parsed.username === 'string'
          ) {
            cachedUser = parsed as User;
          } else {
            await AsyncStorage.removeItem(CACHED_USER_KEY);
          }
        } catch {
          await AsyncStorage.removeItem(CACHED_USER_KEY);
        }
      }

      if (!sessionToken) {
        setToken(null);
        setUser(null);
        await AsyncStorage.removeItem(CACHED_USER_KEY);
        return;
      }

      // Show the returning user's screen without waiting for the API.
      setToken(sessionToken);

      if (cachedUser) {
        setUser(cachedUser);
      }

      // Release the splash while server verification runs below.
      setLoading(false);

      try {
        const response = await fetch(`${API_BASE_URL}/api/me`, {
          headers: {
            Authorization: `Bearer ${sessionToken}`,
          },
        });

        if (response.status === 401) {
          // Only an explicit unauthorized response invalidates this session.
          await Keychain.resetGenericPassword({
            service: KEYCHAIN_SERVICE,
          });
          await AsyncStorage.removeItem(CACHED_USER_KEY);
          setToken(null);
          setUser(null);
          return;
        }

        if (!response.ok) {
          // A server error is not proof that the session is invalid.
          console.warn(
            'Session verification returned HTTP',
            response.status,
          );
          return;
        }

        const currentUser = (await response.json()) as User;

        // Ignore a response if the user has logged out or changed sessions.
        if (sessionToken !== activeSessionToken.current) {
          return;
        }

        setUser(currentUser);

        await AsyncStorage.setItem(
          CACHED_USER_KEY,
          JSON.stringify(currentUser),
        );
      } catch (error) {
        // Keep the cached session for temporary network failures.
        console.warn('Session verification unavailable:', error);
      }
    } catch (error) {
      console.error('Failed to restore session:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const activeSessionToken = React.useRef<string | null>(null);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    const data = (await response.json()) as {
      error?: string;
      token?: string;
      user?: User;
    };

    if (!response.ok || !data.token || !data.user) {
      throw new Error(data.error ?? 'Login failed');
    }

    // Save credentials securely before treating login as successful.
    await Keychain.setGenericPassword(
      data.user.email ?? email,
      data.token,
      { service: KEYCHAIN_SERVICE },
    );

    await AsyncStorage.setItem(
      CACHED_USER_KEY,
      JSON.stringify(data.user),
    );

    activeSessionToken.current = data.token;
    setToken(data.token);
    setUser(data.user);
    setLoading(false);
  }, []);

  const logout = useCallback(async () => {
    const tokenToLogout = token;

    // Invalidate local state immediately.
    activeSessionToken.current = null;
    setToken(null);
    setUser(null);

    try {
      if (tokenToLogout) {
        await fetch(`${API_BASE_URL}/api/auth/logout`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokenToLogout}`,
          },
        });
      }
    } catch (error) {
      console.warn('Logout request failed:', error);
    } finally {
      await Promise.all([
        Keychain.resetGenericPassword({ service: KEYCHAIN_SERVICE }),
        AsyncStorage.removeItem(CACHED_USER_KEY),
      ]);
    }
  }, [token]);

  // Keep the session marker in sync with restored credentials.
  useEffect(() => {
    if (token) {
      activeSessionToken.current = token;
    }
  }, [token]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        updateUser,
        login,
        logout,
      }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
};

export default AuthProvider;
