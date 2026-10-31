import { useState, useEffect } from "react";
import { X, Zap, Key } from "lucide-react";

export function AiLimitModal() {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState({ used: null, limit: null });

  useEffect(() => {
    function onLimitReached(e) {
      setDetail(e.detail ?? {});
      setOpen(true);
    }
    window.addEventListener("ai-limit-reached", onLimitReached);
    return () => window.removeEventListener("ai-limit-reached", onLimitReached);
  }, []);

  if (!open) return null;

  function goToProfile() {
    setOpen(false);
    window.dispatchEvent(new CustomEvent("nav-to-profile-ai"));
  }

  const used  = detail.used  ?? "—";
  const limit = detail.limit ?? "—";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm p-6 relative">
        <button onClick={() => setOpen(false)}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          <X size={16} />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
            <Zap size={18} className="text-amber-500" />
          </div>
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white text-base">AI Limit Reached</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {used !== "—" && limit !== "—" ? `${used} of ${limit} free generations used this month` : "Free monthly limit reached"}
            </p>
          </div>
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-300 mb-5 leading-relaxed">
          You've used all your free AI generations for this month. You can add your own Claude API key for unlimited access, or ask your admin to upgrade your plan.
        </p>

        <div className="space-y-2">
          <button onClick={goToProfile}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors">
            <Key size={14} />
            Add my Claude API key
          </button>
          <button onClick={() => setOpen(false)}
            className="w-full py-2.5 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 text-sm font-medium rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            Dismiss
          </button>
        </div>

        <p className="text-xs text-gray-400 dark:text-gray-500 text-center mt-4">
          Go to <strong>Profile → AI</strong> to add your key or upgrade to Pro
        </p>
      </div>
    </div>
  );
}
