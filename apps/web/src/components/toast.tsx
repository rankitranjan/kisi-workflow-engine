import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

type ToastVariant = "success" | "error";

type ToastItem = {
  id: string;
  message: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  showToast: (message: string, variant: ToastVariant) => void;
};

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const TOAST_DURATION_MS = 3000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timeouts = useRef(new Map<string, number>());
  const nextId = useRef(0);

  const dismiss = useCallback((id: string) => {
    const timeout = timeouts.current.get(id);
    if (timeout !== undefined) {
      window.clearTimeout(timeout);
      timeouts.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant) => {
      const id = `toast-${nextId.current}`;
      nextId.current += 1;
      setToasts((current) => [...current, { id, message, variant }]);
      const timeout = window.setTimeout(() => {
        dismiss(id);
      }, TOAST_DURATION_MS);
      timeouts.current.set(id, timeout);
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timeouts.current;
    return () => {
      for (const timeout of pending.values()) {
        window.clearTimeout(timeout);
      }
      pending.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-viewport" role="region" aria-label="Notifications">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`toast toast-${toast.variant}`}
            role={toast.variant === "error" ? "alert" : "status"}
          >
            <p>{toast.message}</p>
            <button
              type="button"
              className="toast-dismiss"
              aria-label={`Dismiss ${toast.message}`}
              onClick={() => dismiss(toast.id)}
            >
              Close
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (value === undefined) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return value;
}
