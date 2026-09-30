import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import * as Keychain from 'react-native-keychain';

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

  login: (
    email: string,
    password: string,
  ) => Promise<void>;

  logout: () => Promise<void>;
};

const API_BASE_URL =
  'http://127.0.0.1:4000';

const KEYCHAIN_SERVICE =
  'com.jogquest.auth';

const AuthContext =
  createContext<
    AuthContextValue | undefined
  >(undefined);

const AuthProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const [
    user,
    setUser,
  ] = useState<User | null>(
    null,
  );

  const [
    token,
    setToken,
  ] = useState<string | null>(
    null,
  );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const loadSession =
    useCallback(async () => {
      try {
        const credentials =
          await Keychain.getGenericPassword({
            service:
              KEYCHAIN_SERVICE,
          });

        if (!credentials) {
          return;
        }

        const sessionToken =
          credentials.password;

        const response =
          await fetch(
            `${API_BASE_URL}/api/me`,
            {
              headers: {
                Authorization:
                  `Bearer ${sessionToken}`,
              },
            },
          );

        if (!response.ok) {
          await Keychain.resetGenericPassword({
            service:
              KEYCHAIN_SERVICE,
          });

          setToken(null);
          setUser(null);

          return;
        }

        const currentUser =
          (await response.json()) as User;

        setToken(
          sessionToken,
        );

        setUser(
          currentUser,
        );
      } catch (error) {
        console.error(
          'Failed to restore session:',
          error,
        );
      } finally {
        setLoading(false);
      }
    }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const login = useCallback(
    async (
      email: string,
      password: string,
    ) => {
      const response =
        await fetch(
          `${API_BASE_URL}/api/auth/login`,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify({
              email,
              password,
            }),
          },
        );

      const data =
        (await response.json()) as {
          error?: string;
          token?: string;
          user?: User;
        };

      if (
        !response.ok ||
        !data.token ||
        !data.user
      ) {
        throw new Error(
          data.error ??
            'Login failed',
        );
      }

      await Keychain.setGenericPassword(
        data.user.email ??
          email,
        data.token,
        {
          service:
            KEYCHAIN_SERVICE,
        },
      );

      setToken(
        data.token,
      );

      setUser(
        data.user,
      );
    },
    [],
  );

  const logout =
    useCallback(async () => {
      try {
        if (token) {
          await fetch(
            `${API_BASE_URL}/api/auth/logout`,
            {
              method: 'POST',

              headers: {
                Authorization:
                  `Bearer ${token}`,
              },
            },
          );
        }
      } catch (error) {
        console.error(
          'Logout request failed:',
          error,
        );
      } finally {
        await Keychain.resetGenericPassword({
          service:
            KEYCHAIN_SERVICE,
        });

        setToken(null);
        setUser(null);
      }
    }, [token]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        logout,
      }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context =
    useContext(
      AuthContext,
    );

  if (!context) {
    throw new Error(
      'useAuth must be used inside AuthProvider',
    );
  }

  return context;
};

export default AuthProvider;
