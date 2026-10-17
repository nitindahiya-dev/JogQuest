
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { COLORS, SPACING, TYPOGRAPHY } from '../theme';

type AlertButtonStyle = 'default' | 'cancel' | 'destructive';

type AlertButton = {
  text?: string;
  onPress?: () => void | Promise<void>;
  style?: AlertButtonStyle;
};

type AlertOptions = {
  cancelable?: boolean;
  onDismiss?: () => void;
};

type AlertRequest = {
  title: string;
  message?: string;
  buttons: AlertButton[];
  options?: AlertOptions;
};

type AlertContextValue = {
  alert: (
    title: string,
    message?: string,
    buttons?: AlertButton[],
    options?: AlertOptions,
  ) => void;
};

const AlertContext = createContext<AlertContextValue | null>(null);

export function JogQuestAlertProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [request, setRequest] = useState<AlertRequest | null>(null);
  const [busy, setBusy] = useState(false);

  const dismiss = useCallback(() => {
    if (busy) return;

    const onDismiss = request?.options?.onDismiss;
    setRequest(null);
    onDismiss?.();
  }, [busy, request]);

  const alert = useCallback<AlertContextValue['alert']>(
    (title, message, buttons, options) => {
      setBusy(false);
      setRequest({
        title,
        message,
        buttons:
          buttons && buttons.length > 0
            ? buttons
            : [{ text: 'OK', style: 'default' }],
        options,
      });
    },
    [],
  );

  const contextValue = useMemo(() => ({ alert }), [alert]);

  const handleButton = async (button: AlertButton) => {
    if (busy) return;

    setBusy(true);

    try {
      setRequest(null);
      await button.onPress?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertContext.Provider value={contextValue}>
      {children}

      <Modal
        visible={request !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={dismiss}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => {
            if (request?.options?.cancelable !== false) dismiss();
          }}
        >
          <Pressable
            style={styles.dialog}
            onPress={event => event.stopPropagation()}
          >
            <View style={styles.accent} />

            <Text style={styles.title}>{request?.title}</Text>

            {!!request?.message && (
              <Text style={styles.message}>{request.message}</Text>
            )}

            <View
              style={[
                styles.actions,
                request?.buttons.length === 1 && styles.singleAction,
              ]}
            >
              {request?.buttons.map((button, index) => {
                const destructive = button.style === 'destructive';
                const cancel = button.style === 'cancel';

                return (
                  <Pressable
                    key={`${button.text ?? 'button'}-${index}`}
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => void handleButton(button)}
                    style={({ pressed }) => [
                      styles.button,
                      cancel && styles.cancelButton,
                      destructive && styles.destructiveButton,
                      pressed && styles.buttonPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.buttonText,
                        cancel && styles.cancelText,
                        destructive && styles.destructiveText,
                      ]}
                    >
                      {button.text ?? 'OK'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </AlertContext.Provider>
  );
}

export function useJogQuestAlert() {
  const context = useContext(AlertContext);

  if (!context) {
    throw new Error(
      'useJogQuestAlert must be used inside JogQuestAlertProvider.',
    );
  }

  return context.alert;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    padding: SPACING.lg,
  },
  dialog: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
    overflow: 'hidden',
  },
  accent: {
    height: 3,
    backgroundColor: COLORS.accent,
    borderRadius: 3,
    marginBottom: SPACING.lg,
  },
  title: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '800',
    marginBottom: SPACING.sm,
  },
  message: {
    color: COLORS.textMuted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: SPACING.lg,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  singleAction: {
    flexDirection: 'row',
  },
  button: {
    minHeight: 44,
    minWidth: 90,
    paddingHorizontal: SPACING.lg,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: COLORS.surfaceLight,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  destructiveButton: {
    backgroundColor: COLORS.danger,
  },
  buttonText: {
    color: '#000000',
    fontSize: 14,
    fontWeight: '800',
  },
  cancelText: {
    color: COLORS.text,
  },
  destructiveText: {
    color: '#FFFFFF',
  },
  buttonPressed: {
    opacity: 0.72,
  },
});
