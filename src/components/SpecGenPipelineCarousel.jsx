import { useState } from "react";
import { ChevronLeft, ChevronRight, FileText, Database, Layers, ShieldCheck, Target, Sparkles, CheckCircle2 } from "lucide-react";

const NODE_INFO = {
  documents: {
    Icon: FileText,
    color: "text-blue-600 dark:text-blue-400",
    bg: "bg-blue-50 dark:bg-blue-900/30",
    border: "border-blue-200 dark:border-blue-700",
    dot: "bg-blue-600",
    description: "Attach case documents (PDFs, specs, requirements) that Claude reads as context for spec generation.",
    tasks: ["Upload project specification docs", "Attach requirement PDFs", "Add SAP-related reference materials"],
  },
  sap_connection: {
    Icon: Database,
    color: "text-green-600 dark:text-green-400",
    bg: "bg-green-50 dark:bg-green-900/30",
    border: "border-green-200 dark:border-green-700",
    dot: "bg-green-600",
    description: "Verify live SAP system connection and retrieve installed modules and system capabilities.",
    tasks: ["Validate SAP RFC connectivity", "Retrieve installed module list", "Confirm system access level"],
  },
  compiled_context: {
    Icon: Layers,
    color: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-50 dark:bg-violet-900/30",
    border: "border-violet-200 dark:border-violet-700",
    dot: "bg-violet-600",
    description: "Review and analyze the assembled prompt context — docs, SAP data, and additional notes — before generation.",
    tasks: ["Compile documents and SAP data", "Review context completeness", "Validate token budget within limits"],
  },
  sap_verification: {
    Icon: ShieldCheck,
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-50 dark:bg-amber-900/30",
    border: "border-amber-200 dark:border-amber-700",
    dot: "bg-amber-600",
    description: "Run SAP content analysis to validate the request against SAP best practices and object dependencies.",
    tasks: ["Check SAP object dependencies", "Validate configuration consistency", "Flag SAP best practice gaps"],
  },
  proposal_validation: {
    Icon: Target,
    color: "text-purple-600 dark:text-purple-400",
    bg: "bg-purple-50 dark:bg-purple-900/30",
    border: "border-purple-200 dark:border-purple-700",
    dot: "bg-purple-600",
    description: "Score and validate the proposal quality and functional coverage before generating the full spec.",
    tasks: ["Score proposal completeness", "Verify functional area coverage", "Validate scope boundaries"],
  },
  generate_specs: {
    Icon: Sparkles,
    color: "text-blue-700 dark:text-blue-300",
    bg: "bg-blue-50 dark:bg-blue-900/30",
    border: "border-blue-300 dark:border-blue-700",
    dot: "bg-blue-700",
    description: "AI generates Spec A, B, C, D covering functional and technical specifications for the SAP implementation.",
    tasks: ["Generate functional specification", "Generate technical specification", "Create configuration guide"],
  },
  approval: {
    Icon: CheckCircle2,
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-50 dark:bg-emerald-900/30",
    border: "border-emerald-200 dark:border-emerald-700",
    dot: "bg-emerald-600",
    description: "Review generated specs across multiple iterations, send for client approval, and track sign-off status.",
    tasks: ["Review and iterate on generated specs", "Submit spec package for client sign-off", "Track approval status and feedback"],
  },
};

export function SpecGenPipelineCarousel({ stages }) {
  const [activeIdx, setActiveIdx] = useState(0);
  if (!stages?.length) return null;

  const count = stages.length;
  const stage = stages[activeIdx];
  const info = NODE_INFO[stage?.type] ?? {
    Icon: Layers,
    color: "text-gray-500 dark:text-gray-400",
    bg: "bg-gray-50 dark:bg-gray-800",
    border: "border-gray-200 dark:border-gray-600",
    dot: "bg-gray-500",
    description: stage?.label ?? "",
    tasks: [],
  };
  const { Icon } = info;

  return (
    <div className="space-y-3 w-1/2 min-w-[260px]">
      <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Pipeline preview</p>

      {/* Step pill row */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
        {stages.map((s, i) => {
          const ni = NODE_INFO[s.type];
          const isCurrent = i === activeIdx;
          const isOff = !s.enabled;
          return (
            <button key={s.type} onClick={() => setActiveIdx(i)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all border ${
                isOff
                  ? "border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40 text-gray-300 dark:text-gray-600"
                  : isCurrent
                    ? "border-[#1A4B8C] bg-[#1A4B8C] text-white shadow-sm"
                    : "border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:border-blue-300"
              }`}>
              <span className="font-bold text-[10px]">{i + 1}</span>
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>

      {/* Detail card */}
      <div className={`relative rounded-2xl border-2 p-5 transition-all ${
        stage.enabled
          ? info.border + " bg-white dark:bg-gray-800"
          : "border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/40"
      }`}>
        {!stage.enabled && (
          <span className="absolute top-3 right-3 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500">
            Disabled
          </span>
        )}

        <div className="flex items-start gap-4">
          <div className={`flex-shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${stage.enabled ? info.bg : "bg-gray-100 dark:bg-gray-700"}`}>
            <Icon className={`w-6 h-6 ${stage.enabled ? info.color : "text-gray-300 dark:text-gray-500"}`} />
          </div>

          <div className="flex-1 min-w-0">
            <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded-md mb-1 ${
              stage.enabled ? info.bg + " " + info.color : "bg-gray-100 dark:bg-gray-700 text-gray-400"
            }`}>
              Step {activeIdx + 1} of {count}
            </span>
            <h3 className={`font-bold text-base mb-2 ${
              stage.enabled ? "text-gray-900 dark:text-gray-100" : "text-gray-400 dark:text-gray-500 line-through"
            }`}>
              {stage.label}
            </h3>
            <p className={`text-sm leading-relaxed mb-3 ${
              stage.enabled ? "text-gray-600 dark:text-gray-300" : "text-gray-400 dark:text-gray-500"
            }`}>
              {info.description}
            </p>

            {info.tasks.length > 0 && (
              <div>
                <p className={`text-[11px] font-semibold uppercase tracking-wide mb-1.5 ${
                  stage.enabled ? "text-gray-400 dark:text-gray-500" : "text-gray-300 dark:text-gray-600"
                }`}>
                  Required checks
                </p>
                <ul className="space-y-1">
                  {info.tasks.map((task, ti) => (
                    <li key={ti} className="flex items-start gap-2">
                      <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${stage.enabled ? info.dot : "bg-gray-200 dark:bg-gray-600"}`} />
                      <span className={`text-xs ${stage.enabled ? "text-gray-600 dark:text-gray-300" : "text-gray-400 dark:text-gray-500"}`}>
                        {task}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Navigation footer */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100 dark:border-gray-700">
          <button onClick={() => setActiveIdx(p => Math.max(0, p - 1))} disabled={activeIdx === 0}
            className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <ChevronLeft size={14} /> Previous
          </button>
          <div className="flex gap-1 items-center">
            {stages.map((_, i) => (
              <button key={i} onClick={() => setActiveIdx(i)}
                className={`h-1.5 rounded-full transition-all ${i === activeIdx ? "w-4 bg-[#1A4B8C]" : "w-1.5 bg-gray-200 dark:bg-gray-600 hover:bg-gray-400"}`} />
            ))}
          </div>
          <button onClick={() => setActiveIdx(p => Math.min(count - 1, p + 1))} disabled={activeIdx === count - 1}
            className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            Next <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
